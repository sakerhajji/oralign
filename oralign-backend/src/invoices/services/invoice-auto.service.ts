import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  InvoiceStatus,
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyBillingSettingsService } from '../../quotations/services/company-billing-settings.service';
import {
  dec,
  inclusiveInvoiceTotals,
  resolveTvaRate,
  round3,
  toAmount,
} from '../../common/billing/tax-split';
import {
  buildDoctorBillingSnapshot,
  DOCTOR_BILLING_SELECT,
  practitionerInvoiceClient,
  type DoctorBillingSource,
} from '../../common/doctor/doctor-billing-snapshot';
import { getInvoiceLabels, type InvoiceLanguage } from './invoice-i18n';
import { InvoiceMailService } from './invoice-mail.service';
import { invoicePaymentReference } from './payment-reference';
import { quoteRemainingAfter } from './quote-balance';
import { NotificationEvents } from '../../notifications/events/notification-events';

/** Automatic invoices are Tunisian fiscal documents: always in French. */
const AUTOMATIC_INVOICE_LANGUAGE: InvoiceLanguage = 'fr';

type MoneyLike = Prisma.Decimal | number | string | null | undefined;

/**
 * What a payment settled on the devis (TTC, stamp excluded): the cash
 * charged, plus the retenue kept back, minus the stamp charged on top.
 * Never negative: a malformed row bills nothing rather than a credit.
 */
export function settledAmount(
  cash: MoneyLike,
  withholding: MoneyLike,
  stamp: MoneyLike,
): Prisma.Decimal {
  const settled = round3(dec(cash).plus(dec(withholding)).minus(dec(stamp)));
  return settled.isNegative() ? new Prisma.Decimal(0) : settled;
}

export interface AutoInvoiceResult {
  created: boolean;
  invoiceId?: string;
}

export interface AutoInvoiceOptions {
  /**
   * E-mail the PDF to the practitioner once the invoice is created. On for
   * every live payment (the event listeners); off for the backfill and for
   * a facture minted because someone opened the document (the download
   * routes), which concern payments settled long ago and must never flood
   * practitioners.
   */
  notify?: boolean;
}

/**
 * The practitioner as the facture snapshots him: the shared billing
 * select (practice, contact, identifiers), plus the language his covering
 * e-mail is written in.
 */
const DOCTOR_SELECT = {
  ...DOCTOR_BILLING_SELECT,
  preferredLanguage: true,
} satisfies Prisma.UserSelect;

/**
 * Automatic invoicing.
 *
 * Every payment that reaches `success` — card, bank transfer, cash or
 * cheque, installment or treatment fee (+ CBCT) — gets a FACTURE in the
 * single FAC- series, so the admin desk at /dashboard/invoices shows the
 * real billing history and the practitioner receives a fiscal document
 * for every payment (owner decision, 2026-11-19: never a "reçu").
 *
 * Money (owner decision 2026-11-20): prices are TTC with TVA inside, and
 * the droit de timbre is ADDED on top of every payment, since every
 * payment gets its own facture. The TTC lines an invoice bills are what
 * the payment settled on the devis (the installment, or the fee + CBCT):
 *
 *     settled   = cash + retenue - timbre
 *     Total TTC = settled + timbre
 *     Net       = Total TTC - retenue = the cash
 *
 * HT and TVA are derived backwards from `settled` by the shared helper,
 * the stamp is the one the payment snapshotted (Payment.stampAmount,
 * DentalOrder.treatmentFeeStampAmount; 0 on payments made before the
 * change, whose formula still holds), and the retenue is copied from the
 * payment as recorded — never recomputed.
 *
 * Why a listener rather than a call inside PaymentsService:
 *   • PaymentsService / TreatmentFeeService already emit their events
 *     AFTER the transaction commits. Hooking there means the money path
 *     is untouched and cannot be broken by anything that happens here.
 *   • InvoicesModule already imports PaymentsModule; calling the other way
 *     round would close a dependency cycle. The bus keeps them decoupled.
 *
 * Dates: an automatic invoice is ISSUED when it is generated (issueDate =
 * issuedAt = now) and PAID on the settlement date (paidAt, printed "Réglée
 * le"). For a live payment both are the same moment; for a payment
 * invoiced later (backfill, a download) the FAC series stays chronological
 * instead of numbering a November facture into September.
 *
 * Failure policy: generation is BEST-EFFORT. A payment is money that
 * changed hands; an invoice is a document. If the document fails, the
 * payment must still stand — errors are logged, never rethrown. Nothing
 * is lost either, because `backfill()` (and the practitioner's download)
 * can mint what is missing later.
 */
