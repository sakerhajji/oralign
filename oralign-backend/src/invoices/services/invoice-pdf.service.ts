import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  CompanyBillingSettings,
  Payment,
  PaymentMethod,
  PaymentRecordStatus,
  Prisma,
} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer, { Browser } from 'puppeteer-core';
import { CompanyBillingSettingsService } from '../../quotations/services/company-billing-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '../../common/exceptions/app.exception';
import {
  getInvoiceLabels,
  InvoiceLabels,
  InvoiceLanguage,
  pickInvoiceTranslation,
} from './invoice-i18n';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

type JsonRecord = Record<string, unknown>;

export interface InvoiceLineRow {
  description: string;
  note?: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface InvoiceTotalLine {
  label: string;
  value: string;
  /** Visual treatment: dark final row for totals, green row for paid-amount. */
  kind?: 'normal' | 'final' | 'paid';
}

/**
 * Hydrated payment shape required by the renderer. Mirrors the
 * `findUniqueOrThrow` include block in `loadPaymentForRender`.
 *
 * Kept as a manual interface rather than a Prisma `Payment &
 * GetPayload<…>` so the TypeScript surface is documented for the few
 * fields we actually consume — the rest of the include payload is
 * intentionally invisible to the rest of the service.
 */
/**
 * The slice of a Payment the renderer actually consumes. Declaring it
 * as a `Pick` (instead of the full `Payment`) lets the treatment-fee
 * invoice path — which has no Payment row at all — synthesise this view
 * straight from the order's inline `treatmentFee*` columns without
 * fabricating the dozen unrelated Payment fields.
 */
export type InvoicePaymentView = Pick<
  Payment,
  | 'id'
  | 'amount'
  | 'status'
  | 'paymentMethod'
  | 'transactionId'
  | 'paidAt'
  | 'createdAt'
  | 'invoiceNumber'
>;

export interface InvoiceRenderPayload {
  payment: InvoicePaymentView;
  quotation: {
    id: string;
    currency: string;
    tvaRate: number;
    totalTtc: number;
    packName: string | null;
    // Prisma surfaces JSON columns as `JsonValue` which spans
    // primitives + arrays + objects + null. We narrow at the render
    // site (via `as JsonRecord | null`) — keeping the type loose here
    // so the include block from `loadPaymentForRender` slots in
    // without an extra cast.
    companySnapshot: Prisma.JsonValue | null;
    clinicSnapshot: Prisma.JsonValue | null;
    order: {
      orderCode: string;
      doctor: {
        id: string;
        fullName: string;
        email: string;
        phone: string | null;
        dentistProfile: {
          clinicName: string;
          clinicAddress: string | null;
          city: string | null;
          country: string | null;
          clinicPhone: string | null;
          clinicEmail: string | null;
          taxId: string | null;
        } | null;
      };
      patient: { fullName: string };
    };
  };
  installment: { installmentNumber: number; totalInstallments: number } | null;
  settings: CompanyBillingSettings;
  language: InvoiceLanguage;
  /**
   * CBCT supplement snapshot included in `payment.amount` — only set on
   * treatment-fee payloads whose order carried `cbctFeeAmount`. When
   * positive the line-item table splits the amount into a professional
   * fee row + a "Supplément CBCT" row; the totals stay unchanged.
   * Installment / pack receipts never carry it.
   */
  cbctFeeAmount?: number | null;
  /**
   * Prefix for the id-derived fallback number when no sequential number
   * has been allocated yet — `INV` for an installment receipt, `TF` for
   * a treatment-fee invoice. Ignored once a real number exists.
   */
  numberFallbackPrefix?: 'INV' | 'TF';

  // ── Injection points for a stored Invoice record ──────────────────
  // A manual invoice has real line items and real totals, instead of the
  // single `payment.amount` the two original flows derive everything
  // from. Supplying them reuses the template, the CSS and every helper
  // untouched — exactly what `loadTreatmentFeeForRender` already does
  // when it synthesises a Payment row that never existed.
  rows?: InvoiceLineRow[];
  totals?: InvoiceTotalLine[];
}

/**
 * Browser-backed Invoice / Payment-receipt PDF renderer.
 *
 * Mirrors `QuotationPdfService` in structure (same Puppeteer launch
 * pattern, same A4 print emulation, same HTML / CSS scaffolding) so
 * the doctor's downloaded receipts look like a member of the same
 * document family as the original devis.
 *
 * Why we don't persist the file on disk: a Payment is immutable once
 * it lands at `success`, so the receipt is a pure projection of the DB
 * state. Rendering on demand keeps `uploads/` clean and lets the
 * doctor request a French + English copy of the same receipt without
 * a server-side language toggle. Output is streamed straight back to
 * the response.
 */
@Injectable()
export class InvoicePdfService implements OnModuleDestroy {
  private readonly logger = new Logger(InvoicePdfService.name);
  private browserPromise: Promise<Browser> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: CompanyBillingSettingsService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    if (!this.browserPromise) return;
    try {
      const browser = await this.browserPromise;
      await browser.close();
    } catch {
      // The process is shutting down; a stale browser is not useful to report.
    } finally {
      this.browserPromise = null;
    }
  }

  // ─── Public API ────────────────────────────────────────────────

