import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  CompanyBillingSettings,
  InvoiceStatus,
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
  resolveTvaRate,
  splitInclusive,
  toAmount,
} from '../../common/billing/tax-split';
import { doctorContact } from '../../common/doctor/doctor-identity';
import {
  getInvoiceLabels,
  InvoiceLabels,
  InvoiceLanguage,
  pickInvoiceTranslation,
} from './invoice-i18n';
import { invoicePaymentReference } from './payment-reference';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

/**
 * The printable text of a value read from a snapshot or a row: strings as
 * they are, numbers / booleans / Decimals / dates in their usual form,
 * anything else (null, objects) as nothing, never "[object Object]".
 */
function printable(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return value.toString();
  return '';
}

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
  | 'withholdingAmount'
  | 'withholdingRate'
  | 'stampAmount'
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
  /** Overrides the document heading. */
  documentTitle?: string;
  /** Column headers when the rows are HT (a stored invoice). */
  columnLabels?: { unitPrice: string; amount: string };
  /**
   * Replaces the two leading lines of the "Facturé à" box — the
   * "Médecin: …" / "Pour le patient: … (Commande: …)" pair, which is
   * meaningless on an invoice that has neither a practitioner nor an
   * order. The rest of the box (address, phone, tax id) is unchanged.
   */
  billedToLead?: { text: string; strong?: boolean }[];
  /** Lines appended at the END of the "Facturé à" box (patient, order). */
  billedToTail?: { text: string; strong?: boolean }[];
  /**
   * A stored invoice speaks for itself: its own issue date, its own
   * status vocabulary (Brouillon / Émise / Payée / Annulée) and the
   * settlement line built from its stored method and reference — never
   * the payment-receipt wording the two legacy flows derive.
   */
  record?: {
    issueDate: Date;
    statusLabel: string;
    statusPaid: boolean;
    /** "Mode de paiement : … · Réglée le … · Réf. …"; null hides the block. */
    paymentText: string | null;
    showBank: boolean;
  };
}

/** The money columns of a stored invoice, as numbers. */
export interface InvoiceRecordMoney {
  status: InvoiceStatus;
  pricesIncludeTax: boolean;
  tvaRate: number;
  discountAmount: number;
  /** Set when the remise was typed as a percentage: printed "Remise (10 %)". */
  discountPercent?: number | null;
  stampDuty: number;
  subTotalHt: number;
  tvaAmount: number;
  totalTtc: number;
  withholdingRate: number | null;
  withholdingAmount: number;
  netPayable: number;
  /**
   * "Reste à payer" on the devis right after the payment this facture
   * records, frozen at issue (spec §4). null / absent: not an installment
   * facture, or one issued before 2026-11-27: no row.
   */
  quoteRemainingAfter?: number | null;
}

/**
 * The totals block of a stored invoice, read from the row (InvoiceService
 * owns the maths; a PDF prints exactly what was stored), in the order the
 * owner asked for:
 *   [Total TTC brut | Total HT brut, Remise]   only with a discount
 *   Total HT, TVA (r %), Droit de timbre (when > 0), Total TTC
 *   [Retenue à la source (r %), Net à payer]  only with a withholding
 *   [Montant payé = net]                       only when paid
 *   [Reste à payer sur le devis]               only when frozen at issue
 * The stamp is ADDED (HT + TVA + timbre = Total TTC), the retenue is on
 * the TTC without the stamp, and Net à payer = Total TTC - retenue. The
 * retenue rows print only for a retenue the payment really applied: the
 * payment entry points (and the manual invoice) refuse one the rule does
 * not allow (switched off, base under the threshold snapshotted on the
 * row), so a recorded amount is an eligible one, and the PDF never
 * re-decides it.
 * The last money row of the list is the dark "final" one.
 */