@Injectable()
export class InvoiceAutoService {
  private readonly logger = new Logger(InvoiceAutoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingSettings: CompanyBillingSettingsService,
    private readonly invoiceMail: InvoiceMailService,
  ) {}

  /**
   * The three events that mean "installment money settled", all carrying
   * `paymentId`. Listed one by one on purpose: a `payment.*` wildcard would
   * also catch payment.declared and payment.rejected, which must NOT be
   * invoiced.
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
   * The treatment fee (+ CBCT) settled: paid by card or recorded in cash /
   * cheque (TreatmentFeePaid), or a bank transfer confirmed by an admin
   * (TreatmentFeeConfirmed). TreatmentFeeDeclared is NOT money yet.
   */
  @OnEvent(NotificationEvents.TreatmentFeePaid)
  @OnEvent(NotificationEvents.TreatmentFeeConfirmed)
  async onTreatmentFeeSettled(payload: { orderId?: string }): Promise<void> {
    if (!payload?.orderId) return;
    try {
      await this.generateForTreatmentFee(payload.orderId);
    } catch (error) {
      this.logger.error(
        `Automatic treatment-fee invoice for order ${payload.orderId} failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Create the invoice for a successful payment. Safe to call twice: the
   * `Invoice.paymentId` unique index is the real guard, and a losing race
   * is caught and treated as "already done". A treatment-fee card payment
   * is invoiced on its order (generateForTreatmentFee), which links it.
   */
  async generateForPayment(
    paymentId: string,
    opts: AutoInvoiceOptions = {},
  ): Promise<AutoInvoiceResult> {
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
            id: true,
            tvaRate: true,
            currency: true,
            packName: true,
            // The devis total, for the "Reste à payer" the facture freezes.
            totalPrice: true,
            totalTtc: true,
          },
        },
        installment: { select: { installmentNumber: true, quotationId: true } },
        order: {
          select: {
            id: true,
            orderCode: true,
            patientId: true,
            doctorId: true,
            doctor: { select: DOCTOR_SELECT },
          },
        },
      },
    });

    if (!payment || payment.status !== PaymentRecordStatus.success) {
      return { created: false };
    }
    if (payment.purpose === PaymentPurpose.treatment_fee) {
      return this.generateForTreatmentFee(payment.orderId, opts);
    }
    if (payment.purpose !== PaymentPurpose.installment) {
      return { created: false };
    }

    const settings = await this.billingSettings.requireActive();
    const doctor = payment.order.doctor;
    // The FACTURE itself is always French: it is a Tunisian fiscal
    // document, and `preferredLanguage` defaults to English for every
    // account, so it cannot tell a real choice from the default. Only the
    // covering e-mail follows the practitioner's language.
    const language: InvoiceLanguage = AUTOMATIC_INVOICE_LANGUAGE;
    const labels = getInvoiceLabels(language);

    // ── Money ────────────────────────────────────────────────────────
    // What the payment settled on the devis (the installment amount) is
    // the fixed point: the cash that changed hands, plus what the
    // practitioner withheld, minus the stamp charged on top. HT/TVA come
    // out of it backwards, the payment's own stamp is added, and the
    // retenue is the one the payment recorded (its net is the cash).
    const stamp = round3(payment.stampAmount);
    const settled = settledAmount(
      payment.amount,
      payment.withholdingAmount,
      stamp,
    );
    const tvaRate = resolveTvaRate(
      payment.quotation?.tvaRate,
      settings.defaultTvaRate,
    );
    const totals = inclusiveInvoiceTotals(
      [{ quantity: 1, unitPriceTtc: settled }],
      tvaRate,
      0,
      stamp,
    );
    const withholdingAmount = toAmount(payment.withholdingAmount);
    // What the devis still asked for right after this payment, frozen on
    // the facture ("Reste à payer", spec §4).
    const remainingAfter = payment.quotation
      ? await this.quoteRemainingAfter(payment.quotation, {
          id: payment.id,
          settled,
          at: payment.paidAt ?? payment.createdAt,
        })
      : null;

    // ── Line: what was actually billed ───────────────────────────────
    const description = payment.installment
      ? `${payment.quotation?.packName ?? payment.order.orderCode} — ${labels.installmentLine(
          payment.installment.installmentNumber,
          await this.countInstallments(payment.installment.quotationId),
        )}`
      : (payment.quotation?.packName ?? payment.order.orderCode);

    // ── Number: reuse the payment's own, or allocate once for both ───
    // One payment, one document number: the payments desk and this
    // invoice must never disagree.
    let invoiceNumber = payment.invoiceNumber;
    if (!invoiceNumber) {
      invoiceNumber = await this.billingSettings.allocateInvoiceNumber();
      // Guarded update: if a concurrent writer allocated first, this
      // writes nothing and we re-read the winner below.
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

    const paidAt = payment.paidAt ?? payment.createdAt;
    const issuedAt = new Date();
    try {
      const invoice = await this.prisma.invoice.create({
        data: {
          invoiceNumber,
          paymentId: payment.id,
          status: InvoiceStatus.paid,
          orderId: payment.order.id,
          patientId: payment.order.patientId,
          doctorId: payment.order.doctorId,
          ...this.clientBlock(doctor),
          issueDate: issuedAt,
          currency:
            payment.quotation?.currency ?? settings.defaultCurrency ?? 'TND',
          language,
          tvaRate,
          discountAmount: 0,
          stampDuty: toAmount(totals.stamp),
          subTotalHt: toAmount(totals.subTotalHt),
          tvaAmount: toAmount(totals.tvaAmount),
          totalTtc: toAmount(totals.totalTtc),
          pricesIncludeTax: true,
          paymentMethod: payment.paymentMethod,
          // A generated placeholder (cash_<uuid>…) is not a reference.
          paymentReference: invoicePaymentReference(payment.transactionId),
          withholdingRate:
            withholdingAmount > 0 && payment.withholdingRate !== null
              ? toAmount(payment.withholdingRate)
              : null,
          withholdingAmount,
          netPayable: toAmount(payment.amount),
          // The retenue threshold the payment was charged under (snapshot).
          withholdingThreshold: payment.withholdingThreshold,
          quoteRemainingAfter: remainingAfter,
          notes: null,
          companySnapshot: this.companySnapshot(settings),
          createdByName: 'Automatique',
          issuedAt,
          paidAt,
          lines: {
            create: [
              {
                position: 0,
                description,
                quantity: 1,
                unitPrice: toAmount(totals.unitHt[0]),
                unitPriceTtc: toAmount(settled),
                tvaRate: null,
                lineHt: toAmount(totals.lineHt[0]),
              },
            ],
          },
        },
        select: { id: true, invoiceNumber: true },
      });

      this.logger.log(
        `Invoice ${invoice.invoiceNumber} generated automatically for payment ${payment.id} (${payment.paymentMethod})`,
      );
      this.afterCreate(invoice.id, opts);
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
        // Race lost on paymentId: the invoice exists — that is success.
        if (winner) return { created: false, invoiceId: winner.id };
        // No winner => the collision was on invoiceNumber, not paymentId.
        // Swallowing it would leave this payment invoiceless FOREVER
        // (every retry reuses the same conflicting number). Surface it.
        throw error;
      }
      throw error;
    }
  }

  /**
   * The FACTURE of an order's treatment fee (+ CBCT supplement), however
   * it was settled. A fee paid in cash, by cheque or by transfer has no
   * Payment row, so `Invoice.treatmentFeeOrderId` (unique) is the
   * idempotency key; a card fee also links its Payment.
   *
   * Only a settled fee is invoiced: status success, paid date set, and not
   * a welcome-gift order (nothing was paid on those).
   */
  async generateForTreatmentFee(
    orderId: string,
    opts: AutoInvoiceOptions = {},
  ): Promise<AutoInvoiceResult> {
    const existing = await this.prisma.invoice.findUnique({
      where: { treatmentFeeOrderId: orderId },
      select: { id: true },
    });
    if (existing) return { created: false, invoiceId: existing.id };

    const order = await this.prisma.dentalOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderCode: true,
        patientId: true,
        doctorId: true,
        treatmentFeeAmount: true,
        treatmentFeeWithholdingRate: true,
        treatmentFeeWithholdingAmount: true,
        treatmentFeeStampAmount: true,
        treatmentFeeWithholdingThreshold: true,
        treatmentFeePaymentMethod: true,
        treatmentFeePaymentStatus: true,
        treatmentFeePaidAt: true,
        treatmentFeeInvoiceNumber: true,
        cbctFeeAmount: true,
        cbctFeeCurrency: true,
        welcomeGiftAppliedAt: true,
        doctor: { select: DOCTOR_SELECT },
      },
    });
    if (
      !order ||
      order.treatmentFeePaymentStatus !== PaymentRecordStatus.success ||
      !order.treatmentFeePaidAt ||
      order.welcomeGiftAppliedAt ||
      order.treatmentFeeAmount === null
    ) {
      return { created: false };
    }

    // ── Money: fee due = cash + what was withheld - the stamp added ──
    const cash = round3(order.treatmentFeeAmount);
    const withheld = round3(order.treatmentFeeWithholdingAmount ?? 0);
    const stamp = round3(order.treatmentFeeStampAmount ?? 0);
    const due = settledAmount(cash, withheld, stamp);
    if (!due.greaterThan(0)) return { created: false };

    const settings = await this.billingSettings.requireActive();
    const language: InvoiceLanguage = AUTOMATIC_INVOICE_LANGUAGE;
    const labels = getInvoiceLabels(language);

    // Two TTC lines when the order carried a CBCT supplement, so the
    // practitioner sees what the supplement cost; one line otherwise.
    const cbct = round3(order.cbctFeeAmount ?? 0);
    const lineInputs =
      cbct.greaterThan(0) && cbct.lessThan(due)
        ? [
            { description: labels.treatmentFee, ttc: due.minus(cbct) },
            { description: labels.cbctSupplement, ttc: cbct },
          ]
        : [{ description: labels.treatmentFee, ttc: due }];
    const tvaRate = resolveTvaRate(null, settings.defaultTvaRate);
    const totals = inclusiveInvoiceTotals(
      lineInputs.map((l) => ({ quantity: 1, unitPriceTtc: l.ttc })),
      tvaRate,
      0,
      stamp,
    );

    // A card fee keeps its Payment row (provider reconciliation): link it.
    const cardPayment =
      order.treatmentFeePaymentMethod === PaymentMethod.card
        ? await this.prisma.payment.findFirst({
            where: {
              orderId: order.id,
              purpose: PaymentPurpose.treatment_fee,
              status: PaymentRecordStatus.success,
              invoice: { is: null },
            },
            orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
            select: { id: true, invoiceNumber: true, transactionId: true },
          })
        : null;

    const { number: invoiceNumber, legacyReceipt } =
      await this.claimTreatmentFeeNumber(
        order.id,
        order.treatmentFeeInvoiceNumber,
        cardPayment,
        settings.invoicePrefix,
      );

    const withholdingAmount = toAmount(withheld);
    const issuedAt = new Date();
    try {
      const invoice = await this.prisma.invoice.create({
        data: {
          invoiceNumber,
          treatmentFeeOrderId: order.id,
          paymentId: cardPayment?.id ?? null,
          status: InvoiceStatus.paid,
          orderId: order.id,
          patientId: order.patientId,
          doctorId: order.doctorId,
          ...this.clientBlock(order.doctor),
          issueDate: issuedAt,
          currency: order.cbctFeeCurrency ?? settings.defaultCurrency ?? 'TND',
          language,
          tvaRate,
          discountAmount: 0,
          stampDuty: toAmount(totals.stamp),
          subTotalHt: toAmount(totals.subTotalHt),
          tvaAmount: toAmount(totals.tvaAmount),
          totalTtc: toAmount(totals.totalTtc),
          pricesIncludeTax: true,
          paymentMethod: order.treatmentFeePaymentMethod,
          paymentReference: invoicePaymentReference(cardPayment?.transactionId),
          withholdingRate:
            withholdingAmount > 0 && order.treatmentFeeWithholdingRate !== null
              ? toAmount(order.treatmentFeeWithholdingRate)
              : null,
          withholdingAmount,
          netPayable: toAmount(cash),
          // The retenue threshold the fee was charged under (snapshot).
          withholdingThreshold: order.treatmentFeeWithholdingThreshold,
          // The receipt the practitioner was handed for this fee keeps a
          // trace: the order still prints it, the facture names it.
          notes: legacyReceipt ? labels.replacesReceipt(legacyReceipt) : null,
          companySnapshot: this.companySnapshot(settings),
          createdByName: 'Automatique',
          issuedAt,
          paidAt: order.treatmentFeePaidAt,
          lines: {
            create: lineInputs.map((line, i) => ({
              position: i,
              description: line.description,
              quantity: 1,
              unitPrice: toAmount(totals.unitHt[i]),
              unitPriceTtc: toAmount(line.ttc),
              tvaRate: null,
              lineHt: toAmount(totals.lineHt[i]),
            })),
          },
        },
        select: { id: true, invoiceNumber: true },
      });

      this.logger.log(
        `Invoice ${invoice.invoiceNumber} generated automatically for the treatment fee of order ${order.id} (${order.treatmentFeePaymentMethod})`,
      );
      this.afterCreate(invoice.id, opts);
      return { created: true, invoiceId: invoice.id };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Lost a race on the order (or on its card payment): it exists.
        const winner =
          (await this.prisma.invoice.findUnique({
            where: { treatmentFeeOrderId: order.id },
            select: { id: true },
          })) ??
          (cardPayment
            ? await this.prisma.invoice.findUnique({
                where: { paymentId: cardPayment.id },
                select: { id: true },
              })
            : null);
        if (winner) return { created: false, invoiceId: winner.id };
        // A collision on the number itself: surface it, as above.
        throw error;
      }
      throw error;
    }
  }

  /**
   * Mint the invoices for payments and treatment fees settled before this
   * feature existed (or whose listener failed). Idempotent by
   * construction, and it never e-mails: these are old payments.
   */
  async backfill(limit = 500): Promise<{ scanned: number; created: number }> {
    const pending = await this.prisma.payment.findMany({
      where: {
        status: PaymentRecordStatus.success,
        purpose: PaymentPurpose.installment,
        invoice: { is: null },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    const fees = await this.uninvoicedTreatmentFees(limit);

    let created = 0;
    for (const { id } of pending) {
      try {
        const res = await this.generateForPayment(id, { notify: false });
        if (res.created) created += 1;
      } catch (error) {
        this.logger.warn(
          `Backfill skipped payment ${id}: ${(error as Error).message}`,
        );
      }
    }
    for (const orderId of fees) {
      try {
        const res = await this.generateForTreatmentFee(orderId, {
          notify: false,
        });
        if (res.created) created += 1;
      } catch (error) {
        this.logger.warn(
          `Backfill skipped the treatment fee of order ${orderId}: ${(error as Error).message}`,
        );
      }
    }
    const scanned = pending.length + fees.length;
    this.logger.log(`Invoice backfill: ${created}/${scanned} created`);
    return { scanned, created };
  }

  /**
   * Settled treatment fees with no invoice yet. `treatmentFeeOrderId` is a
   * plain column (no relation to filter on), so the orders are paged and
   * the invoiced ones dropped, until `limit` candidates are found — the
   * already-invoiced history can never eat the batch.
   */
  private async uninvoicedTreatmentFees(limit: number): Promise<string[]> {
    const PAGE = 200;
    const out: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 100 && out.length < limit; page += 1) {
      const batch = await this.prisma.dentalOrder.findMany({
        where: {
          treatmentFeePaymentStatus: PaymentRecordStatus.success,
          treatmentFeePaidAt: { not: null },
          welcomeGiftAppliedAt: null,
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: PAGE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id;
      const invoiced = await this.prisma.invoice.findMany({
        where: { treatmentFeeOrderId: { in: batch.map((o) => o.id) } },
        select: { treatmentFeeOrderId: true },
      });
      const done = new Set(invoiced.map((i) => i.treatmentFeeOrderId));
      for (const { id } of batch) {
        if (!done.has(id) && out.length < limit) out.push(id);
      }
      if (batch.length < PAGE) break;
    }
    return out;
  }

  /**
   * The FAC- number of a treatment-fee invoice, mirrored on the order (and
   * on the card payment) so every screen prints the same number:
   *   • a card payment's own number wins (the payments desk may have set it);
   *   • then a FAC- number the order already carries (a previous attempt
   *     claimed it before failing);
   *   • otherwise a fresh FAC- number.
   * An order that already prints a number outside the FAC series (a TF-
   * receipt handed out before every fee got a facture) KEEPS it: that is
   * the document the practitioner holds, and overwriting it would leave
   * it untraceable. The FAC number then lives on the invoice (and the card
   * payment) only, and `legacyReceipt` lets the invoice name the receipt
   * it replaces. The claims are compare-and-set, so concurrent generators
   * agree on one number; the loser's allocation is a hole, as for
   * installments (on a legacy order the invoice's unique
   * treatmentFeeOrderId is what keeps a single winner).
   */
  private async claimTreatmentFeeNumber(
    orderId: string,
    current: string | null,
    cardPayment: { id: string; invoiceNumber: string | null } | null,
    invoicePrefix: string | null,
  ): Promise<{ number: string; legacyReceipt: string | null }> {
    const facHead = `${invoicePrefix || 'FAC'}-`;
    const legacyReceipt =
      current && !current.startsWith(facHead) ? current : null;
    let number: string | null =
      cardPayment?.invoiceNumber ?? (legacyReceipt ? null : current);

    if (!number) {
      const allocated = await this.billingSettings.allocateInvoiceNumber();
      if (legacyReceipt) {
        number = allocated;
      } else {
        const claimed = await this.prisma.dentalOrder.updateMany({
          where: { id: orderId, treatmentFeeInvoiceNumber: current },
          data: { treatmentFeeInvoiceNumber: allocated },
        });
        if (claimed.count > 0) {
          number = allocated;
        } else {
          const fresh = await this.prisma.dentalOrder.findUnique({
            where: { id: orderId },
            select: { treatmentFeeInvoiceNumber: true },
          });
          number = fresh?.treatmentFeeInvoiceNumber?.startsWith(facHead)
            ? fresh.treatmentFeeInvoiceNumber
            : allocated;
        }
      }
    } else if (number !== current && !legacyReceipt) {
      // The card payment's number: mirror it on the order.
      await this.prisma.dentalOrder.updateMany({
        where: { id: orderId, treatmentFeeInvoiceNumber: current },
        data: { treatmentFeeInvoiceNumber: number },
      });
    }

    if (cardPayment && cardPayment.invoiceNumber !== number) {
      const claimed = await this.prisma.payment.updateMany({
        where: { id: cardPayment.id, invoiceNumber: null },
        data: { invoiceNumber: number },
      });
      if (claimed.count === 0) {
        // A concurrent generator numbered the payment first: print its
        // number, or the facture and the payments desk would disagree.
        // (On a legacy order nothing else coordinates the two.)
        const fresh = await this.prisma.payment.findUnique({
          where: { id: cardPayment.id },
          select: { invoiceNumber: true },
        });
        number = fresh?.invoiceNumber ?? number;
      }
    }
    return { number, legacyReceipt };
  }

  /** Fire the practitioner's e-mail without delaying the caller. */
  private afterCreate(invoiceId: string, opts: AutoInvoiceOptions): void {
    if (opts.notify === false) return;
    void this.invoiceMail.sendAutomatic(invoiceId);
  }

  /**
   * The customer is the practitioner (owner decision): their name heads
   * the "Facturé à" box and the facture snapshots the rest (spec §6): the
   * practice name, address, contact (practice first, account fallback),
   * tax id and registration number, through the one shared builder. The
   * stored PDF reads these columns only, never the live profile.
   */
  private clientBlock(doctor: DoctorBillingSource | null) {
    return practitionerInvoiceClient(
      doctor ? buildDoctorBillingSnapshot(doctor) : null,
    );
  }

  /**
   * "Reste à payer" on the devis right after the payment: the devis total
   * (the Decimal totalPrice of a pack quote, else the legacy totalTtc)
   * minus what its successful payments up to this one settled. One read
   * of the quote's settled payments (index quotationId).
   */
  private async quoteRemainingAfter(
    quotation: {
      id: string;
      totalPrice: Prisma.Decimal | null;
      totalTtc: number;
    },
    current: { id: string; settled: Prisma.Decimal; at: Date },
  ): Promise<Prisma.Decimal> {
    const payments = await this.prisma.payment.findMany({
      where: {
        quotationId: quotation.id,
        status: PaymentRecordStatus.success,
      },
      select: {
        id: true,
        amount: true,
        withholdingAmount: true,
        stampAmount: true,
        paidAt: true,
        createdAt: true,
      },
    });
    return quoteRemainingAfter(
      quotation.totalPrice ?? quotation.totalTtc,
      payments.map((p) => ({
        id: p.id,
        settled: settledAmount(p.amount, p.withholdingAmount, p.stampAmount),
        at: p.paidAt ?? p.createdAt,
      })),
      current,
    );
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
