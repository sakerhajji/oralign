import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InvoiceStatus, PaymentRecordStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyBillingSettingsService } from '../../quotations/services/company-billing-settings.service';
import { getInvoiceLabels, type InvoiceLanguage } from './invoice-i18n';
import { NotificationEvents } from '../../notifications/events/notification-events';

/** TND carries 3 decimals, like the rest of the ledger. */
const round = (n: number): number =>
  Math.round((Number.isFinite(n) ? n : 0) * 1000) / 1000;

const num = (v: unknown): number => Number(v ?? 0);

/**
 * Automatic invoicing.
 *
 * Every payment that reaches `success` — card, bank transfer or cash —
 * gets an Invoice row, so the admin desk at /dashboard/invoices shows the
 * real billing history instead of only the hand-written invoices.
 *
 * Why a listener rather than a call inside PaymentsService:
 *   • PaymentsService already emits payment.received / payment.confirmed /
 *     payment.cashRecorded AFTER the transaction commits. Hooking there
 *     means the money path is untouched and cannot be broken by anything
 *     that happens here.
 *   • InvoicesModule already imports PaymentsModule; calling the other way
 *     round would close a dependency cycle. The bus keeps them decoupled.
 *
 * Failure policy: generation is BEST-EFFORT. A payment is money that
 * changed hands; an invoice is a document. If the document fails, the
 * payment must still stand — errors are logged, never rethrown. Nothing
 * is lost either, because `backfill()` can mint what is missing later.
 */
@Injectable()
export class InvoiceAutoService {
  private readonly logger = new Logger(InvoiceAutoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingSettings: CompanyBillingSettingsService,
  ) {}

