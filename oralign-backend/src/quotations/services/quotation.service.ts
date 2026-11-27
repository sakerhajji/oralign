import { Injectable, Logger } from '@nestjs/common';
import {
  BatchStatus,
  BatchUnlockSource,
  DevisLanguage,
  InstallmentStatus,
  OrderStatus,
  PaymentMode,
  Prisma,
  Quotation,
  QuotationPaymentStatus,
  QuotationStatus,
  UserRole,
} from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderAccessPolicy } from '../../common/access/order-access.policy';
import {
  CreateQuotationDto,
  QuotationFilterDto,
  UpdateQuotationDto,
} from '../dto/quotation.dto';
import { CompanyBillingSettingsService } from './company-billing-settings.service';
import { QuotationPaymentPlanService } from './quotation-payment-plan.service';
import { QuotationPdfService } from './quotation-pdf.service';
import { readQuoteSnapshots } from './quotation-snapshots';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationEvents } from '../../notifications/events/notification-events';
import { isAdmin, type Caller } from '../../common/access/caller';
import { lookupActorName } from '../../common/access/actor-snapshot';
import { unlockStepBatches } from '../../production/batch-unlock';
import {
  isQuotable,
  QUOTABLE_ORDER_SELECT,
  QUOTATION_ELIGIBILITY_ERROR,
} from '../quotation-eligibility';
import {
  dec,
  resolveTvaRate,
  round3,
  splitInclusive,
  toAmount,
} from '../../common/billing/tax-split';
import {
  advanceOrderWhenPaid,
  assertNoMoneyMoved,
  assertQuoteEditable,
  auditDiff,
  DEAD_PAYMENT_STATUSES,
  emptyQuoteMoney,
  hasFreeStepForReplan,
  IN_FLIGHT_PAYMENT_STATUSES,
  isTtcPriced,
  lockQuoteForEdit,
  type PlanRebalance,
  planRebalance,
  presentQuote,
  presentQuotes,
  quoteActionFlags,
  quoteMoneyEdited,
  type QuoteSettlement,
  quoteUpdateAudit,
  type QuotationView,
  readOneQuoteMoney,
  resetOrderBeforeQuote,
  resolveQuoteDiscount,
  settleQuote,
} from '../quote-money';

export interface QuoteTotals {
  subTotalHt: number;
  tvaAmount: number;
  totalTtc: number;
}

/**
 * Quotation lifecycle service.
 *
 * Lifecycle:
 *   draft → admin creates + iterates on fees + language
 *   sent  → admin sends to doctor; quotationNumber + snapshot frozen
 *   approved → doctor approved (explicitly or by paying a first time)
 *   rejected → doctor rejected; order moves to `canceled`
 *
 * Draft, sent and approved quotes stay editable by the admin; only the
 * installments already paid are frozen (see update()). Recall and delete
 * are allowed while no money was received and none is in flight (see
 * quote-money.ts for what "received" and "in flight" mean).
 *
 * Snapshots (spec §6) — see Prisma comments and quotation-snapshots.ts.
 * `companySnapshot` mirrors CompanyBillingSettings (stamp and retenue rule
 * included) and `clinicSnapshot` the doctor's practice and contact, both
 * REBUILT on every draft -> sent: a recalled devis sent again carries the
 * current data, and the PDF stays faithful to the moment of issue no
 * matter what admins / doctors edit later. A draft never persists one:
 * its PDF renders from snapshots built in memory (QuotationPdfService).
 */