  /**
   * Build the invoice PDF for a given Payment id and return it as a
   * Buffer. Throws if the payment does not exist; the controller is
   * responsible for the RBAC check (admin OR owning doctor) before
   * calling in.
   *
   * `language` is the doctor's dashboard locale at request time. If
   * undefined, falls back to the company-level default (mirrors the
   * quote PDF behaviour where the per-quote `language` field would
   * pick the document language).
   */
  async renderInvoiceBuffer(args: {
    paymentId: string;
    language?: InvoiceLanguage;
  }): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const payload = await this.loadPaymentForRender(args.paymentId, args.language);
    const html = this.renderHtml(payload);
    const buffer = await this.renderHtmlToBuffer(html);
    const fileName = this.safePdfFileName(
      `invoice-${this.invoiceNumber(payload.payment)}-${payload.language}`,
    );
    return { buffer, fileName, mimeType: 'application/pdf' };
  }

  /**
   * Build the treatment-fee invoice PDF for a given order id. The
   * treatment fee lives inline on `DentalOrder` (there's no Payment
   * row), so we synthesise an `InvoiceRenderPayload` from the order's
   * `treatmentFee*` columns and reuse the exact same HTML template — the
   * line item already reads "Treatment fee" when there's no installment.
   *
   * The controller is responsible for the RBAC check (admin OR owning
   * doctor) before calling in.
   */
  async renderTreatmentFeeInvoiceBuffer(args: {
    orderId: string;
    language?: InvoiceLanguage;
  }): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const payload = await this.loadTreatmentFeeForRender(
      args.orderId,
      args.language,
    );
    const html = this.renderHtml(payload);
    const buffer = await this.renderHtmlToBuffer(html);
    const fileName = this.safePdfFileName(
      `treatment-fee-${this.invoiceNumber(payload.payment, 'TF')}-${payload.language}`,
    );
    return { buffer, fileName, mimeType: 'application/pdf' };
  }

  /**
   * Render a STORED Invoice record (the manual / admin invoicing flow).
   *
   * Same template, same CSS, same helpers as the two original flows — the
   * only difference is where the data comes from. Two seams make that
   * possible without touching the markup:
   *   • `payload.rows` / `payload.totals` carry the real line items and
   *     the real totals instead of deriving them from a single amount;
   *   • the "Facturé à" block reads `clinicSnapshot` FIRST (mergeClinic),
   *     so a hand-typed client renders through the very same box a
   *     doctor's clinic does.
   *
   * Totals are read from the row, never recomputed here: InvoiceService
   * owns that maths, and a PDF must show exactly what was stored.
   */
  async renderInvoiceRecordBuffer(args: {
    invoiceId: string;
    language?: InvoiceLanguage;
  }): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const payload = await this.loadInvoiceRecordForRender(
      args.invoiceId,
      args.language,
    );
    const html = this.renderHtml(payload);
    const buffer = await this.renderHtmlToBuffer(html);
    const fileName = this.safePdfFileName(
      `${payload.payment.invoiceNumber ?? 'invoice'}-${payload.language}`,
    );
    return { buffer, fileName, mimeType: 'application/pdf' };
  }

  // ─── Loaders ───────────────────────────────────────────────────

  /**
   * Build a render payload from a stored Invoice. Mirrors
   * `loadTreatmentFeeForRender`, which likewise synthesises a Payment
   * view for a row that has no Payment at all.
   */
  private async loadInvoiceRecordForRender(
    invoiceId: string,
    language: InvoiceLanguage | undefined,
  ): Promise<InvoiceRenderPayload> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, deletedAt: null },
      include: {
        lines: { orderBy: { position: 'asc' } },
        order: { select: { orderCode: true } },
        patient: { select: { fullName: true } },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const settings = await this.settingsService.requireActive();
    const lang: InvoiceLanguage =
      language ?? ((invoice.language === 'en' ? 'en' : 'fr') as InvoiceLanguage);
    const labels = getInvoiceLabels(lang);
    const currency = invoice.currency || settings.defaultCurrency || 'TND';
    const n = (v: unknown): number => Number(v ?? 0);

    // The client block. mergeClinic prefers the snapshot over the live
    // doctor profile, so this renders a manual client and a linked
    // practitioner through the very same markup.
    const clientSnapshot = {
      clinicName: invoice.clientName,
      clinicAddress: invoice.clientAddress,
      city: invoice.clientCity,
      country: invoice.clientCountry,
      clinicPhone: invoice.clientPhone,
      clinicEmail: invoice.clientEmail,
      taxId: invoice.clientTaxId,
    };

    const rows: InvoiceLineRow[] = invoice.lines.map((line) => ({
      description: line.description,
      quantity: n(line.quantity),
      unitPrice: n(line.unitPrice),
      amount: n(line.lineHt),
    }));

    const money = (v: number): string =>
      this.formatMoney(v, currency, lang);

    const discount = n(invoice.discountAmount);
    const stamp = n(invoice.stampDuty);
    const subTotalHt = n(invoice.subTotalHt);
    const totals: InvoiceTotalLine[] = [];

    // With a discount the reader needs to see all three steps:
    // gross HT, the discount taken off, then the net HT that VAT applies
    // to. Without one, a single "Total HT" line — the usual case.
    if (discount > 0) {
      totals.push({
        label: labels.subtotalHt,
        value: money(subTotalHt + discount),
      });
      totals.push({ label: labels.discount, value: `- ${money(discount)}` });
    }
    totals.push({ label: labels.subtotalHt, value: money(subTotalHt) });
    totals.push({
      label: `${labels.vatAmount} (${n(invoice.tvaRate)}%)`,
      value: money(n(invoice.tvaAmount)),
    });
    if (stamp > 0) {
      totals.push({ label: labels.stampDuty, value: money(stamp) });
    }
    totals.push({
      label: labels.totalTtc,
      value: money(n(invoice.totalTtc)),
      kind: 'final',
    });
    if (invoice.status === 'paid') {
      totals.push({
        label: labels.amountPaid,
        value: money(n(invoice.totalTtc)),
        kind: 'paid',
      });
    }

    return {
      payment: {
        id: invoice.id,
        amount: invoice.totalTtc,
        // Drives the status pill + the green "paid" treatment.
        status:
          invoice.status === 'paid'
            ? PaymentRecordStatus.success
            : invoice.status === 'cancelled'
              ? PaymentRecordStatus.failed
              : PaymentRecordStatus.pending,
        paymentMethod: PaymentMethod.cash,
        transactionId: null,
        paidAt: invoice.paidAt,
        createdAt: invoice.issueDate,
        invoiceNumber: invoice.invoiceNumber,
      },
      quotation: {
        id: invoice.id,
        currency,
        tvaRate: n(invoice.tvaRate),
        totalTtc: n(invoice.totalTtc),
        packName: null,
        companySnapshot: invoice.companySnapshot,
        clinicSnapshot: clientSnapshot as unknown as Prisma.JsonValue,
        order: {
          orderCode: invoice.order?.orderCode ?? invoice.invoiceNumber,
          doctor: {
            id: invoice.doctorId ?? '',
            fullName: invoice.clientName,
            email: invoice.clientEmail ?? '',
            phone: invoice.clientPhone,
            dentistProfile: null,
          },
          patient: { fullName: invoice.patient?.fullName ?? invoice.clientName },
        },
      },
      installment: null,
      settings,
      language: lang,
      rows,
      totals,
    };
  }

  private async loadPaymentForRender(
    paymentId: string,
    language: InvoiceLanguage | undefined,
  ): Promise<InvoiceRenderPayload> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        quotation: {
          select: {
            id: true,
            currency: true,
            tvaRate: true,
            totalTtc: true,
            packName: true,
            companySnapshot: true,
            clinicSnapshot: true,
            order: {
              select: {
                orderCode: true,
                doctor: {
                  select: {
                    id: true,
                    fullName: true,
                    email: true,
                    phone: true,
                    dentistProfile: {
                      select: {
                        clinicName: true,
                        clinicAddress: true,
                        city: true,
                        country: true,
                        clinicPhone: true,
                        clinicEmail: true,
                        taxId: true,
                      },
                    },
                  },
                },
                patient: { select: { fullName: true } },
              },
            },
          },
        },
        installment: {
          select: {
            installmentNumber: true,
            quotationId: true,
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found.');

    // Lazily allocate a stable, sequential receipt number the first
    // time a *successful* payment's receipt is rendered, then persist
    // it so re-downloads keep the same number and an admin can later
    // override it. The `invoiceNumber: null` filter makes this a no-op
    // when a concurrent render already numbered the row.
    if (
      payment.status === PaymentRecordStatus.success &&
      !payment.invoiceNumber
    ) {
      const allocated = await this.settingsService.allocateInvoiceNumber();
      const res = await this.prisma.payment.updateMany({
        where: { id: payment.id, invoiceNumber: null },
        data: { invoiceNumber: allocated },
      });
      if (res.count > 0) {
        payment.invoiceNumber = allocated;
      } else {
        const fresh = await this.prisma.payment.findUnique({
          where: { id: payment.id },
          select: { invoiceNumber: true },
        });
        payment.invoiceNumber = fresh?.invoiceNumber ?? allocated;
      }
    }

    // Pull the total-installment count for the quotation so the line
    // item reads as "Installment 2 of 4" — the quote table doesn't
    // store the count, but a cheap `count()` on QuoteInstallment is
    // covered by the existing `quotationId` index.
    const totalInstallments = payment.installment
      ? await this.prisma.quoteInstallment.count({
          where: { quotationId: payment.installment.quotationId },
        })
      : 0;

    const settings = await this.settingsService.requireActive();

    // Per-row language: there's no `language` column on Payment, so we
    // honour the caller-supplied dashboard locale first, then fall back
    // to the company default. The company defaultLanguage isn't a real
    // column today — we read whichever language the quote snapshot was
    // generated with as a sensible secondary fallback, otherwise FR.
    const snapshotLanguage = this.snapshotLanguage(
      this.asJsonRecord(payment.quotation.companySnapshot),
    );
    const finalLanguage: InvoiceLanguage =
      language ?? snapshotLanguage ?? 'fr';

    return {
      payment,
      quotation: payment.quotation,
      installment: payment.installment
        ? {
            installmentNumber: payment.installment.installmentNumber,
            totalInstallments,
          }
        : null,
      settings,
      language: finalLanguage,
    };
  }

  /**
   * Hydrate a synthetic render payload for an order's treatment fee.
   * Unlike the installment path there's no Payment / Quotation row to
   * read — the fee is stored inline on the order — so we map those
   * columns into the same shape and let `mergeCompany` / `mergeClinic`
   * fall back to the live billing settings + dentist profile (both
   * snapshots are null here).
   */
  private async loadTreatmentFeeForRender(
    orderId: string,
    language: InvoiceLanguage | undefined,
  ): Promise<InvoiceRenderPayload> {
    const order = await this.prisma.dentalOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderCode: true,
        createdAt: true,
        treatmentFeeAmount: true,
        treatmentFeePaymentMethod: true,
        treatmentFeePaymentStatus: true,
        treatmentFeePaidAt: true,
        treatmentFeeInvoiceNumber: true,
        cbctFeeAmount: true,
        cbctFeeCurrency: true,
        doctor: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            dentistProfile: {
              select: {
                clinicName: true,
                clinicAddress: true,
                city: true,
                country: true,
                clinicPhone: true,
                clinicEmail: true,
                taxId: true,
              },
            },
          },
        },
        patient: { select: { fullName: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found.');
    if (order.treatmentFeeAmount === null) {
      throw new NotFoundException(
        'This order has no treatment fee to invoice.',
      );
    }

    // Lazily allocate a stable, sequential TF-XXXXXX number the first
    // time a *paid* treatment-fee invoice is rendered, then persist it
    // so re-downloads keep the same number and an admin can override it
    // later. Mirrors the installment-receipt allocation; the
    // `treatmentFeeInvoiceNumber: null` filter makes it a no-op when a
    // concurrent render already numbered the row. Unpaid / awaiting rows
    // stay unnumbered and fall back to the id-derived `TF-XXXXXXXX`.
    let invoiceNumber = order.treatmentFeeInvoiceNumber;
    if (
      order.treatmentFeePaymentStatus === PaymentRecordStatus.success &&
      !invoiceNumber
    ) {
      const allocated =
        await this.settingsService.allocateTreatmentFeeInvoiceNumber();
      const res = await this.prisma.dentalOrder.updateMany({
        where: { id: order.id, treatmentFeeInvoiceNumber: null },
        data: { treatmentFeeInvoiceNumber: allocated },
      });
      if (res.count > 0) {
        invoiceNumber = allocated;
      } else {
        const fresh = await this.prisma.dentalOrder.findUnique({
          where: { id: order.id },
          select: { treatmentFeeInvoiceNumber: true },
        });
        invoiceNumber = fresh?.treatmentFeeInvoiceNumber ?? allocated;
      }
    }

    const settings = await this.settingsService.requireActive();
    const finalLanguage: InvoiceLanguage = language ?? 'fr';

    const payment: InvoicePaymentView = {
      id: order.id,
      amount: order.treatmentFeeAmount ?? new Prisma.Decimal(0),
      status: order.treatmentFeePaymentStatus ?? PaymentRecordStatus.pending,
      // Default only matters for the (rare) unpaid render; a settled fee
      // always carries its real method.
      paymentMethod: order.treatmentFeePaymentMethod ?? PaymentMethod.cash,
      transactionId: null,
      paidAt: order.treatmentFeePaidAt,
      createdAt: order.createdAt,
      invoiceNumber,
    };

    return {
      payment,
      quotation: {
        id: order.id,
        // The CBCT snapshot carries the merchant currency at request
        // time (follows defaultCurrency); fall back to TND for orders
        // without one — same value the fee has always been billed in.
        currency: order.cbctFeeCurrency ?? 'TND',
        // Treatment fee is a flat professional fee — no VAT line.
        tvaRate: 0,
        totalTtc: this.toNumber(order.treatmentFeeAmount),
        packName: null,
        companySnapshot: null,
        clinicSnapshot: null,
        order: {
          orderCode: order.orderCode,
          doctor: order.doctor,
          patient: order.patient,
        },
      },
      installment: null,
      settings,
      language: finalLanguage,
      numberFallbackPrefix: 'TF',
      // Decimal → Number at the payload boundary, same treatment as
      // `totalTtc` above; null when the order never carried a CBCT fee.
      cbctFeeAmount:
        order.cbctFeeAmount !== null
          ? this.toNumber(order.cbctFeeAmount)
          : null,
    };
  }

  /**
   * Best-effort: read the original quote's selectedLanguage from its
   * snapshot and downcast to InvoiceLanguage (we drop AR — receipts are
   * FR/EN only per the product brief). Returns undefined when the
   * snapshot is missing or carries an unknown value.
   */
  private snapshotLanguage(
    snapshot: JsonRecord | null,
  ): InvoiceLanguage | undefined {
    const lang = snapshot?.selectedLanguage;
    if (lang === 'fr' || lang === 'en') return lang;
    return undefined;
  }

  /**
   * Narrow a Prisma `JsonValue` to a plain object record (or null when
   * the column is null / a primitive / an array). Keeps the renderer's
   * snapshot-reading code free of `as JsonRecord` casts scattered all
   * over the place.
   */
  private asJsonRecord(value: Prisma.JsonValue | null): JsonRecord | null {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as JsonRecord;
  }

  // ─── Puppeteer plumbing (cloned from QuotationPdfService) ──────

  private async renderHtmlToBuffer(html: string): Promise<Buffer> {
    let page: Awaited<ReturnType<Browser['newPage']>> | null = null;
    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();
      page.setDefaultTimeout(45_000);
      await page.setContent(html, { waitUntil: 'load', timeout: 45_000 });
      await page.emulateMediaType('print');
      const buffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      // puppeteer-core returns a Uint8Array; normalise to Node Buffer
      // so the Express response can pipe it without an extra copy.
      return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    } catch (err) {
      this.logger.error(
        `Failed to render invoice PDF: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    } finally {
      if (page) await page.close().catch(() => undefined);
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = this.launchBrowser().catch((err) => {
        this.browserPromise = null;
        throw err;
      });
    }
    return this.browserPromise;
  }

  private async launchBrowser(): Promise<Browser> {
    const executablePath = this.resolveChromiumExecutable();
    this.logger.log(`Launching Chromium PDF renderer at ${executablePath}`);
    return puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=medium',
      ],
    });
  }

  private resolveChromiumExecutable(): string {
    const envCandidates = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      process.env.CHROME_BIN,
      process.env.CHROMIUM_PATH,
    ].filter(Boolean) as string[];

    const candidates = [
      ...envCandidates,
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome-stable',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(
        process.env.LOCALAPPDATA ?? '',
        'Google\\Chrome\\Application\\chrome.exe',
      ),
    ].filter(Boolean);

    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (found) return found;

    throw new Error(
      'Chromium executable was not found. Install chromium in Docker or set PUPPETEER_EXECUTABLE_PATH.',
    );
  }

  // ─── HTML template ─────────────────────────────────────────────

  private renderHtml(payload: InvoiceRenderPayload): string {
    const { payment, quotation, installment, settings, language } = payload;
    const numberFallbackPrefix = payload.numberFallbackPrefix ?? 'INV';
    const labels = getInvoiceLabels(language);
    const companySnapshot = this.asJsonRecord(quotation.companySnapshot);
    const clinicSnapshot = this.asJsonRecord(quotation.clinicSnapshot);
    const company = this.mergeCompany(settings, companySnapshot);
    const clinic = this.mergeClinic(
      quotation.order.doctor,
      clinicSnapshot,
    );
    const logo = this.resolveImageDataUrl(company.companyLogoPath);
    // Caller-supplied rows/totals win (stored Invoice record); otherwise
    // they are derived from the payment, exactly as they always were.
    const rows = payload.rows ?? this.buildLineItems(payload, labels);
    const totals = payload.totals ?? this.buildTotals(payload, labels);
    const legal = pickInvoiceTranslation(
      (settings.legalTextTranslations as unknown) ??
        companySnapshot?.legalTextTranslations,
      language,
    );
    const bank = ((settings.bankDetails as unknown) ??
      companySnapshot?.bankDetails) as Record<string, string> | null;
    const cityCountry = [company.companyCity, company.companyCountry]
      .filter(Boolean)
      .join(', ');
    const clinicCity = [clinic.city, clinic.country].filter(Boolean).join(', ');
    const brandName = (company.companyName ?? 'ORALIGN').trim() || 'ORALIGN';
    const statusLabel = this.statusLabel(payment.status, labels);
    const statusPaid = payment.status === PaymentRecordStatus.success;

    return `<!doctype html>
<html lang="${this.htmlAttr(language)}" dir="ltr">
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 11mm; }
      * { box-sizing: border-box; }
      html {
        height: 100%;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body {
        margin: 0;
        min-height: 100%;
        color: #111111;
        background: #ffffff;
        font-family: Inter, Roboto, Arial, "DejaVu Sans", sans-serif;
        font-size: 10.5px;
        line-height: 1.42;
      }
      .document {
        display: flex;
        min-height: 275mm;
        width: 100%;
        flex-direction: column;
      }
      /* Centered logo masthead — the logo sits alone, centered, at the
         very top of the first page; the document title + meta follow it. */
      .masthead {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding-bottom: 12px;
        margin-bottom: 13px;
        border-bottom: 1.5px solid #111111;
        break-inside: avoid;
      }
      .logo-img { max-width: 168px; max-height: 66px; object-fit: contain; }
      .masthead-name {
        font-size: 22px;
        font-weight: 800;
        letter-spacing: .16em;
        text-transform: uppercase;
        text-align: center;
      }
      .docrow {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 16px;
        align-items: start;
        break-inside: avoid;
      }
      .doc-meta { min-width: 188px; text-align: right; }
      .title {
        margin: 0;
        font-size: 22px;
        line-height: 1;
        letter-spacing: .12em;
        font-weight: 800;
        text-transform: uppercase;
      }
      .meta-line { margin-top: 4px; color: #555555; font-size: 9.5px; overflow-wrap: anywhere; }
      .status {
        display: inline-flex;
        margin-top: 7px;
        max-width: 100%;
        align-items: center;
        border: 1px solid #111111;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 9px;
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      .status.paid {
        background: #16a34a;
        color: #ffffff;
        border-color: #16a34a;
      }
      .section { margin-top: 11px; }
      .section.keep { break-inside: avoid; page-break-inside: avoid; }
      .section-title {
        margin: 0 0 6px;
        color: #666666;
        font-size: 8.5px;
        font-weight: 800;
        letter-spacing: .12em;
        text-transform: uppercase;
      }
      .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .box {
        min-width: 0;
        border: 1px solid #e2e4e8;
        border-radius: 10px;
        padding: 10px 11px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .box-line {
        margin: 1.5px 0;
        overflow-wrap: anywhere;
        word-break: normal;
      }
      .box-line.strong { font-weight: 700; }
      table {
        width: 100%;
        border: 1px solid #111111;
        border-radius: 10px;
        border-collapse: separate;
        border-spacing: 0;
        table-layout: fixed;
        overflow: hidden;
      }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      th {
        background: #111111;
        color: #ffffff;
        padding: 8px 11px;
        font-size: 8.5px;
        font-weight: 800;
        letter-spacing: .12em;
        text-transform: uppercase;
        text-align: start;
      }
      th.qty, td.qty { width: 12%; text-align: center; }
      th.unit, td.unit { width: 22%; text-align: end; white-space: nowrap; }
      th.amount, td.amount { width: 22%; text-align: end; white-space: nowrap; }
      th.desc, td.desc { width: 44%; }
      td {
        padding: 8px 11px;
        border-top: 1px solid #ececec;
        vertical-align: top;
        overflow-wrap: anywhere;
      }
      .line-label { font-weight: 700; }
      .line-note { margin-top: 2px; color: #666666; font-size: 9px; overflow-wrap: anywhere; }
      .totals {
        width: min(100%, 262px);
        margin-top: 10px;
        margin-left: auto;
        border: 1px solid #e2e4e8;
        border-radius: 10px;
        padding: 7px 8px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .total-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 4px 4px;
        border-bottom: 1px solid #eef0f2;
      }
      .total-row span:first-child { overflow-wrap: anywhere; }
      .total-row span:last-child { white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 650; }
      .total-row.final {
        margin-top: 4px;
        border: 0;
        border-radius: 8px;
        background: #111111;
        color: #ffffff;
        padding: 9px 10px;
        font-size: 12px;
        font-weight: 800;
      }
      .total-row.paid {
        margin-top: 4px;
        border: 0;
        border-radius: 8px;
        background: #16a34a;
        color: #ffffff;
        padding: 9px 10px;
        font-size: 12px;
        font-weight: 800;
      }
      .text-block {
        margin-top: 10px;
        border: 1px solid #e2e4e8;
        border-radius: 10px;
        padding: 9px 11px;
        break-inside: auto;
      }
      .text-block-title {
        margin: 0 0 5px;
        color: #666666;
        font-size: 8.5px;
        font-weight: 800;
        letter-spacing: .12em;
        text-transform: uppercase;
      }
      .text-block-body {
        margin: 0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .footer {
        margin-top: auto;
        padding-top: 9px;
        border-top: 1px solid #e2e4e8;
        color: #555555;
        font-size: 8.5px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .footer p { margin: 0 0 4px; overflow-wrap: anywhere; }
      .bank-title {
        margin-top: 7px;
        color: #111111;
        font-weight: 800;
      }
      .bank-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 2px 14px;
        margin-top: 3px;
      }
      .bank-grid div { overflow-wrap: anywhere; }
      .page-mark {
        margin-top: 8px;
        text-align: right;
        color: #888888;
        font-size: 8px;
      }
    </style>
  </head>
  <body>
    <main class="document">
      <header class="masthead">
        ${
          logo
            ? `<img class="logo-img" src="${logo}" alt="${this.htmlAttr(brandName)}" />`
            : `<div class="masthead-name">${this.html(brandName)}</div>`
        }
      </header>

      <section class="docrow">
        <div>
          <h1 class="title">${this.html(labels.documentTitle.toUpperCase())}</h1>
        </div>
        <div class="doc-meta">
          <div class="meta-line">${this.html(labels.number)}: <strong>${this.html(this.invoiceNumber(payment, numberFallbackPrefix))}</strong></div>
          <div class="meta-line">${this.html(labels.date)}: ${this.html(this.formatDate(new Date(), language))}</div>
          <div class="status${statusPaid ? ' paid' : ''}">${this.html(labels.status)}: ${this.html(statusLabel)}</div>
        </div>
      </section>

      <section class="section keep party-grid">
        <article class="box">
          <h2 class="section-title">${this.html(labels.issuedBy)}</h2>
          ${this.renderBoxLines([
            { text: company.companyName ?? '', strong: true },
            { text: company.companyAddress ?? '' },
            { text: cityCountry },
            { text: company.companyPhone ?? '' },
            { text: company.companyEmail ?? '' },
            {
              text: company.taxRegistrationNumber
                ? `${labels.taxNumber}: ${company.taxRegistrationNumber}`
                : '',
            },
          ])}
        </article>

        <article class="box">
          <h2 class="section-title">${this.html(labels.billedTo)}</h2>
          ${this.renderBoxLines([
            {
              text: `${labels.doctor}: ${clinic.doctorFullName}`,
              strong: true,
            },
            {
              text: `${labels.forPatient}: ${quotation.order.patient.fullName} (${labels.order}: ${quotation.order.orderCode})`,
            },
            { text: clinic.clinicName ?? '' },
            { text: clinic.clinicAddress ?? '' },
            { text: clinicCity },
            { text: clinic.clinicPhone ?? '' },
            { text: clinic.clinicEmail ?? '' },
            { text: clinic.doctorEmail ?? '' },
            { text: clinic.doctorPhone ?? '' },
            {
              text: clinic.taxId
                ? `${labels.taxNumber}: ${clinic.taxId}`
                : '',
            },
          ])}
        </article>
      </section>

      <section class="section">
        <table>
          <thead>
            <tr>
              <th class="desc">${this.html(labels.description)}</th>
              <th class="qty">${this.html(labels.quantity)}</th>
              <th class="unit">${this.html(labels.unitPrice)}</th>
              <th class="amount">${this.html(labels.amount)}</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => this.renderLineRow(row, payload)).join('')}
          </tbody>
        </table>
        <section class="totals">
          ${totals.map((line) => this.renderTotalLine(line)).join('')}
        </section>
      </section>

      <section class="text-block">
        <h2 class="text-block-title">${this.html(labels.paymentDetails)}</h2>
        <p class="text-block-body">${this.html(this.paymentSummary(payload, labels))}</p>
      </section>

      <footer class="footer">
        <p>${this.html(labels.legalNotice)}</p>
        ${legal ? `<p>${this.html(legal)}</p>` : ''}
        ${this.shouldShowBank(payment) && bank && Object.values(bank).some(Boolean)
          ? `<div class="bank-title">${this.html(labels.bankDetails)}</div>
             <div class="bank-grid">
               ${this.renderBankLine(labels.bankName, bank.bankName)}
               ${this.renderBankLine(labels.accountName, bank.accountName)}
               ${this.renderBankLine(labels.rib, bank.rib)}
               ${this.renderBankLine(labels.iban, bank.iban)}
               ${this.renderBankLine(labels.swift, bank.swift)}
             </div>`
          : ''}
        <div class="page-mark">${this.html(labels.pageOfTotal(1, 1))}</div>
      </footer>
    </main>
  </body>
</html>`;
  }

  // ─── Section helpers ───────────────────────────────────────────

  /**
   * Prefer the LIVE billing settings so updating the company
   * configuration (logo, name, address, RNE / tax id, …) is reflected on
   * every invoice — the historical snapshot is only a fallback for a
   * field left blank in settings. Product decision: an invoice should
   * always show the company's current identity, not a frozen copy.
   */
  private mergeCompany(
    settings: CompanyBillingSettings,
    snapshot: JsonRecord | null,
  ): {
    companyName: string | null;
    companyLogoPath: string | null;
    companyAddress: string | null;
    companyCity: string | null;
    companyCountry: string | null;
    companyPhone: string | null;
    companyEmail: string | null;
    taxRegistrationNumber: string | null;
  } {
    const fromSnap = (key: string): string | null => {
      const v = snapshot?.[key];
      return typeof v === 'string' && v.length > 0 ? v : null;
    };
    return {
      companyName: settings.companyName ?? fromSnap('companyName') ?? null,
      companyLogoPath:
        settings.companyLogoPath ?? fromSnap('companyLogoPath') ?? null,
      companyAddress:
        settings.companyAddress ?? fromSnap('companyAddress') ?? null,
      companyCity: settings.companyCity ?? fromSnap('companyCity') ?? null,
      companyCountry:
        settings.companyCountry ?? fromSnap('companyCountry') ?? null,
      companyPhone: settings.companyPhone ?? fromSnap('companyPhone') ?? null,
      companyEmail: settings.companyEmail ?? fromSnap('companyEmail') ?? null,
      taxRegistrationNumber:
        settings.taxRegistrationNumber ??
        fromSnap('taxRegistrationNumber') ??
        null,
    };
  }

  /**
   * Same logic as `mergeCompany` for the doctor/clinic block. The
   * snapshot wins when present; otherwise we use the live dentist
   * profile + user row.
   */
  private mergeClinic(
    doctor: InvoiceRenderPayload['quotation']['order']['doctor'],
    snapshot: JsonRecord | null,
  ): {
    doctorFullName: string;
    doctorEmail: string | null;
    doctorPhone: string | null;
    clinicName: string | null;
    clinicAddress: string | null;
    city: string | null;
    country: string | null;
    clinicPhone: string | null;
    clinicEmail: string | null;
    taxId: string | null;
  } {
    const fromSnap = (key: string): string | null => {
      const v = snapshot?.[key];
      return typeof v === 'string' && v.length > 0 ? v : null;
    };
    const profile = doctor.dentistProfile;
    return {
      doctorFullName: fromSnap('doctorFullName') ?? doctor.fullName,
      doctorEmail: fromSnap('doctorEmail') ?? doctor.email ?? null,
      doctorPhone: doctor.phone ?? null,
      clinicName: fromSnap('clinicName') ?? profile?.clinicName ?? null,
      clinicAddress:
        fromSnap('clinicAddress') ?? profile?.clinicAddress ?? null,
      city: fromSnap('city') ?? profile?.city ?? null,
      country: fromSnap('country') ?? profile?.country ?? null,
      clinicPhone: fromSnap('clinicPhone') ?? profile?.clinicPhone ?? null,
      clinicEmail: fromSnap('clinicEmail') ?? profile?.clinicEmail ?? null,
      // Doctor's "Matricule fiscal" — snapshot wins (for historical
      // quotes that locked it in) then the live dentist profile.
      taxId: fromSnap('taxId') ?? profile?.taxId ?? null,
    };
  }

  private buildLineItems(
    payload: InvoiceRenderPayload,
    labels: InvoiceLabels,
  ): InvoiceLineRow[] {
    const { payment, quotation, installment } = payload;
    const amount = this.toNumber(payment.amount);

    // Treatment-fee invoice whose order snapshotted a CBCT supplement →
    // break the single billed amount into its two components so the
    // doctor sees what the supplement cost. The rows sum back to the
    // same `payment.amount`, so the totals section is untouched.
    // Installment / pack receipts never carry `cbctFeeAmount`.
    const cbctFee = Math.max(0, this.toNumber(payload.cbctFeeAmount ?? 0));
    if (!installment && cbctFee > 0) {
      const professionalFee = Math.max(0, amount - cbctFee);
      return [
        {
          description: labels.treatmentFee,
          quantity: 1,
          unitPrice: professionalFee,
          amount: professionalFee,
        },
        {
          description: labels.cbctSupplement,
          quantity: 1,
          unitPrice: cbctFee,
          amount: cbctFee,
        },
      ];
    }

    const packLabel = quotation.packName
      ? `${labels.packLabel}: ${quotation.packName}`
      : labels.treatmentFee;

    const description = installment
      ? packLabel
      : labels.treatmentFee;
    const note = installment
      ? labels.installmentLine(
          installment.installmentNumber,
          installment.totalInstallments,
        )
      : undefined;

    return [
      {
        description,
        note,
        quantity: 1,
        unitPrice: amount,
        amount,
      },
    ];
  }

  private buildTotals(
    payload: InvoiceRenderPayload,
    labels: InvoiceLabels,
  ): InvoiceTotalLine[] {
    const { payment, quotation, settings, language } = payload;
    // The TTC the customer was billed for the line item itself.
    const total = this.toNumber(payment.amount);
    const tvaRate = this.toNumber(quotation.tvaRate);
    // "Droit de timbre" — the configured fiscal stamp duty added to the
    // invoice total. Clamp to >= 0 so a stray negative setting can't
    // subtract from the total. When it's 0 the totals block is
    // byte-identical to the pre-stamp-duty behaviour (backward compat).
    const stampDuty = Math.max(0, this.toNumber(settings.stampDuty));
    const grandTotal = total + stampDuty;
    // The line item we render is the payment amount only — for a
    // partial installment the quote-level TVA already factored into
    // the schedule, so we display a flat subtotal/total here. We still
    // surface the TVA breakdown when the quote carries a non-zero rate
    // so the receipt reads as a proper tax-compliant document.
    const showTva = tvaRate > 0;
    const subtotal = showTva ? total / (1 + tvaRate / 100) : total;
    const tvaAmount = showTva ? total - subtotal : 0;

    const lines: InvoiceTotalLine[] = [
      {
        label: labels.subtotalHt,
        value: this.formatMoney(subtotal, quotation.currency, language),
      },
    ];
    if (showTva) {
      lines.push({
        label: `${labels.vatRate} (${tvaRate.toFixed(2)} %)`,
        value: this.formatMoney(tvaAmount, quotation.currency, language),
      });
    }

    // Amount the paid row reflects — the grand total when a stamp duty
    // applies, otherwise the bare TTC.
    let amountPaid = total;
    if (stampDuty > 0) {
      // TTC + stamp duty + grand total breakdown.
      lines.push({
        label: labels.totalTtc,
        value: this.formatMoney(total, quotation.currency, language),
      });
      lines.push({
        label: labels.stampDuty,
        value: this.formatMoney(stampDuty, quotation.currency, language),
      });
      lines.push({
        label: labels.totalDue,
        value: this.formatMoney(grandTotal, quotation.currency, language),
        kind: 'final',
      });
      amountPaid = grandTotal;
    } else {
      // No stamp duty → keep the legacy single dark "Total TTC" row.
      lines.push({
        label: labels.totalTtc,
        value: this.formatMoney(total, quotation.currency, language),
        kind: 'final',
      });
      amountPaid = total;
    }

    lines.push({
      label: labels.amountPaid,
      value: this.formatMoney(amountPaid, quotation.currency, language),
      // Green-highlight the paid row only when the payment actually
      // landed — for a pending/rejected snapshot we still print the
      // neutral row so the document doesn't lie about the state.
      kind: payment.status === PaymentRecordStatus.success ? 'paid' : 'normal',
    });
    return lines;
  }

  private renderLineRow(
    row: InvoiceLineRow,
    payload: InvoiceRenderPayload,
  ): string {
    const { quotation, language } = payload;
    return `<tr>
      <td class="desc">
        <div class="line-label">${this.html(row.description)}</div>
        ${row.note ? `<div class="line-note">${this.html(row.note)}</div>` : ''}
      </td>
      <td class="qty">${row.quantity}</td>
      <td class="unit">${this.html(this.formatMoney(row.unitPrice, quotation.currency, language))}</td>
      <td class="amount">${this.html(this.formatMoney(row.amount, quotation.currency, language))}</td>
    </tr>`;
  }

  private renderTotalLine(line: InvoiceTotalLine): string {
    const cls =
      line.kind === 'final' ? ' final' : line.kind === 'paid' ? ' paid' : '';
    return `<div class="total-row${cls}">
      <span>${this.html(line.label)}</span>
      <span>${this.html(line.value)}</span>
    </div>`;
  }

  private renderBoxLines(
    lines: Array<{ text: string; strong?: boolean }>,
  ): string {
    const html = lines
      .map((line) => ({ ...line, text: line.text.trim() }))
      .filter((line) => line.text.length > 0)
      .map(
        (line) =>
          `<p class="box-line${line.strong ? ' strong' : ''}">${this.html(line.text)}</p>`,
      )
      .join('');

    return html || '<p class="box-line">—</p>';
  }

  private renderBankLine(label: string, value?: string): string {
    if (!value) return '';
    return `<div><strong>${this.html(label)}:</strong> ${this.html(value)}</div>`;
  }

  private paymentSummary(
    payload: InvoiceRenderPayload,
    labels: InvoiceLabels,
  ): string {
    const { payment, language } = payload;
    const method = this.methodLabel(payment.paymentMethod, labels);
    const tx = payment.transactionId
      ? `${labels.transactionRef}: ${payment.transactionId}`
      : '';
    const when = this.formatDate(
      payment.paidAt ?? payment.createdAt,
      language,
    );
    const head = `${labels.paidVia} ${method}`;
    const dateLine = `${labels.paidOn}: ${when}`;
    return [head, dateLine, tx].filter(Boolean).join(' · ');
  }

  private shouldShowBank(payment: InvoicePaymentView): boolean {
    // The bank block is only useful on a bank-transfer receipt — that's
    // where the doctor needs the IBAN / RIB they wired against. We
    // suppress it for CARD and CASH so the footer stays tight.
    return payment.paymentMethod === PaymentMethod.bank_transfer;
  }

  // ─── Misc utilities (cloned from QuotationPdfService) ──────────

  private resolveImageDataUrl(relPath: string | null | undefined): string | null {
    if (!relPath) return null;
    try {
      const abs = this.resolveSafe(relPath);
      if (!fs.existsSync(abs)) return null;
      const ext = path.extname(abs).toLowerCase();
      const mime =
        ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : ext === '.webp'
              ? 'image/webp'
              : null;
      if (!mime) return null;
      const stat = fs.statSync(abs);
      if (stat.size > 2 * 1024 * 1024) return null;
      return `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
    } catch {
      return null;
    }
  }

  private resolveSafe(relPath: string): string {
    if (!relPath || path.isAbsolute(relPath)) {
      return '';
    }
    const root = path.resolve(UPLOAD_ROOT);
    const abs = path.resolve(root, relPath);
    const relative = path.relative(root, abs);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      return '';
    }
    return abs;
  }

  /**
   * The printed receipt number. Prefers the persisted, admin-editable
   * `payment.invoiceNumber` (a sequential `FAC-XXXXXX` / `TF-XXXXXX`
   * allocated on the first successful render); falls back to a stable
   * id-derived `${fallbackPrefix}-XXXXXXXX` for pending / legacy rows
   * that never got one.
   */
  private invoiceNumber(
    payment: InvoicePaymentView,
    fallbackPrefix: 'INV' | 'TF' = 'INV',
  ): string {
    if (payment.invoiceNumber) return payment.invoiceNumber;
    const short = payment.id.replace(/-/g, '').slice(0, 8).toUpperCase();
    return `${fallbackPrefix}-${short}`;
  }

  private safePdfFileName(input: string): string {
    const base =
      input
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/^[._-]+|[._-]+$/g, '')
        .slice(0, 120) || 'invoice';

    return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
  }

  private toNumber(value: unknown, fallback = 0): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    if (value && typeof value === 'object') {
      const decimalLike = value as {
        toNumber?: () => number;
        toString?: () => string;
      };
      if (typeof decimalLike.toNumber === 'function') {
        const parsed = decimalLike.toNumber();
        return Number.isFinite(parsed) ? parsed : fallback;
      }
      if (typeof decimalLike.toString === 'function') {
        const parsed = Number(decimalLike.toString());
        return Number.isFinite(parsed) ? parsed : fallback;
      }
    }
    return fallback;
  }

  private formatMoney(
    amount: unknown,
    currency: string,
    language: InvoiceLanguage,
  ): string {
    const numericAmount = this.toNumber(amount);
    const abs = Math.abs(numericAmount);
    const locale = language === 'en' ? 'en-GB' : 'fr-FR';
    const formatted = abs.toLocaleString(locale, {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
    const withSign = numericAmount < 0 ? `-${formatted}` : formatted;
    return `${withSign} ${currency}`;
  }

  private formatDate(date: Date, language: InvoiceLanguage): string {
    const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(date);
  }

  private statusLabel(
    status: PaymentRecordStatus,
    labels: InvoiceLabels,
  ): string {
    switch (status) {
      case PaymentRecordStatus.success:
        return labels.statusPaid;
      case PaymentRecordStatus.pending:
        return labels.statusPending;
      case PaymentRecordStatus.awaiting_confirmation:
        return labels.statusAwaitingConfirmation;
      case PaymentRecordStatus.failed:
        return labels.statusFailed;
      case PaymentRecordStatus.cancelled:
        return labels.statusCancelled;
      case PaymentRecordStatus.rejected:
        return labels.statusRejected;
      default:
        return labels.statusPending;
    }
  }

  private methodLabel(
    method: PaymentMethod,
    labels: InvoiceLabels,
  ): string {
    switch (method) {
      case PaymentMethod.card:
        return labels.methodCard;
      case PaymentMethod.bank_transfer:
        return labels.methodBankTransfer;
      case PaymentMethod.cash:
        return labels.methodCash;
      default:
        return method;
    }
  }

  private html(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private htmlAttr(value: unknown): string {
    return this.html(value).replace(/`/g, '&#96;');
  }
}