  /**
   * The three events that mean "money settled", all carrying `paymentId`.
   * Listed one by one on purpose: a `payment.*` wildcard would also catch
   * payment.declared and payment.rejected, which must NOT be invoiced.
   */
  @OnEvent(NotificationEvents.PaymentReceived)
  @OnEvent(NotificationEvents.PaymentConfirmed)
  @OnEvent(NotificationEvents.CashPaymentRecorded)
  async onPaymentSucceeded(payload: { paymentId?: string }): Promise<void> {
    if (!payload?.paymentId) return;
    try {
      await this.generateForPayment(payload.paymentId);
    } catch (error) {
      // Swallowed on purpose — see the failure policy above.
      this.logger.error(
        `Automatic invoice for payment ${payload.paymentId} failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Create the invoice for a successful payment. Safe to call twice: the
   * `Invoice.paymentId` unique index is the real guard, and a losing race
   * is caught and treated as "already done".
   */
  async generateForPayment(paymentId: string): Promise<{ created: boolean; invoiceId?: string }> {
    const existing = await this.prisma.invoice.findUnique({
      where: { paymentId },
      select: { id: true },
    });
    if (existing) return { created: false, invoiceId: existing.id };

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        quotation: {
          select: {
            tvaRate: true,
            currency: true,
            packName: true,
            clinicSnapshot: true,
          },
        },
        installment: { select: { installmentNumber: true, quotationId: true } },
        order: {
          select: {
            id: true,
            orderCode: true,
            patientId: true,
            doctorId: true,
            patient: { select: { fullName: true } },
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
          },
        },
      },
    });

    // Only a settled payment is invoiceable.
    if (!payment || payment.status !== PaymentRecordStatus.success) {
      return { created: false };
    }

    const settings = await this.billingSettings.requireActive();
    const language: InvoiceLanguage = 'fr';
    const labels = getInvoiceLabels(language);

    // ── Money ────────────────────────────────────────────────────────
    // `payment.amount` is the TTC that actually changed hands, so it is
    // the fixed point: HT and VAT are derived BACKWARDS from it, exactly
    // as the receipt PDF has always done. Deriving forwards from a net
    // figure could land a millime away from what the doctor was charged.
    const paid = num(payment.amount);
    const tvaRate = num(payment.quotation?.tvaRate ?? settings.defaultTvaRate ?? 19);
    const subTotalHt = round(paid / (1 + tvaRate / 100));
    const tvaAmount = round(paid - subTotalHt);
    // Stamp duty is added on top of the paid amount, matching the receipt.
    const stampDuty = round(num(settings.stampDuty));
    const totalTtc = round(paid + stampDuty);

    // ── Client block: the practitioner who paid ──────────────────────
    const doctor = payment.order.doctor;
    const clinic = doctor?.dentistProfile ?? null;
    const clientName = clinic?.clinicName ?? doctor?.fullName ?? 'Client';

    // ── Line: what was actually billed ───────────────────────────────
    const description = payment.installment
      ? `${payment.quotation?.packName ?? payment.order.orderCode} — ${labels.installmentLine(
          payment.installment.installmentNumber,
          await this.countInstallments(payment.installment.quotationId),
        )}`
      : (payment.quotation?.packName ?? payment.order.orderCode);

    // ── Number: reuse the payment's own, or allocate once for both ───
    // One payment, one document number: the receipt PDF and this invoice
    // must never disagree.
    let invoiceNumber = payment.invoiceNumber;
    if (!invoiceNumber) {
      invoiceNumber = await this.billingSettings.allocateInvoiceNumber();
      // Guarded update: if a concurrent receipt render allocated first,
      // this writes nothing and we re-read the winner below.
      const claimed = await this.prisma.payment.updateMany({
        where: { id: payment.id, invoiceNumber: null },
        data: { invoiceNumber },
      });
      if (claimed.count === 0) {
        const fresh = await this.prisma.payment.findUnique({
          where: { id: payment.id },
          select: { invoiceNumber: true },
        });
        invoiceNumber = fresh?.invoiceNumber ?? invoiceNumber;
      }
    }

    try {
      const invoice = await this.prisma.invoice.create({
        data: {
          invoiceNumber,
          paymentId: payment.id,
          status: InvoiceStatus.paid,
          orderId: payment.order.id,
          patientId: payment.order.patientId,
          doctorId: payment.order.doctorId,
          clientName,
          clientEmail: clinic?.clinicEmail ?? doctor?.email ?? null,
          clientPhone: clinic?.clinicPhone ?? doctor?.phone ?? null,
          clientAddress: clinic?.clinicAddress ?? null,
          clientCity: clinic?.city ?? null,
          clientCountry: clinic?.country ?? null,
          clientTaxId: clinic?.taxId ?? null,
          issueDate: payment.paidAt ?? payment.createdAt,
          currency: payment.quotation?.currency ?? settings.defaultCurrency ?? 'TND',
          language,
          tvaRate,
          discountAmount: 0,
          stampDuty,
          subTotalHt,
          tvaAmount,
          totalTtc,
          notes: null,
          companySnapshot: this.companySnapshot(settings),
          createdByName: 'Automatique',
          issuedAt: payment.paidAt ?? payment.createdAt,
          paidAt: payment.paidAt ?? payment.createdAt,
          lines: {
            create: [
              {
                position: 0,
                description,
                quantity: 1,
                unitPrice: subTotalHt,
                tvaRate,
                lineHt: subTotalHt,
              },
            ],
          },
        },
        select: { id: true, invoiceNumber: true },
      });

      this.logger.log(
        `Invoice ${invoice.invoiceNumber} generated automatically for payment ${payment.id} (${payment.paymentMethod})`,
      );
      return { created: true, invoiceId: invoice.id };
    } catch (error) {
      // P2002 = the unique index fired: another worker won the race and
      // the invoice exists. That is success, not failure.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.prisma.invoice.findUnique({
          where: { paymentId: payment.id },
          select: { id: true },
        });
        return { created: false, invoiceId: winner?.id };
      }
      throw error;
    }
  }

  /**
   * Mint the invoices for payments that succeeded before this feature
   * existed (or whose listener failed). Idempotent by construction.
   */
  async backfill(limit = 500): Promise<{ scanned: number; created: number }> {
    const pending = await this.prisma.payment.findMany({
      where: { status: PaymentRecordStatus.success, invoice: { is: null } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    let created = 0;
    for (const { id } of pending) {
      try {
        const res = await this.generateForPayment(id);
        if (res.created) created += 1;
      } catch (error) {
        this.logger.warn(
          `Backfill skipped payment ${id}: ${(error as Error).message}`,
        );
      }
    }
    this.logger.log(`Invoice backfill: ${created}/${pending.length} created`);
    return { scanned: pending.length, created };
  }

  private async countInstallments(quotationId: string): Promise<number> {
    return this.prisma.quoteInstallment.count({ where: { quotationId } });
  }

  /** Same frozen header the manual flow stores. */
  private companySnapshot(settings: {
    companyName: string;
    companyLogoPath: string | null;
    companyAddress: string | null;
    companyCity: string | null;
    companyCountry: string | null;
    companyPhone: string | null;
    companyEmail: string | null;
    taxRegistrationNumber: string | null;
    legalTextTranslations: Prisma.JsonValue | null;
    footerTextTranslations: Prisma.JsonValue | null;
    bankDetails: Prisma.JsonValue | null;
  }): Prisma.InputJsonValue {
    return {
      companyName: settings.companyName,
      companyLogoPath: settings.companyLogoPath ?? null,
      companyAddress: settings.companyAddress ?? null,
      companyCity: settings.companyCity ?? null,
      companyCountry: settings.companyCountry ?? null,
      companyPhone: settings.companyPhone ?? null,
      companyEmail: settings.companyEmail ?? null,
      taxRegistrationNumber: settings.taxRegistrationNumber ?? null,
      legalTextTranslations: settings.legalTextTranslations ?? null,
      footerTextTranslations: settings.footerTextTranslations ?? null,
      bankDetails: settings.bankDetails ?? null,
    } as Prisma.InputJsonValue;
  }
}