export function buildInvoiceRecordTotals(
  inv: InvoiceRecordMoney,
  labels: InvoiceLabels,
  money: (value: number) => string,
  rate: (value: number) => string,
): InvoiceTotalLine[] {
  const totals: InvoiceTotalLine[] = [];
  const discount = Math.max(0, inv.discountAmount);
  const withholding = Math.max(0, inv.withholdingAmount);
  // Rows written before the column existed carry netPayable = totalTtc
  // (migration backfill); the fallback only guards a row left at 0.
  const net =
    withholding > 0 || inv.netPayable > 0 ? inv.netPayable : inv.totalTtc;

  // With a discount the reader needs the gross figure, the discount, then
  // the net. TTC pricing discounts the TTC of the lines (the stamp is
  // added after, so it is no part of the gross); HT pricing the HT.
  if (discount > 0) {
    const grossTtc =
      Math.round(
        (inv.totalTtc - Math.max(0, inv.stampDuty) + discount) * 1000,
      ) / 1000;
    totals.push(
      inv.pricesIncludeTax
        ? { label: labels.grossTtc, value: money(grossTtc) }
        : { label: labels.grossHt, value: money(inv.subTotalHt + discount) },
    );
    const percent = Number(inv.discountPercent ?? 0);
    totals.push({
      label:
        percent > 0
          ? `${labels.discount} (${rate(percent)} %)`
          : labels.discount,
      value: `- ${money(discount)}`,
    });
  }
  totals.push({ label: labels.subtotalHt, value: money(inv.subTotalHt) });
  totals.push({
    label: `${labels.vatRate} (${rate(inv.tvaRate)} %)`,
    value: money(inv.tvaAmount),
  });
  if (inv.stampDuty > 0) {
    totals.push({ label: labels.stampDuty, value: money(inv.stampDuty) });
  }
  totals.push({
    label: labels.totalTtc,
    value: money(inv.totalTtc),
    kind: withholding > 0 ? 'normal' : 'final',
  });
  if (withholding > 0) {
    totals.push({
      label: labels.withholding(
        inv.withholdingRate ? rate(inv.withholdingRate) : null,
      ),
      value: `- ${money(withholding)}`,
    });
    totals.push({ label: labels.netPayable, value: money(net), kind: 'final' });
  }
  if (inv.status === InvoiceStatus.paid) {
    totals.push({ label: labels.amountPaid, value: money(net), kind: 'paid' });
  }
  if (
    inv.quoteRemainingAfter !== null &&
    inv.quoteRemainingAfter !== undefined &&
    Number.isFinite(inv.quoteRemainingAfter)
  ) {
    totals.push({
      label: labels.quoteRemaining,
      value: money(Math.max(0, inv.quoteRemainingAfter)),
    });
  }
  return totals;
}

/**
 * The settlement line of a stored invoice: "Mode de paiement : Carte
 * bancaire · Réglée le 19 nov. 2026 · Réf. 123". "Réglée le" only when the
 * invoice is paid; null when there is nothing to say (the block is hidden).
 */