@Injectable()
export class QuotationService {
  private readonly logger = new Logger(QuotationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderAccess: OrderAccessPolicy,
    private readonly settingsService: CompanyBillingSettingsService,
    private readonly paymentPlan: QuotationPaymentPlanService,
    private readonly quotationPdf: QuotationPdfService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── Authorisation helpers ────────────────────────────────────────────────

  /**
   * Returns the order if the caller can READ it (admin, owning dentist,
   * or assigned designer). Throws otherwise.
   */
  private assertOrderReadable(orderId: string, caller: Caller) {
    // Delegates to the single shared rule (common/access/order-access.policy).
    return this.orderAccess.requireReadable(orderId, caller);
  }

  /**
   * 400 SUPPLEMENTAL_NOT_QUOTABLE for a supplemental request that is not
   * approved as chargeable (see quotation-eligibility.ts). No treatment
   * plan is required: a chargeable child is quoted with or without one.
   */
  private async assertQuotable(orderId: string): Promise<void> {
    const order = await this.prisma.dentalOrder.findUnique({
      where: { id: orderId },
      select: QUOTABLE_ORDER_SELECT,
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!isQuotable(order)) {
      throw new BadRequestException(
        'Only a supplemental request approved as chargeable can be quoted.',
        QUOTATION_ELIGIBILITY_ERROR.SUPPLEMENTAL_NOT_QUOTABLE,
      );
    }
  }

  /**
   * Publish a quote decision on the event bus. The notification listener
   * owns every side effect (admin e-mail today; in-app / WS tomorrow) so
   * this service never talks to MailService directly. Fire-and-forget:
   * a listener failure must not unwind the approve/reject transaction.
   */
  private emitQuoteDecision(
    quote: Pick<Quotation, 'id' | 'orderId' | 'quotationNumber' | 'language'>,
    decision: 'approved' | 'rejected',
    reason?: string,
  ): void {
    void this.prisma.dentalOrder
      .findUnique({
        where: { id: quote.orderId },
        select: {
          orderCode: true,
          doctorId: true,
          doctor: { select: { fullName: true } },
          patient: { select: { fullName: true } },
        },
      })
      .then((order) => {
        if (!order) return;
        this.events.emit(
          decision === 'approved'
            ? NotificationEvents.QuotationApproved
            : NotificationEvents.QuotationRejected,
          {
            quotationId: quote.id,
            orderId: quote.orderId,
            orderCode: order.orderCode ?? null,
            doctorId: order.doctorId,
            doctorName: order.doctor?.fullName ?? null,
            patientName: order.patient?.fullName ?? null,
            language: quote.language ?? null,
            quotationNumber: quote.quotationNumber ?? null,
            decision,
            reason: reason ?? null,
          },
        );
      })
      .catch(() => {
        /* logged by the listener's safe(); nothing to unwind here */
      });
  }

  private async loadQuotation(id: string): Promise<Quotation> {
    const quote = await this.prisma.quotation.findUnique({ where: { id } });
    if (!quote || quote.deletedAt) {
      throw new NotFoundException('Quotation not found.');
    }
    return quote;
  }

  // ─── Calculations ─────────────────────────────────────────────────────────

  /**
   * Pure function — derives the three calculated fields from fees,
   * discount, and TVA rate. Single source of truth so the front-end's
   * live preview and the persisted record always agree.
   *
   * Every fee is TTC (owner decision: prices include TVA), so the total
   * IS the net of the fees and HT / TVA are split backwards from it. No
   * stamp is involved here: a devis is not an invoice. The droit de
   * timbre is ADDED to every payment (each gets its own facture, owner
   * decision 2026-11-20), on top of this total.
   */
  static computeTotals(
    treatmentFees: number,
    fabricationFees: number,
    deliveryFees: number,
    discountAmount: number,
    tvaRate: number,
  ): QuoteTotals {
    const net = QuotationService.netOfFees(
      treatmentFees,
      fabricationFees,
      deliveryFees,
      discountAmount,
    );
    const split = splitInclusive(net, tvaRate, 0);
    return {
      subTotalHt: toAmount(split.ht),
      tvaAmount: toAmount(split.tva),
      totalTtc: toAmount(split.total),
    };
  }

  /**
   * The maths quotes used before prices became TTC: the fees are HT and
   * TVA is added on top. Only an edit of a packless quote still stored
   * that way uses it (see isTtcPriced), so the edit keeps the quote's TVA;
   * every new quote is priced with computeTotals.
   */
  static computeLegacyHtTotals(
    treatmentFees: number,
    fabricationFees: number,
    deliveryFees: number,
    discountAmount: number,
    tvaRate: number,
  ): QuoteTotals {
    const ht = QuotationService.netOfFees(
      treatmentFees,
      fabricationFees,
      deliveryFees,
      discountAmount,
    );
    const rate = Prisma.Decimal.min(
      dec(Math.max(0, Number(tvaRate) || 0)),
      100,
    );
    const tva = round3(ht.mul(rate).div(100));
    return {
      subTotalHt: toAmount(ht),
      tvaAmount: toAmount(tva),
      totalTtc: toAmount(ht.plus(tva)),
    };
  }

  /** Σ fees - discount (capped at the fees), negative inputs read as 0. */
  private static netOfFees(
    treatmentFees: number,
    fabricationFees: number,
    deliveryFees: number,
    discountAmount: number,
  ): Prisma.Decimal {
    const positive = (n: number) => dec(Math.max(0, Number(n) || 0));
    const grossFees = positive(treatmentFees)
      .plus(positive(fabricationFees))
      .plus(positive(deliveryFees));
    const discount = Prisma.Decimal.min(positive(discountAmount), grossFees);
    return round3(grossFees.minus(discount));
  }

  /**
   * Fees, rate and totals after an edit of a quote's money. Pack quotes
   * and quotes priced TTC keep the TTC maths, where a legacy 0 % rate
   * upgrades to the company rate (the price already included TVA). A
   * packless quote stored HT keeps its own rate and the HT maths: its
   * fees never included TVA, and the TTC maths would drop it.
   */
  private static editedMoney(
    stored: Quotation,
    dto: UpdateQuotationDto,
    companyTvaRate: number | null | undefined,
  ) {
    const fees = {
      treatmentFees: dto.treatmentFees ?? stored.treatmentFees,
      fabricationFees: dto.fabricationFees ?? stored.fabricationFees,
      deliveryFees: dto.deliveryFees ?? stored.deliveryFees,
      discountAmount: dto.discountAmount ?? stored.discountAmount,
    };
    const args = [
      fees.treatmentFees,
      fees.fabricationFees,
      fees.deliveryFees,
      fees.discountAmount,
    ] as const;
    if (isTtcPriced(stored)) {
      const tvaRate = resolveTvaRate(
        dto.tvaRate ?? stored.tvaRate,
        companyTvaRate,
      );
      return {
        ...fees,
        tvaRate,
        ...QuotationService.computeTotals(...args, tvaRate),
      };
    }
    const tvaRate = dto.tvaRate ?? stored.tvaRate;
    return {
      ...fees,
      tvaRate,
      ...QuotationService.computeLegacyHtTotals(...args, tvaRate),
    };
  }

  /** The row plus the money flags every quote response carries. */
  present<T extends Quotation>(quote: T): Promise<QuotationView<T>> {
    return presentQuote(this.prisma, quote);
  }

  // ─── Public methods ───────────────────────────────────────────────────────

  /**
   * Read by order id — admin, owning dentist, assigned designer. Carries
   * the money flags (receivedAmount, hasPaymentInFlight, canDelete,
   * canRecall) the quote screens use to offer edit / recall / delete.
   */
  async getForOrder(
    orderId: string,
    caller: Caller,
  ): Promise<QuotationView<Quotation> | null> {
    await this.assertOrderReadable(orderId, caller);
    // Include the attached pack's LOCALIZED display fields (read-only) so
    // the order summary can render the pack name / expiration / finishing
    // in the current UI language for BOTH admin and doctor, without
    // storing translated labels on the quote. Price/identity stay driven
    // by the stable snapshot (packId, archType, totalPrice, currency).
    const quote = await this.prisma.quotation.findFirst({
      where: { orderId, deletedAt: null },
      include: {
        pack: {
          select: {
            id: true,
            name: true,
            nameI18n: true,
            descriptionI18n: true,
            treatmentExpirationLabel: true,
            finishingIncludedLabel: true,
            maxStepsPerArch: true,
            includedCorrections: true,
            treatmentValidityMonths: true,
            isUnlimitedSteps: true,
            isUnlimitedCorrections: true,
          },
        },
      },
    });
    return quote ? this.present(quote) : null;
  }

  /**
   * Read a quotation by its own id with the same RBAC as getForOrder:
   * caller must be able to read the parent order. Used by the
   * `/quotations/:id/...` endpoints that take a quote id directly.
   */
  async getForOrderByQuotationId(
    quotationId: string,
    caller: Caller,
  ): Promise<Quotation> {
    const quote = await this.loadQuotation(quotationId);
    await this.assertOrderReadable(quote.orderId, caller);
    return quote;
  }

  /**
   * Create a quote for an order. Admin-only.
   *
   * Fails if a non-canceled / non-rejected quote already exists — admin
   * must cancel the existing one first. (Multiple quotes per order is
   * out of scope; the unique constraint on orderId enforces it.)
   */
  async create(
    orderId: string,
    dto: CreateQuotationDto,
    caller: Caller,
  ): Promise<QuotationView<Quotation>> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException('Only admins can create a quotation.');
    }
    await this.assertOrderReadable(orderId, caller);
    await this.assertQuotable(orderId);

    const existing = await this.prisma.quotation.findUnique({
      where: { orderId },
    });
    if (existing && !existing.deletedAt) {
      throw new BadRequestException(
        `Order already has a quotation (status: ${existing.status}). Cancel it first to create a new one.`,
      );
    }

    const settings = await this.settingsService.requireActive();
    const language = dto.language ?? DevisLanguage.fr;
    const currency = dto.currency ?? settings.defaultCurrency ?? 'TND';
    // A price always includes TVA: a 0 % rate is read as "not set" and
    // takes the company rate, so a devis never prints "TVA 0 %".
    const tvaRate = resolveTvaRate(dto.tvaRate, settings.defaultTvaRate);

    // Treatment fee precedence (top → bottom):
    //   1. Admin-typed value on this quote (explicit override)
    //   2. CompanyBillingSettings.defaultTreatmentFee (the "policy")
    //   3. 0 (fallback for tenants who haven't configured a default yet)
    // Number() unwraps the Prisma Decimal so computeTotals stays Float-only.
    const defaultTreatmentFee = Number(settings.defaultTreatmentFee ?? 0);
    const treatmentFees = dto.treatmentFees ?? defaultTreatmentFee;
    const discount = resolveQuoteDiscount(dto, {
      treatmentFees,
      fabricationFees: 0,
      deliveryFees: 0,
      discountAmount: 0,
      discountPercent: null,
    });
    const discountAmount = discount.amount ?? dto.discountAmount ?? 0;

    const totals = QuotationService.computeTotals(
      treatmentFees,
      dto.fabricationFees ?? 0,
      dto.deliveryFees ?? 0,
      discountAmount,
      tvaRate,
    );

    const created = await this.prisma.quotation.create({
      data: {
        orderId,
        language,
        status: QuotationStatus.draft,
        treatmentFees,
        fabricationFees: dto.fabricationFees ?? 0,
        deliveryFees: dto.deliveryFees ?? 0,
        discountAmount,
        discountPercent: discount.percent ?? null,
        tvaRate,
        currency,
        notes: dto.notes ?? null,
        adminMessage: dto.adminMessage ?? null,
        subTotalHt: totals.subTotalHt,
        tvaAmount: totals.tvaAmount,
        totalTtc: totals.totalTtc,
        createdById: caller.userId,
        createdByName: await lookupActorName(this.prisma, caller.userId),
      },
    });
    // A quote created this instant has no payment and no plan: no read
    // needed.
    return {
      ...created,
      ...quoteActionFlags(
        created.status,
        emptyQuoteMoney(),
        hasFreeStepForReplan(created, []),
      ),
    };
  }