export function invoiceRecordPaymentText(args: {
  method: PaymentMethod | null;
  reference: string | null;
  paidAt: Date | null;
  paid: boolean;
  labels: InvoiceLabels;
  formatDate: (date: Date) => string;
}): string | null {
  const { labels } = args;
  const parts: string[] = [];
  if (args.method) {
    parts.push(
      `${labels.paymentMethod}${labels.sep}${paymentMethodLabel(args.method, labels)}`,
    );
  }
  if (args.paid && args.paidAt) {
    parts.push(`${labels.settledOn} ${args.formatDate(args.paidAt)}`);
  }
  // A generated placeholder (cash_<uuid>…) is never printed as a reference.
  const reference = invoicePaymentReference(args.reference);
  if (reference) parts.push(`${labels.referenceShort} ${reference}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function paymentMethodLabel(
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
    case PaymentMethod.cheque:
      return labels.methodCheque;
    default:
      return String(method);
  }
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
    const payload = await this.loadPaymentForRender(
      args.paymentId,
      args.language,
    );
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
        // No live practitioner read: the stored facture prints its own
        // snapshot (clientIsPractitioner, clientClinicName, spec §6), so
        // renaming a doctor or his practice never rewrites it.
      },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const settings = await this.settingsService.requireActive();
    const lang: InvoiceLanguage =
      language ??
      ((invoice.language === 'en' ? 'en' : 'fr') as InvoiceLanguage);
    const labels = getInvoiceLabels(lang);
    const currency = invoice.currency || settings.defaultCurrency || 'TND';
    const n = (v: unknown): number => this.toNumber(v);

    // The address / phone / e-mail / tax id come from the invoice's client
    // snapshot through the same mergeClinic seam the receipts use. The
    // name and the clinic lead the box instead (billedToLead).
    const clientSnapshot = {
      clinicName: null,
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

    const totals = buildInvoiceRecordTotals(
      {
        status: invoice.status,
        pricesIncludeTax: invoice.pricesIncludeTax,
        tvaRate: n(invoice.tvaRate),
        discountAmount: n(invoice.discountAmount),
        discountPercent:
          invoice.discountPercent === null ? null : n(invoice.discountPercent),
        stampDuty: n(invoice.stampDuty),
        subTotalHt: n(invoice.subTotalHt),
        tvaAmount: n(invoice.tvaAmount),
        totalTtc: n(invoice.totalTtc),
        withholdingRate:
          invoice.withholdingRate === null ? null : n(invoice.withholdingRate),
        withholdingAmount: n(invoice.withholdingAmount),
        netPayable: n(invoice.netPayable),
        quoteRemainingAfter:
          invoice.quoteRemainingAfter === null
            ? null
            : n(invoice.quoteRemainingAfter),
      },
      labels,
      (v) => this.formatMoney(v, currency, lang),
      (v) => this.formatRate(v, lang),
    );

    const paid = invoice.status === InvoiceStatus.paid;
    const sep = labels.sep;
    // "Docteur : <name>" + the practice only for an invoice billed to its
    // practitioner in his own name, as decided at creation and frozen on
    // the row (clientIsPractitioner, clientClinicName; rows issued before
    // 2026-11-27 were backfilled once by the migration). Invoices that
    // billed a patient or a company name keep their plain client name.
    const billedToLead = invoice.clientIsPractitioner
      ? [
          { text: `${labels.doctor}${sep}${invoice.clientName}`, strong: true },
          { text: invoice.clientClinicName ?? '' },
        ]
      : [{ text: invoice.clientName, strong: true }];

    return {
      payment: {
        id: invoice.id,
        amount: invoice.totalTtc,
        // Drives nothing visible on a record (the `record` block below
        // overrides status, date and settlement); kept coherent anyway.
        status: paid
          ? PaymentRecordStatus.success
          : PaymentRecordStatus.pending,
        paymentMethod: invoice.paymentMethod ?? PaymentMethod.cash,
        transactionId: invoice.paymentReference,
        paidAt: invoice.paidAt,
        createdAt: invoice.issueDate,
        invoiceNumber: invoice.invoiceNumber,
        withholdingAmount: invoice.withholdingAmount,
        withholdingRate: invoice.withholdingRate,
        stampAmount: invoice.stampDuty,
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
          // Real order code when the invoice is attached to one, empty
          // otherwise — never the invoice number dressed up as an order.
          orderCode: invoice.order?.orderCode ?? '',
          doctor: {
            id: invoice.doctorId ?? '',
            fullName: invoice.clientName,
            // Blank on purpose: the snapshot already prints the e-mail and
            // phone once; the receipt seam would print them a second time.
            email: '',
            phone: null,
            dentistProfile: null,
          },
          patient: { fullName: invoice.patient?.fullName ?? '' },
        },
      },
      installment: null,
      settings,
      language: lang,
      rows,
      totals,
      documentTitle: labels.invoiceTitle,
      columnLabels: { unitPrice: labels.unitPriceHt, amount: labels.amountHt },
      // Owner decision: the customer of every new invoice is the
      // practitioner; older rows keep the client they billed.
      billedToLead,
      billedToTail: [
        {
          text: invoice.patient
            ? `${labels.patient}${sep}${invoice.patient.fullName}`
            : '',
        },
        {
          text: invoice.order
            ? `${labels.order}${sep}${invoice.order.orderCode}`
            : '',
        },
      ],
      record: {
        issueDate: invoice.issueDate,
        statusLabel: this.invoiceStatusLabel(invoice.status, labels),
        statusPaid: paid,
        paymentText: invoiceRecordPaymentText({
          method: invoice.paymentMethod,
          reference: invoice.paymentReference,
          paidAt: invoice.paidAt,
          paid,
          labels,
          formatDate: (d) => this.formatDate(d, lang),
        }),
        // The RIB is what an unpaid invoice is settled against, and what a
        // transfer was wired to.
        showBank:
          invoice.paymentMethod === PaymentMethod.bank_transfer ||
          invoice.status === InvoiceStatus.issued,
      },
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
    // Treatment-fee card attempts also live in Payment for provider
    // reconciliation, but their receipt uses the dedicated order-level
    // renderer below. This path is strictly for quotation installments.
    if (!payment.quotation) {
      throw new NotFoundException('Installment payment receipt not found.');
    }

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
    const finalLanguage: InvoiceLanguage = language ?? snapshotLanguage ?? 'fr';

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
        treatmentFeeWithholdingAmount: true,
        treatmentFeeWithholdingRate: true,
        treatmentFeeStampAmount: true,
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

    // No number is allocated here any more: a settled fee is invoiced in
    // the single FAC- series by InvoiceAutoService, which writes that
    // number onto the order. This renderer is only the last-resort
    // fallback, so it prints what the order carries (or an id-derived
    // TF-XXXXXXXX for an unsettled fee) and never advances a counter.
    const invoiceNumber = order.treatmentFeeInvoiceNumber;

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
      withholdingAmount:
        order.treatmentFeeWithholdingAmount ?? new Prisma.Decimal(0),
      withholdingRate: order.treatmentFeeWithholdingRate,
      // Charged on top with the fee's payment; none before 2026-11-20.
      stampAmount: order.treatmentFeeStampAmount ?? new Prisma.Decimal(0),
    };

    return {
      payment,
      quotation: {
        id: order.id,
        // The CBCT snapshot carries the merchant currency at request
        // time (follows defaultCurrency); fall back to TND for orders
        // without one — same value the fee has always been billed in.
        currency: order.cbctFeeCurrency ?? 'TND',
        // The fee is priced TTC like everything else (owner decision,
        // 2026-11-19): the company rate, split backwards.
        tvaRate: resolveTvaRate(null, settings.defaultTvaRate),
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
    const { payment, quotation, settings, language } = payload;
    const numberFallbackPrefix = payload.numberFallbackPrefix ?? 'INV';
    const labels = getInvoiceLabels(language);
    const companySnapshot = this.asJsonRecord(quotation.companySnapshot);
    const clinicSnapshot = this.asJsonRecord(quotation.clinicSnapshot);
    const company = this.mergeCompany(settings, companySnapshot);
    const clinic = this.mergeClinic(quotation.order.doctor, clinicSnapshot);
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
    const record = payload.record;
    const statusLabel =
      record?.statusLabel ?? this.statusLabel(payment.status, labels);
    const statusPaid =
      record?.statusPaid ?? payment.status === PaymentRecordStatus.success;
    // The document's own date: a stored invoice's issue date, otherwise
    // the day the money landed. Never the render day — re-downloading an
    // invoice must not re-date it.
    const documentDate =
      record?.issueDate ?? payment.paidAt ?? payment.createdAt;
    const paymentText = record
      ? record.paymentText
      : this.paymentSummary(payload, labels);
    const showBank = record ? record.showBank : this.shouldShowBank(payment);

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
          <h1 class="title">${this.html((payload.documentTitle ?? labels.documentTitle).toUpperCase())}</h1>
        </div>
        <div class="doc-meta">
          <div class="meta-line">${this.html(labels.number)}: <strong>${this.html(this.invoiceNumber(payment, numberFallbackPrefix))}</strong></div>
          <div class="meta-line">${this.html(labels.date)}: ${this.html(this.formatDate(documentDate, language))}</div>
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
            // A manual invoice supplies its own lead lines; the receipt
            // flows keep the practitioner + patient/order pair.
            ...(payload.billedToLead ?? [
              {
                text: `${labels.doctor}: ${clinic.doctorFullName}`,
                strong: true,
              },
              {
                text: `${labels.forPatient}: ${quotation.order.patient.fullName} (${labels.order}: ${quotation.order.orderCode})`,
              },
            ]),
            { text: clinic.clinicName ?? '' },
            { text: clinic.clinicAddress ?? '' },
            { text: clinicCity },
            // THE contact (DECISIONS §6): practice first, account fallback,
            // printed once.
            { text: clinic.contactPhone ?? '' },
            { text: clinic.contactEmail ?? '' },
            {
              text: clinic.taxId ? `${labels.taxNumber}: ${clinic.taxId}` : '',
            },
            ...(payload.billedToTail ?? []),
          ])}
        </article>
      </section>

      <section class="section">
        <table>
          <thead>
            <tr>
              <th class="desc">${this.html(labels.description)}</th>
              <th class="qty">${this.html(labels.quantity)}</th>
              <th class="unit">${this.html(payload.columnLabels?.unitPrice ?? labels.unitPrice)}</th>
              <th class="amount">${this.html(payload.columnLabels?.amount ?? labels.amount)}</th>
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

      ${
        paymentText
          ? `<section class="text-block">
        <h2 class="text-block-title">${this.html(labels.paymentDetails)}</h2>
        <p class="text-block-body">${this.html(paymentText)}</p>
      </section>`
          : ''
      }

      <footer class="footer">
        <p>${this.html(labels.legalNotice)}</p>
        ${legal ? `<p>${this.html(legal)}</p>` : ''}
        ${
          showBank && bank && Object.values(bank).some(Boolean)
            ? `<div class="bank-title">${this.html(labels.bankDetails)}</div>
             <div class="bank-grid">
               ${this.renderBankLine(labels.bankName, bank.bankName)}
               ${this.renderBankLine(labels.accountName, bank.accountName)}
               ${this.renderBankLine(labels.rib, bank.rib)}
               ${this.renderBankLine(labels.iban, bank.iban)}
               ${this.renderBankLine(labels.swift, bank.swift)}
             </div>`
            : ''
        }
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
   * The doctor/clinic block: the snapshot wins key by key (the devis'
   * clinicSnapshot, or a stored invoice's client columns); the live
   * profile only fills a key the snapshot lacks, which only happens on
   * the legacy receipt renderers (a stored invoice passes no live
   * profile). The contact is THE contact (practice first, account
   * fallback, `doctorContact`): the snapshot's own contact keys when it
   * has them (devis sent since 2026-11-27), else its practice phone /
   * e-mail, else the live rule.
   */
  private mergeClinic(
    doctor: InvoiceRenderPayload['quotation']['order']['doctor'],
    snapshot: JsonRecord | null,
  ): {
    doctorFullName: string;
    clinicName: string | null;
    clinicAddress: string | null;
    city: string | null;
    country: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    taxId: string | null;
  } {
    const fromSnap = (key: string): string | null => {
      const v = snapshot?.[key];
      return typeof v === 'string' && v.trim().length > 0 ? v : null;
    };
    const profile = doctor.dentistProfile;
    const live = doctorContact(
      { phone: doctor.phone ?? null, email: doctor.email || null },
      profile,
    );
    return {
      doctorFullName: fromSnap('doctorFullName') ?? doctor.fullName,
      clinicName: fromSnap('clinicName') ?? profile?.clinicName ?? null,
      clinicAddress:
        fromSnap('clinicAddress') ?? profile?.clinicAddress ?? null,
      city: fromSnap('city') ?? profile?.city ?? null,
      country: fromSnap('country') ?? profile?.country ?? null,
      contactPhone:
        fromSnap('contactPhone') ??
        fromSnap('clinicPhone') ??
        fromSnap('doctorPhone') ??
        live.contactPhone,
      contactEmail:
        fromSnap('contactEmail') ??
        fromSnap('clinicEmail') ??
        fromSnap('doctorEmail') ??
        live.contactEmail,
      // Doctor's "Matricule fiscal" — snapshot wins (for historical
      // quotes that locked it in) then the live dentist profile.
      taxId: fromSnap('taxId') ?? profile?.taxId ?? null,
    };
  }

  /**
   * What a payment settled on the devis (TTC, stamp excluded): cash +
   * retenue - the stamp charged on top, in millimes. Never negative.
   */
  private settledOf(payment: InvoicePaymentView): number {
    const millimes = (v: unknown) => Math.round(this.toNumber(v) * 1000);
    const settled =
      millimes(payment.amount) +
      Math.max(0, millimes(payment.withholdingAmount)) -
      Math.max(0, millimes(payment.stampAmount));
    return Math.max(0, settled) / 1000;
  }

  private buildLineItems(
    payload: InvoiceRenderPayload,
    labels: InvoiceLabels,
  ): InvoiceLineRow[] {
    const { payment, quotation, installment } = payload;
    // The TTC billed = what the payment settled: cash received + what the
    // practitioner withheld - the stamp charged on top (its own row).
    const amount = this.settledOf(payment);

    // Treatment-fee invoice whose order snapshotted a CBCT supplement →
    // break the single billed amount into its two components so the
    // doctor sees what the supplement cost. The rows sum back to the
    // same settled amount, so the totals section is untouched.
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

    const description = installment ? packLabel : labels.treatmentFee;
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
    const money = (v: number): string =>
      this.formatMoney(v, quotation.currency, language);
    // Prices are TTC (TVA inside) and the droit de timbre is ADDED on top
    // of every payment (owner decision, 2026-11-20). What the payment
    // settled (cash + retenue - stamp) is split backwards into HT and TVA,
    // the payment's own stamp is added, the retenue comes off:
    //   HT + TVA = settled    settled + timbre = Total TTC
    //   Total TTC - retenue = Net à payer = the cash
    // The stamp is the one the payment snapshotted, never the live
    // setting: a payment made before 2026-11-20 carries none.
    const withheld = Math.max(0, this.toNumber(payment.withholdingAmount));
    const cash = this.toNumber(payment.amount);
    const stamp = Math.max(0, this.toNumber(payment.stampAmount));
    const rate = resolveTvaRate(quotation.tvaRate, settings.defaultTvaRate);
    const split = splitInclusive(this.settledOf(payment), rate, 0);
    const total = split.total.plus(stamp);

    const lines: InvoiceTotalLine[] = [
      { label: labels.subtotalHt, value: money(toAmount(split.ht)) },
      {
        label: `${labels.vatRate} (${this.formatRate(rate, language)} %)`,
        value: money(toAmount(split.tva)),
      },
    ];
    if (stamp > 0) {
      lines.push({ label: labels.stampDuty, value: money(toAmount(stamp)) });
    }
    lines.push({
      label: labels.totalTtc,
      value: money(toAmount(total)),
      kind: withheld > 0 ? 'normal' : 'final',
    });
    if (withheld > 0) {
      // The rate the payment recorded (snapshot), never the live setting.
      const withheldRate =
        payment.withholdingRate === null ||
        payment.withholdingRate === undefined
          ? null
          : this.toNumber(payment.withholdingRate);
      lines.push({
        label: labels.withholding(
          withheldRate && withheldRate > 0
            ? this.formatRate(withheldRate, language)
            : null,
        ),
        value: `- ${money(withheld)}`,
      });
      lines.push({
        label: labels.netPayable,
        value: money(cash),
        kind: 'final',
      });
    }
    lines.push({
      label: labels.amountPaid,
      value: money(cash),
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
    const reference = invoicePaymentReference(payment.transactionId);
    const tx = reference ? `${labels.transactionRef}: ${reference}` : '';
    const when = this.formatDate(payment.paidAt ?? payment.createdAt, language);
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

  private resolveImageDataUrl(
    relPath: string | null | undefined,
  ): string | null {
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
    if (typeof value === 'number')
      return Number.isFinite(value) ? value : fallback;
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

  private methodLabel(method: PaymentMethod, labels: InvoiceLabels): string {
    return paymentMethodLabel(method, labels);
  }

  /** A stored invoice's own status, in its own (feminine) vocabulary. */
  private invoiceStatusLabel(
    status: InvoiceStatus,
    labels: InvoiceLabels,
  ): string {
    switch (status) {
      case InvoiceStatus.paid:
        return labels.invoiceStatusPaid;
      case InvoiceStatus.issued:
        return labels.invoiceStatusIssued;
      case InvoiceStatus.cancelled:
        return labels.invoiceStatusCancelled;
      default:
        return labels.invoiceStatusDraft;
    }
  }

  /** 19 -> "19", 1.5 -> "1,5" (fr) / "1.5" (en). */
  private formatRate(rate: number, language: InvoiceLanguage): string {
    const value = Number.isFinite(rate) ? rate : 0;
    return value.toLocaleString(language === 'en' ? 'en-GB' : 'fr-FR', {
      maximumFractionDigits: 2,
    });
  }

  private html(value: unknown): string {
    return printable(value)
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