  /**
   * Update an existing quote (admin). Allowed while the quote is draft,
   * sent or approved (owner decision 5): everything may change except
   * the installments already paid, and the total may not go below what
   * has already been settled.
   *
   * Amounts move only when a money field of the body differs from the
   * stored value (quoteMoneyEdited): a notes, language or message save
   * leaves fees, totals, plan and settlement untouched. A money edit
   * prices pack quotes and TTC quotes TTC; a packless quote stored the
   * legacy HT way keeps the HT + TVA maths (see editedMoney).
   *
   * When the total of a pack quote changes, the UNPAID installments are
   * rebalanced in proportion to their current amounts (count, dates and
   * step ranges kept); paid rows and their batches never move. See
   * planRebalance for the 400 / 409 refusals. paidAmount, remainingAmount
   * and paymentStatus are recomputed from the successful payments.
   *
   * The quotation and installment rows are locked for the whole edit, so
   * a settlement (PaymentsService.handleSuccess) and an edit queue up
   * instead of interleaving. An edit of a quote the doctor already saw is
   * written to the order history, and a stored devis PDF is re-rendered.
   */
  async update(
    id: string,
    dto: UpdateQuotationDto,
    caller: Caller,
  ): Promise<QuotationView<Quotation>> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException('Only admins can edit a quotation.');
    }
    const quote = await this.loadQuotation(id);
    await this.assertOrderReadable(quote.orderId, caller);
    assertQuoteEditable(quote.status);

    const settings = await this.settingsService.getActive();
    const actorName =
      quote.status === QuotationStatus.draft
        ? null
        : await lookupActorName(this.prisma, caller.userId);

    const updated = await this.prisma.$transaction(async (tx) => {
      await lockQuoteForEdit(tx, id);
      const fresh = await tx.quotation.findUnique({
        where: { id },
        include: {
          installments: {
            orderBy: { installmentNumber: 'asc' },
            include: {
              payments: {
                where: { status: { in: IN_FLIGHT_PAYMENT_STATUSES } },
                select: { id: true },
              },
            },
          },
        },
      });
      if (!fresh || fresh.deletedAt) {
        throw new NotFoundException('Quotation not found.');
      }
      assertQuoteEditable(fresh.status);

      // A remise typed as a percentage becomes its amount here, on the
      // gross this edit leaves, so every money rule below works on one
      // figure; the percentage itself is kept for the devis label.
      const discount = resolveQuoteDiscount(dto, fresh);
      const input: UpdateQuotationDto =
        discount.amount === undefined
          ? dto
          : { ...dto, discountAmount: discount.amount };

      const next = {
        language: dto.language ?? fresh.language,
        currency: dto.currency ?? fresh.currency,
        notes: dto.notes ?? fresh.notes,
        adminMessage: dto.adminMessage ?? fresh.adminMessage,
        ...(discount.percent !== undefined
          ? { discountPercent: discount.percent }
          : {}),
      };
      // The editor posts every field on each save: only a money field
      // whose value actually changed re-prices the quote. Otherwise the
      // fees, rate, totals, plan and settlement are left exactly as
      // stored, so a notes save never re-prices an old HT devis.
      const amounts = quoteMoneyEdited(input, fresh)
        ? QuotationService.editedMoney(fresh, input, settings?.defaultTvaRate)
        : null;

      // Pack quotes carry the canonical Decimal totalPrice the plan and
      // the payments are checked against; it follows the new TTC total.
      const newTotal =
        fresh.packId && amounts ? round3(amounts.totalTtc) : null;
      let plan: PlanRebalance = { changes: [], cancelled: [], extra: null };
      let extraInstallmentNumber: number | null = null;
      let settlement: QuoteSettlement | null = null;
      if (newTotal) {
        const money = await readOneQuoteMoney(tx, id);
        if (!fresh.totalPrice || !fresh.totalPrice.equals(newTotal)) {
          plan = planRebalance({
            newTotal,
            received: money.received,
            installments: fresh.installments.map((row) => ({
              id: row.id,
              installmentNumber: row.installmentNumber,
              amount: row.amount,
              status: row.status,
              inFlight: row.payments.length > 0,
            })),
          });
          for (const change of plan.changes) {
            await tx.quoteInstallment.update({
              where: { id: change.id },
              data: { amount: change.to },
            });
          }
          if (plan.cancelled.length > 0) {
            // Nothing more is owed on these rows: they close at 0 and the
            // aligners they gated become deliverable.
            const ids = plan.cancelled.map((change) => change.id);
            await tx.quoteInstallment.updateMany({
              where: { id: { in: ids } },
              data: { amount: 0, status: InstallmentStatus.cancelled },
            });
            // Their locked batches are released through the one writer
            // (production/batch-unlock.ts): a guarded update per batch, then
            // ONE D2 projection on the whole set (steps delivered before
            // they were released flip their batch to delivered now, in this
            // transaction), then a batch_unlocked journal row per batch with
            // source installment_cancelled and the editing admin.
            const locked = await tx.quoteStepBatch.findMany({
              where: { installmentId: { in: ids }, status: BatchStatus.locked },
              select: { id: true },
              orderBy: { batchNumber: 'asc' },
            });
            if (locked.length > 0) {
              await unlockStepBatches(tx, {
                batchIds: locked.map((batch) => batch.id),
                source: BatchUnlockSource.installment_cancelled,
                actor: caller,
              });
            }
          }
          if (plan.extra) {
            // Every row is paid and the total went up: bill the difference
            // as one more installment, payable now, with no step batch (the
            // aligners are already covered by the paid rows).
            extraInstallmentNumber =
              fresh.installments.reduce(
                (max, row) => Math.max(max, row.installmentNumber),
                0,
              ) + 1;
            await tx.quoteInstallment.create({
              data: {
                quotationId: id,
                installmentNumber: extraInstallmentNumber,
                amount: plan.extra,
                availableFrom: new Date(),
              },
            });
          }
        }
        settlement = settleQuote(newTotal, money.received);
      }

      const row = await tx.quotation.update({
        where: { id },
        data: {
          ...next,
          ...(amounts ?? {}),
          ...(newTotal && settlement
            ? {
                totalPrice: newTotal,
                paidAmount: settlement.paidAmount,
                remainingAmount: settlement.remainingAmount,
                paymentStatus: settlement.paymentStatus,
              }
            : {}),
          ...(plan.extra ? { paymentMode: PaymentMode.installments } : {}),
          // The loyalty snapshot documents the discount granted at
          // pack-attach. If the admin manually overrides the discount
          // to a DIFFERENT figure, the snapshot no longer describes
          // this quote (and would inflate the loyalty KPI) — clear it.
          ...(input.discountAmount !== undefined &&
          fresh.loyaltyDiscountAmount != null &&
          !fresh.loyaltyDiscountAmount.equals(
            new Prisma.Decimal(input.discountAmount.toFixed(3)),
          )
            ? {
                loyaltyDiscountPercent: null,
                loyaltyDiscountAmount: null,
                loyaltySourceYear: null,
                loyaltySourceQuarter: null,
              }
            : {}),
        },
      });

      if (
        settlement?.paymentStatus === QuotationPaymentStatus.paid &&
        fresh.paymentStatus !== QuotationPaymentStatus.paid
      ) {
        await advanceOrderWhenPaid(tx, fresh.orderId);
      }

      if (fresh.status !== QuotationStatus.draft) {
        const changes = auditDiff(
          {
            treatmentFees: fresh.treatmentFees,
            fabricationFees: fresh.fabricationFees,
            deliveryFees: fresh.deliveryFees,
            discountAmount: fresh.discountAmount,
            tvaRate: fresh.tvaRate,
            subTotalHt: fresh.subTotalHt,
            tvaAmount: fresh.tvaAmount,
            totalTtc: fresh.totalTtc,
            language: fresh.language,
            currency: fresh.currency,
            notes: fresh.notes,
            adminMessage: fresh.adminMessage,
          },
          { ...next, ...(amounts ?? {}) },
        );
        const planMoved =
          plan.changes.length > 0 || plan.cancelled.length > 0 || !!plan.extra;
        if (Object.keys(changes).length > 0 || planMoved) {
          await tx.orderAuditLog.create({
            data: quoteUpdateAudit({
              orderId: fresh.orderId,
              caller,
              actorName,
              changes,
              metadata: {
                quotationId: fresh.id,
                quotationNumber: fresh.quotationNumber,
                quotationStatus: fresh.status,
                kind: 'fees',
                installments: plan.changes.map((change) => ({
                  installmentNumber: change.installmentNumber,
                  from: change.from.toFixed(3),
                  to: change.to.toFixed(3),
                })),
                cancelledInstallments: plan.cancelled.map(
                  (change) => change.installmentNumber,
                ),
                ...(plan.extra && extraInstallmentNumber
                  ? {
                      addedInstallment: {
                        installmentNumber: extraInstallmentNumber,
                        amount: plan.extra.toFixed(3),
                      },
                    }
                  : {}),
              },
            }),
          });
        }
      }
      return row;
    });

    const rendered = await this.quotationPdf.refreshStoredPdf(updated);
    return this.present(rendered);
  }

  /**
   * Ensure a quote that is about to be rendered has what its PDF needs.
   *   - A draft gets its DEV- number (allocated the first time its PDF is
   *     generated, whichever comes first with send) and nothing else: a
   *     draft PDF renders from snapshots built in memory, so previewing a
   *     draft never freezes the doctor's or the company's data (DECISIONS
   *     §6). send() is what freezes them.
   *   - A quote out of draft keeps its snapshots; a legacy one issued
   *     without them gets them now (and its number), once.
   */
  async ensureSnapshotAndNumber(quote: Quotation): Promise<Quotation> {
    if (quote.status === QuotationStatus.draft) {
      return this.ensureNumber(quote);
    }
    if (
      quote.quotationNumber &&
      quote.companySnapshot &&
      quote.clinicSnapshot
    ) {
      return quote;
    }

    const settings = await this.settingsService.requireActive();
    const snapshots = await readQuoteSnapshots(this.prisma, settings, quote);
    const quotationNumber =
      quote.quotationNumber ??
      (await this.settingsService.allocateQuotationNumber({
        patientFullName: snapshots.patientFullName,
        createdAt: quote.createdAt,
      }));

    return this.prisma.quotation.update({
      where: { id: quote.id },
      data: {
        quotationNumber,
        companySnapshot: quote.companySnapshot ?? snapshots.companySnapshot,
        clinicSnapshot: quote.clinicSnapshot ?? snapshots.clinicSnapshot,
      },
    });
  }

  /** The DEV- number of a quote, allocated once (guarded on null). */
  private async ensureNumber(quote: Quotation): Promise<Quotation> {
    if (quote.quotationNumber) return quote;
    const order = await this.prisma.dentalOrder.findUnique({
      where: { id: quote.orderId },
      select: { patient: { select: { fullName: true } } },
    });
    const allocated = await this.settingsService.allocateQuotationNumber({
      patientFullName: order?.patient?.fullName ?? null,
      createdAt: quote.createdAt,
    });
    // A concurrent render or send numbered it first: keep that number.
    const claimed = await this.prisma.quotation.updateMany({
      where: { id: quote.id, quotationNumber: null },
      data: { quotationNumber: allocated },
    });
    if (claimed.count === 0) {
      return this.prisma.quotation.findUniqueOrThrow({
        where: { id: quote.id },
      });
    }
    return { ...quote, quotationNumber: allocated };
  }

  /**
   * Send the quote to the doctor. Transitions:
   *   quotation.status: draft → sent
   *   order.status: → quotation_sent
   * Freezes quotationNumber and REBUILDS companySnapshot + clinicSnapshot
   * from the current settings and doctor profile (spec §6: every draft ->
   * sent, so a recalled devis sent again is never stale), in the same
   * transaction as the status change, guarded on draft (a double click
   * sends once). Then renders the stored devis PDF so the practitioner
   * always downloads the version that was sent (best effort: a renderer
   * failure is logged and never blocks the send; generate-pdf retries).
   */
  async send(id: string, caller: Caller): Promise<QuotationView<Quotation>> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException('Only admins can send a quotation.');
    }
    let quote = await this.loadQuotation(id);
    await this.assertOrderReadable(quote.orderId, caller);

    if (quote.status !== QuotationStatus.draft) {
      throw new BadRequestException(
        `Quotation cannot be sent from "${quote.status}" status.`,
      );
    }

    // Pack-based quotes MUST have a configured payment plan before
    // they go out. Otherwise the doctor receives the quote, hits
    // Approve, and gets a 400 from tryApprovePackQuote() saying the
    // plan is missing — a dead-end since only an admin can fix it.
    // This guard catches the bad state at the admin layer where it
    // CAN be acted on (admin opens the plan builder, configures it,
    // hits Send again).
    if (quote.packId) {
      const planRowCount = await this.prisma.quoteInstallment.count({
        where: { quotationId: quote.id },
      });
      if (planRowCount === 0) {
        throw new BadRequestException(
          'Configure the payment plan (installments + step ranges) before sending this pack-based quote. The doctor will not be able to approve it otherwise.',
        );
      }
    }

    // The number first (guarded claim, so a concurrent draft render and
    // this send agree on one), then the snapshots as of now.
    quote = await this.ensureNumber(quote);
    const settings = await this.settingsService.requireActive();
    const sentAt = new Date();
    const snapshots = await readQuoteSnapshots(
      this.prisma,
      settings,
      quote,
      sentAt,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const sent = await tx.quotation.updateMany({
        where: { id: quote.id, status: QuotationStatus.draft },
        data: {
          status: QuotationStatus.sent,
          sentAt,
          companySnapshot: snapshots.companySnapshot,
          clinicSnapshot: snapshots.clinicSnapshot,
        },
      });
      if (sent.count === 0) {
        throw new BadRequestException(
          'This quotation was already sent by another request.',
        );
      }
      await tx.dentalOrder.update({
        where: { id: quote.orderId },
        data: { status: OrderStatus.quotation_sent },
      });
      return tx.quotation.findUniqueOrThrow({ where: { id: quote.id } });
    });
    const sent = await this.quotationPdf.refreshStoredPdf(updated, {
      force: true,
    });
    // Doctor e-mail is sent by the notification listener on QuotationSent.
    // Bell ping for the doctor — the email goes too, this is just the
    // in-app version that backs the badge in the header. Joins
    // doctor + patient so the notification body has the full
    // "Quotation Q-… for patient X (ORD-…)" context.
    const order = await this.prisma.dentalOrder.findUnique({
      where: { id: updated.orderId },
      select: {
        doctorId: true,
        orderCode: true,
        doctor: { select: { fullName: true } },
        patient: { select: { fullName: true } },
      },
    });
    if (order) {
      this.events.emit(NotificationEvents.QuotationSent, {
        quotationId: updated.id,
        orderId: updated.orderId,
        orderCode: order.orderCode ?? null,
        doctorId: order.doctorId,
        doctorName: order.doctor?.fullName ?? null,
        patientName: order.patient?.fullName ?? null,
        language: updated.language ?? null,
        quotationNumber: updated.quotationNumber ?? null,
      });
    }
    return this.present(sent);
  }

  /**
   * Doctor (or admin) approves the Quote.
   *
   * Two flavours of approval:
   *   • **Legacy quote** (no pack attached): quotation.status → approved,
   *     order.status → fabrication. Single path that's existed since
   *     day one.
   *   • **Pack-based quote** (`packId` set): delegated to
   *     QuotationPaymentPlanService.tryApprovePackQuote(). That path
   *     requires a configured payment plan and moves the order to
   *     `payment_plan_selected` instead of fabrication.
   *
   * The branch is decided by the quote row itself — callers don't pick
   * a flow, so we can't accidentally send a pack quote down the legacy
   * fabrication path (which would skip payment entirely).
   */
  async approve(id: string, caller: Caller): Promise<QuotationView<Quotation>> {
    const quote = await this.loadQuotation(id);
    const order = await this.assertOrderReadable(quote.orderId, caller);

    const isOwnerDoctor =
      caller.role === UserRole.dentist && order.doctorId === caller.userId;
    if (!isAdmin(caller) && !isOwnerDoctor) {
      throw new ForbiddenException(
        'Only the order doctor or an admin can approve the quotation.',
      );
    }
    if (quote.status !== QuotationStatus.sent) {
      throw new BadRequestException(
        `Only a "sent" quotation can be approved (current: ${quote.status}).`,
      );
    }

    // Pack-based quote → defer to the payment-plan service. Returns
    // `true` when it took ownership, in which case we re-load + notify
    // and return. `false` means it's a legacy quote and we fall through
    // to the existing fabrication path.
    const handledByPack = await this.paymentPlan.tryApprovePackQuote(
      quote,
      caller,
    );
    if (handledByPack) {
      const fresh = await this.loadQuotation(id);
      this.emitQuoteDecision(fresh, 'approved');
      return this.present(fresh);
    }

    const approved = await this.transitionSentToApproved(
      quote,
      caller.userId,
      OrderStatus.fabrication,
    );
    if (!approved) {
      throw new BadRequestException(
        'This quotation was already decided by another request.',
      );
    }
    // Admin e-mail via the notification listener (QuotationApproved).
    this.emitQuoteDecision(approved, 'approved');
    return this.present(approved);
  }

  /**
   * Implicit approval: the doctor's FIRST payment on a `sent` quote IS
   * the approval (the doctor's quote view no longer has an Approve
   * button — clicking Pay is the acceptance). PaymentsService calls this
   * before creating the Payment row so there is exactly ONE owner of the
   * "sent -> approved" mutation instead of a second copy living in the
   * payments module.
   *
   * Idempotent: a quote that is not `sent` (already approved on a prior
   * installment) is left untouched and `false` is returned. The order
   * moves to `payment_pending` — "doctor accepted, money not yet in" —
   * and the payment settlement that follows advances it further
   * (`payment_review` / `fabrication`). Previously this path jumped the
   * order straight to `fabrication`, which stuck if the card gateway
   * then failed.
   *
   * No decision e-mail is emitted here on purpose: the payment
   * notification that follows already tells the admin the doctor acted.
   */
  async approveOnFirstPayment(
    quotationId: string,
    caller: Caller,
  ): Promise<boolean> {
    const quote = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      select: { id: true, orderId: true, status: true },
    });
    if (!quote || quote.status !== QuotationStatus.sent) return false;
    const approved = await this.transitionSentToApproved(
      quote,
      caller.userId,
      OrderStatus.payment_pending,
    );
    return approved !== null;
  }

  /**
   * THE "sent -> approved" mutation. Guarded on `status = sent` inside the
   * transaction so two concurrent approvals (explicit + first payment,
   * or two payments) cannot both "win": the second sees 0 rows and gets
   * `null`. Both the explicit approve endpoint and the implicit
   * first-payment path go through here.
   */
  private async transitionSentToApproved(
    quote: { id: string; orderId: string },
    approvedById: string,
    nextOrderStatus: OrderStatus,
  ): Promise<Quotation | null> {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.quotation.updateMany({
        where: { id: quote.id, status: QuotationStatus.sent },
        data: {
          status: QuotationStatus.approved,
          approvedAt: new Date(),
          approvedById,
          // Paying a SENT quote IS the doctor's acceptance (the doctor
          // view has no Approve button) — stamp the moment the same way
          // the explicit approve endpoint does. The loyalty program
          // counts treatments by this timestamp.
          doctorApprovedAt: new Date(),
        },
      });
      if (changed.count === 0) return null;
      await tx.dentalOrder.update({
        where: { id: quote.orderId },
        data: { status: nextOrderStatus },
      });
      return tx.quotation.findUniqueOrThrow({ where: { id: quote.id } });
    });
  }

  /**
   * Doctor (or admin) rejects the Quote.
   *   quotation.status → rejected
   *   order.status → canceled
   */
  async reject(
    id: string,
    rejectionReason: string | undefined,
    caller: Caller,
  ): Promise<QuotationView<Quotation>> {
    const quote = await this.loadQuotation(id);
    const order = await this.assertOrderReadable(quote.orderId, caller);

    const isOwnerDoctor =
      caller.role === UserRole.dentist && order.doctorId === caller.userId;
    if (!isAdmin(caller) && !isOwnerDoctor) {
      throw new ForbiddenException(
        'Only the order doctor or an admin can reject the quotation.',
      );
    }
    if (quote.status !== QuotationStatus.sent) {
      throw new BadRequestException(
        `Only a "sent" quotation can be rejected (current: ${quote.status}).`,
      );
    }

    const rejected = await this.prisma.$transaction(async (tx) => {
      const u = await tx.quotation.update({
        where: { id: quote.id },
        data: {
          status: QuotationStatus.rejected,
          rejectedAt: new Date(),
          rejectedById: caller.userId,
          rejectionReason: rejectionReason ?? null,
        },
      });
      await tx.dentalOrder.update({
        where: { id: quote.orderId },
        data: { status: OrderStatus.canceled },
      });
      return u;
    });
    // Admin e-mail via the notification listener (QuotationRejected).
    this.emitQuoteDecision(rejected, 'rejected', rejectionReason);
    return this.present(rejected);
  }

  /**
   * Pull a sent or approved quote back to draft so admin can correct it
   * (wrong pack, wrong fees, typo in the admin message, wrong language
   * at send time — anything). The doctor is notified so they don't act
   * on the stale copy.
   *
   * Lifecycle effect:
   *   • quote.status: sent / approved → draft (sentAt, approvedAt and
   *     doctorApprovedAt cleared: the loyalty program counts treatments by
   *     doctorApprovedAt, a recalled quote must not count)
   *   • order.status: back to treatment_approved (the canonical state
   *     right before the quote was issued) when it is still in the quote
   *     / payment phase
   *   • installments and step batches are kept: a draft is not payable,
   *     and the admin edits or re-plans them before sending again.
   *
   * Refused while money was received or an attempt may still settle
   * (409): an approved quote with money on it is edited in place, never
   * pulled back. Draft, rejected and canceled quotes are refused (400).
   *
   * Authorisation: admin only. The doctor side has the explicit
   * reject path with a reason — this is for the team's own
   * "we made a mistake, hold on" correction loop.
   */
  async revertToDraft(
    id: string,
    caller: Caller,
  ): Promise<QuotationView<Quotation>> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException(
        'Only admins can recall a sent quotation for correction.',
      );
    }
    const quote = await this.loadQuotation(id);
    await this.assertOrderReadable(quote.orderId, caller);
    this.assertRecallable(quote.status);

    const order = await this.prisma.dentalOrder.findUnique({
      where: { id: quote.orderId },
      select: {
        doctorId: true,
        orderCode: true,
        doctor: { select: { fullName: true } },
        patient: { select: { fullName: true } },
      },
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      // Locked so a payment attempt on one of its installments cannot
      // start between the check below and the commit.
      await lockQuoteForEdit(tx, id);
      const fresh = await tx.quotation.findUnique({ where: { id } });
      if (!fresh || fresh.deletedAt) {
        throw new NotFoundException('Quotation not found.');
      }
      this.assertRecallable(fresh.status);
      assertNoMoneyMoved(
        await readOneQuoteMoney(tx, id),
        'recall this quotation',
      );

      const u = await tx.quotation.update({
        where: { id },
        data: {
          status: QuotationStatus.draft,
          sentAt: null,
          approvedAt: null,
          approvedById: null,
          doctorApprovedAt: null,
          paymentStatus: QuotationPaymentStatus.pending,
        },
      });
      await resetOrderBeforeQuote(tx, fresh.orderId);
      return u;
    });

    if (order) {
      this.events.emit(NotificationEvents.QuotationRecalled, {
        quotationId: updated.id,
        orderId: updated.orderId,
        orderCode: order.orderCode ?? null,
        doctorId: order.doctorId,
        doctorName: order.doctor?.fullName ?? null,
        patientName: order.patient?.fullName ?? null,
        language: updated.language ?? null,
        quotationNumber: updated.quotationNumber ?? null,
      });
    }

    return this.present(updated);
  }

  private assertRecallable(status: QuotationStatus): void {
    if (
      status !== QuotationStatus.sent &&
      status !== QuotationStatus.approved
    ) {
      throw new BadRequestException(
        `Only "sent" or "approved" quotations can be recalled to draft (current: ${status}).`,
      );
    }
  }

  /**
   * Re-render the quote PDF in any supported language without rolling
   * back the lifecycle. Admin OR the owning dentist can call this —
   * picking the document language is presentation, not a business
   * edit, so it's safe even on already-sent / approved / rejected
   * quotes (the company snapshot stores the translation maps so we
   * can re-resolve labels without losing the historical context).
   *
   * Behaviour:
   *   • `lang` provided + different from current → updates
   *     `quote.language` (a fresh PDF in that language will be
   *     rendered by the caller).
   *   • `lang` omitted → idempotent. Just ensures the quote has a
   *     number + snapshot so the caller's render call has everything
   *     it needs.
   *
   * Authorisation: admins always pass; dentists must be the order's
   * doctor; designers can't trigger a re-render (read-only on
   * quotes). RBAC is reused from `assertOrderReadable` to stay
   * consistent with the rest of the service.
   */
  async regeneratePdfInLanguage(
    id: string,
    lang: DevisLanguage | undefined,
    caller: Caller,
  ): Promise<Quotation> {
    let quote = await this.loadQuotation(id);
    const order = await this.assertOrderReadable(quote.orderId, caller);

    // Designers can read the quote but they don't pick the document
    // language — that's a doctor / admin call. Block them here so the
    // file on disk doesn't change under their fingertips.
    const isOwningDoctor =
      caller.role === UserRole.dentist && order.doctorId === caller.userId;
    if (!isAdmin(caller) && !isOwningDoctor) {
      throw new ForbiddenException(
        'Only the order doctor or an admin can change the document language.',
      );
    }

    // Make sure the row has a number + snapshots before we ever try to
    // render. This is also where legacy quotes pre-dating the
    // translation-maps field get their snapshot enriched.
    quote = await this.ensureSnapshotAndNumber(quote);

    // No language switch requested → just hand the quote back. The
    // caller renders with whatever language is already on the row.
    if (!lang || lang === quote.language) {
      return quote;
    }

    // Update language only. We intentionally do NOT touch the
    // companySnapshot — its translation maps already let the renderer
    // pick the right legalText/footerText for the new language. This
    // keeps the historical snapshot honest (the original send-time
    // company state stays preserved).
    return this.prisma.quotation.update({
      where: { id: quote.id },
      data: { language: lang },
    });
  }

  /**
   * Delete a quotation (admin), at any status, as long as no money was
   * received and no attempt may still settle (owner decision 5). Used to
   * "re-issue" — admin iterated, decided the fees or the pack were wrong,
   * wants to start over.
   *
   * DELETION POLICY: this is the ONE hard delete of a business document.
   * The table has `orderId @unique` and create() refuses a second quote,
   * so the row must physically go to free the slot. It is only allowed
   * while nothing financial hangs off the quote:
   *   • a successful payment → 409 QUOTE_PAYMENT_RECEIVED
   *   • a pending / unknown / awaiting-confirmation attempt → 409
   *     QUOTE_PAYMENT_IN_FLIGHT
   *   • failed, rejected, cancelled or expired attempts moved no money:
   *     they are detached from the quote (quotationId → null; they keep
   *     their order link, and their installment link is nulled by the
   *     cascade) in the same transaction, so Payment.quotation
   *     (onDelete: Restrict) no longer blocks the delete.
   *
   * The order goes back to treatment_approved when it was still in the
   * quote / payment phase, and the stored devis PDF is removed.
   */
  async cancel(
    id: string,
    caller: Caller,
  ): Promise<{ id: string; canceled: true }> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException('Only admins can cancel a quotation.');
    }
    const quote = await this.loadQuotation(id);
    await this.assertOrderReadable(quote.orderId, caller);

    // Pull the doctorId before we delete the quote — once the row is
    // gone we can't re-derive the recipient. Only notify when the
    // doctor had actually seen the quote (admin deleting a draft is
    // invisible to the doctor). We also pull doctor + patient names +
    // orderCode here so the bell body can read as "Quotation Q-… for
    // patient X (ORD-…) was canceled."
    const wasShown =
      quote.status === QuotationStatus.sent ||
      quote.status === QuotationStatus.approved;
    const order = wasShown
      ? await this.prisma.dentalOrder.findUnique({
          where: { id: quote.orderId },
          select: {
            doctorId: true,
            orderCode: true,
            doctor: { select: { fullName: true } },
            patient: { select: { fullName: true } },
          },
        })
      : null;

    const deleted = await this.prisma.$transaction(async (tx) => {
      await lockQuoteForEdit(tx, id);
      const fresh = await tx.quotation.findUnique({ where: { id } });
      if (!fresh || fresh.deletedAt) {
        throw new NotFoundException('Quotation not found.');
      }
      assertNoMoneyMoved(
        await readOneQuoteMoney(tx, id),
        'delete this quotation',
      );
      await tx.payment.updateMany({
        where: { quotationId: id, status: { in: DEAD_PAYMENT_STATUSES } },
        data: { quotationId: null },
      });
      await tx.quotation.delete({ where: { id } });
      await resetOrderBeforeQuote(tx, fresh.orderId);
      return fresh;
    });
    // The row is gone: its rendered devis PDF has no owner any more.
    // After the commit, best-effort — never fails the cancel.
    void this.quotationPdf.deleteStoredPdf(deleted.pdfFilePath);

    if (wasShown && order) {
      this.events.emit(NotificationEvents.QuotationCanceled, {
        quotationId: quote.id,
        orderId: quote.orderId,
        orderCode: order.orderCode ?? null,
        doctorId: order.doctorId,
        doctorName: order.doctor?.fullName ?? null,
        patientName: order.patient?.fullName ?? null,
        language: quote.language ?? null,
        quotationNumber: quote.quotationNumber ?? null,
      });
    }

    return { id: quote.id, canceled: true };
  }

  /**
   * Admin browses all quotations with filters.
   */
  async listAdmin(filter: QuotationFilterDto, caller: Caller) {
    if (!isAdmin(caller)) {
      throw new ForbiddenException('Only admins can list all quotations.');
    }
    const page = filter.page ?? 1;
    const take = filter.limit ?? 20;
    const skip = (page - 1) * take;

    const where: Prisma.QuotationWhereInput = {
      deletedAt: null,
      order: { deletedAt: null },
    };
    if (filter.status) where.status = filter.status;
    if (filter.language) where.language = filter.language;
    if (filter.doctorId) {
      where.order = { ...(where.order as object), doctorId: filter.doctorId };
    }
    if (filter.orderCode) {
      where.order = {
        ...(where.order as object),
        orderCode: { contains: filter.orderCode, mode: 'insensitive' },
      };
    }
    if (filter.createdFrom || filter.createdTo) {
      where.createdAt = {};
      if (filter.createdFrom)
        where.createdAt.gte = new Date(filter.createdFrom);
      if (filter.createdTo) where.createdAt.lte = new Date(filter.createdTo);
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.quotation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          order: {
            select: {
              id: true,
              orderCode: true,
              doctorId: true,
              doctor: { select: { fullName: true, email: true } },
            },
          },
        },
      }),
      this.prisma.quotation.count({ where }),
    ]);

    return {
      data: await presentQuotes(this.prisma, rows),
      total,
      page,
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  }
}
