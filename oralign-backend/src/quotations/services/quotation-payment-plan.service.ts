import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  ArchType,
  BatchStatus,
  BatchUnlockSource,
  InstallmentStatus,
  OrderStatus,
  PaymentMode,
  Prisma,
  Quotation,
  QuotationPaymentStatus,
  QuotationStatus,
  type QuoteStepBatch,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderAccessPolicy } from '../../common/access/order-access.policy';
import { PackService } from '../../packs/services/pack.service';
import { LoyaltyService } from '../../loyalty/services/loyalty.service';
import {
  AttachPackToQuotationDto,
  ConfigurePaymentPlanDto,
} from '../dto/quotation.dto';
import { isAdmin, type Caller } from '../../common/access/caller';
import {
  NotificationEvents,
  type BatchEvent,
  type BatchUnlockedEvent,
} from '../../notifications/events/notification-events';
import { ProductionEventsService } from '../../production/production-events.service';
import { lockProductionOrder } from '../../production/production-batch-projection';
import {
  unlockStepBatch,
  type UnlockedStepBatch,
} from '../../production/batch-unlock';
import {
  BATCH_UNLOCK_ERROR,
  validReason,
} from '../../common/exceptions/domain-error-codes';
import { lookupActorName } from '../../common/access/actor-snapshot';
import {
  coverageWindowPatch,
  firstHandOverAt,
  startCoverageWindow,
} from '../../orders/coverage-window';
import { INITIAL_ORDERS_ONLY } from '../../orders/order-kind';
import {
  resolveTvaRate,
  splitInclusive,
  toAmount,
} from '../../common/billing/tax-split';
import {
  advanceOrderWhenPaid,
  assertNoMoneyMoved,
  assertQuoteEditable,
  hasFreeStepForReplan,
  IN_FLIGHT_PAYMENT_STATUSES,
  isKeptInstallment,
  lockQuoteForEdit,
  MONEY_EPSILON,
  presentQuote,
  QUOTE_ERROR,
  quoteUpdateAudit,
  type QuotationView,
  readOneQuoteMoney,
  settleQuote,
  withLatestTransfers,
} from '../quote-money';
import { CompanyBillingSettingsService } from './company-billing-settings.service';
import { QuotationPdfService } from './quotation-pdf.service';

/**
 * The initial cases the boot coverage pass can change: handed over, with
 * a window not started yet, or started without an expiry while the live
 * quotation now knows the pack validity. A case whose validity is still
 * unknown (older quotes, packs without one) is left out: the pass would
 * open a transaction for it on every boot and write nothing.
 */
export const COVERAGE_BACKFILL_CANDIDATES = {
  ...INITIAL_ORDERS_ONLY,
  deletedAt: null,
  AND: [
    {
      OR: [
        { coverageStartedAt: null },
        {
          coverageExpiresAt: null,
          quotation: { deletedAt: null, treatmentValidityMonths: { gt: 0 } },
        },
      ],
    },
    {
      OR: [
        { alignerDeliveries: { some: {} } },
        {
          quotation: {
            deletedAt: null,
            stepBatches: { some: { status: BatchStatus.delivered } },
          },
        },
      ],
    },
  ],
} satisfies Prisma.DentalOrderWhereInput;

/**
 * What "Marquer livré" on an unlimited-step pack reads under the order
 * lock, in one call: the coverage columns, the batches for the finish and
 * the names of the BatchDelivered notice. No money column.
 */
const PLACEHOLDER_DELIVERY_ORDER_SELECT = {
  status: true,
  deletedAt: true,
  orderType: true,
  coverageStartedAt: true,
  coverageExpiresAt: true,
  orderCode: true,
  doctorId: true,
  doctor: { select: { fullName: true } },
  patient: { select: { fullName: true } },
  quotation: {
    select: {
      treatmentValidityMonths: true,
      stepBatches: { select: { id: true, status: true } },
    },
  },
} satisfies Prisma.DentalOrderSelect;

/**
 * Refusals of this service that are not QUOTE_ERROR codes (quote-money.ts).
 * The HTTP status is in each comment.
 */
export const PAYMENT_PLAN_ERROR = {
  /**
   * 409. A pack change or a re-plan would delete an OPEN installment whose
   * step batch an admin released by hand (manual unlock, spec §3): the lab
   * may already work on those steps. Settle that installment first (it is
   * then kept like every paid row).
   */
  RELEASED_BATCH_IN_PLAN: 'QUOTE_PLAN_BATCH_RELEASED',
  /**
   * 409. Manual unlock of a locked batch while the quote is neither sent
   * nor accepted (draft, recalled, rejected, cancelled): the same states
   * in which no installment can be paid (PaymentsService.assertPayable).
   */
  QUOTE_NOT_UNLOCKABLE: 'BATCH_UNLOCK_QUOTE_NOT_LIVE',
} as const;

/** The quote states in which a batch may be released by hand: the payable ones. */
const UNLOCKABLE_QUOTE_STATUSES: readonly QuotationStatus[] = [
  QuotationStatus.sent,
  QuotationStatus.approved,
];

/**
 * What the manual unlock reads before its locks: the path's quotation and
 * the installment whose row lock comes first. No money column.
 */
const UNLOCK_BATCH_TARGET_SELECT = {
  id: true,
  quotationId: true,
  installmentId: true,
  quotation: {
    select: {
      orderId: true,
      deletedAt: true,
      order: { select: { deletedAt: true } },
    },
  },
} satisfies Prisma.QuoteStepBatchSelect;

/** The batch as the manual unlock re-reads it under its locks. */
const UNLOCK_BATCH_LIVE_SELECT = {
  quotationId: true,
  status: true,
  quotation: { select: { status: true, deletedAt: true } },
} satisfies Prisma.QuoteStepBatchSelect;

/** The names of the BatchUnlocked event (admins' "lot débloqué" ping). */
const UNLOCK_EVENT_ORDER_SELECT = {
  orderCode: true,
  doctorId: true,
  doctor: { select: { fullName: true } },
  patient: { select: { fullName: true } },
} satisfies Prisma.DentalOrderSelect;

/**
 * Service dedicated to the pack-aware quotation lifecycle:
 *   • attachPack    — admin picks a pack + arch, snapshot is taken,
 *                     totalPrice is set from the active PackPrice.
 *   • configurePaymentPlan — admin defines installments + batches.
 *                            Wraps validation + transactional write;
 *                            paid installments are always kept.
 *
 * Kept SEPARATE from the legacy QuotationService so the existing
 * Float-based flow (treatmentFees → totalTtc) keeps working
 * untouched. Both services coexist on the same Quotation row; a
 * "legacy" quote has `packId = null` and continues to operate
 * through QuotationService alone. What "received" and "in flight" mean
 * for both lives in ../quote-money.ts.
 */
@Injectable()
export class QuotationPaymentPlanService implements OnApplicationBootstrap {
  private readonly logger = new Logger(QuotationPaymentPlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderAccess: OrderAccessPolicy,
    private readonly packs: PackService,
    private readonly loyalty: LoyaltyService,
    // ProductionModule (no cycle: it imports Prisma only): the "Marquer
    // livré" button delivers through the lab production path (D2).
    private readonly production: ProductionEventsService,
    // BatchDelivered, for "Marquer livré" on an unlimited-step pack only.
    private readonly events: EventEmitter2,
    // Same module, no cycle: the company TVA rate for pack quotes, and the
    // stored devis PDF re-rendered after a pack or plan change.
    private readonly settings: CompanyBillingSettingsService,
    private readonly quotationPdf: QuotationPdfService,
  ) {}

  /** One-shot reconciliation at boot: statuses first, then coverage. */
  async onApplicationBootstrap(): Promise<void> {
    await this.reconcileFinishedOrders();
    await this.reconcileCoverageWindows();
  }

  /**
   * The auto-finish hook inside `deliverBatch` only fires when an
   * admin actually clicks "Mark as delivered". Any order whose
   * batches were ALL marked delivered BEFORE the auto-finish code
   * shipped is stuck in its previous status (typically
   * `fabrication`) even though every aligner has reached the
   * patient. This pass heals those rows once per backend boot:
   * find every non-finished order whose linked quotation has at
   * least one batch and all batches are at status `delivered`,
   * then flip the order to `finished`. Idempotent — re-running
   * touches nothing because the WHERE clause excludes already-
   * finished rows.
   *
   * Skipped if the table is empty (very common in fresh dev
   * databases) — the count short-circuit avoids logging noise.
   */
  private async reconcileFinishedOrders(): Promise<void> {
    try {
      const candidates = await this.prisma.dentalOrder.findMany({
        where: {
          status: { not: OrderStatus.finished },
          deletedAt: null,
          quotation: {
            deletedAt: null,
            stepBatches: { some: {} },
          },
        },
        select: { id: true },
      });
      if (candidates.length === 0) return;

      let fixed = 0;
      for (const order of candidates) {
        const totals = await this.prisma.quoteStepBatch.groupBy({
          by: ['status'],
          where: {
            quotation: { orderId: order.id, deletedAt: null },
          },
          _count: { status: true },
        });
        const total = totals.reduce((s, r) => s + r._count.status, 0);
        const delivered = totals
          .filter((r) => r.status === BatchStatus.delivered)
          .reduce((s, r) => s + r._count.status, 0);
        if (total > 0 && delivered === total) {
          await this.prisma.dentalOrder.update({
            where: { id: order.id },
            data: { status: OrderStatus.finished },
          });
          fixed++;
        }
      }
      if (fixed > 0) {
        this.logger.log(
          `Reconciled ${fixed} order(s) to FINISHED on boot — all batches were already delivered.`,
        );
      }
    } catch (err) {
      // Swallow boot-time errors so the rest of the app still starts.
      // The next batch delivery (or the next boot) will retry the
      // reconciliation for the same rows.
      this.logger.error(
        `Boot-time order reconciliation failed: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Backfill of the coverage window of cases whose aligners were handed
   * over without starting it (delivered before the window was tracked, or
   * before their pack validity was known). The window starts at the FIRST
   * recorded hand-over, never at boot time; startCoverageWindow keeps the
   * pass idempotent, and only the cases it can change are visited
   * (COVERAGE_BACKFILL_CANDIDATES). Errors are logged, never fatal, like
   * the pass above.
   */
  private async reconcileCoverageWindows(): Promise<void> {
    try {
      const candidates = await this.prisma.dentalOrder.findMany({
        where: COVERAGE_BACKFILL_CANDIDATES,
        select: { id: true },
      });

      let started = 0;
      for (const { id } of candidates) {
        const changed = await this.prisma.$transaction(async (tx) => {
          const handedOverAt = await firstHandOverAt(tx, id);
          return handedOverAt
            ? startCoverageWindow(tx, id, handedOverAt)
            : false;
        });
        if (changed) started++;
      }
      if (started > 0) {
        this.logger.log(
          `Reconciled the coverage window of ${started} case(s) on boot, from their first delivery.`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Boot-time coverage reconciliation failed: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Snapshot a pack + active price onto a quote. Allowed at any status
   * as long as no money was received and no attempt may still settle
   * (409 otherwise): the plan built on the old price is wiped, and only
   * dead attempts can lose their installment link (Payment.installment
   * is onDelete: SetNull, so they survive).
   *
   * Pack prices are TTC: totalPrice = totalTtc = the net (gross pack
   * price minus the loyalty discount), the amount the plan must cover.
   * HT and TVA are split backwards from it at the company TVA rate, so
   * the devis shows HT + TVA = TTC and never "TVA 0 %".
   */
  async attachPack(
    quotationId: string,
    dto: AttachPackToQuotationDto,
    caller: Caller,
  ): Promise<QuotationView<Quotation>> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException('Only admins can attach a pack to a quote.');
    }
    const quote = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { order: { select: { doctorId: true } } },
    });
    if (!quote || quote.deletedAt) {
      throw new NotFoundException('Quotation not found');
    }

    // archType defaults to two_arches — the admin UI consolidated to
    // a single price per pack, so callers no longer need to specify
    // which arch. Legacy callers that DID pass an arch are honoured.
    const archType = dto.archType ?? ArchType.two_arches;
    const { pack, price } = await this.packs.getActivePriceForQuote(
      dto.packId,
      archType,
    );

    // Loyalty discount (grille 2026): the tier the doctor EARNED last
    // quarter applies to every pack quote of the current one. Derived
    // fresh from the gross pack price on every attach, so re-attaching
    // a pack can never stack discounts; the percent AND amount are
    // snapshotted on the quote so later tier edits never rewrite it.
    // The rest of the pipeline needs no change: installments validate
    // against the NET totalPrice, Payment.amount copies installments,
    // and auto-invoices derive from the paid amount.
    const loyaltyReward = await this.loyalty.activeRewardFor(
      quote.order.doctorId,
    );
    const grossDecimal = new Prisma.Decimal(price.price);
    const loyaltyPercentDecimal = new Prisma.Decimal(
      loyaltyReward.discountPercent.toFixed(2),
    );
    const loyaltyAmountDecimal = loyaltyPercentDecimal.gt(0)
      ? grossDecimal.mul(loyaltyPercentDecimal).div(100).toDecimalPlaces(3)
      : new Prisma.Decimal(0);
    const netDecimal = grossDecimal
      .minus(loyaltyAmountDecimal)
      .toDecimalPlaces(3);
    const loyaltyApplied = loyaltyAmountDecimal.gt(0);
    const grossPrice = grossDecimal.toNumber();
    const loyaltyAmount = loyaltyAmountDecimal.toNumber();
    const netPrice = netDecimal.toNumber();

    const settings = await this.settings.getActive();
    const tvaRate = resolveTvaRate(null, settings?.defaultTvaRate);
    const split = splitInclusive(netDecimal, tvaRate, 0);
    const actorName =
      quote.status === QuotationStatus.draft
        ? null
        : await lookupActorName(this.prisma, caller.userId);

    // Reset any previously-configured plan because the totals just
    // changed. Doing this inside the same transaction guarantees the
    // new snapshot + new totalPrice land atomically with the wiped
    // installments + batches, and the money check below cannot race a
    // payment attempt (the rows are locked).
    const updated = await this.prisma.$transaction(async (tx) => {
      await lockQuoteForEdit(tx, quotationId);
      const fresh = await tx.quotation.findUnique({
        where: { id: quotationId },
      });
      if (!fresh || fresh.deletedAt) {
        throw new NotFoundException('Quotation not found');
      }
      assertNoMoneyMoved(
        await readOneQuoteMoney(tx, quotationId),
        'change the pack',
      );
      // No money moved, yet a batch may be released: by hand (spec §3).
      // Its steps may already be in the lab: never wipe it.
      const released = await tx.quoteStepBatch.findMany({
        where: { quotationId, status: { not: BatchStatus.locked } },
        select: { id: true },
        take: 1,
      });
      if (released.length > 0) {
        throw new ConflictException(
          'Une tranche de ce devis a été débloquée manuellement : le forfait ne peut plus être changé.',
          PAYMENT_PLAN_ERROR.RELEASED_BATCH_IN_PLAN,
        );
      }

      await tx.quoteStepBatch.deleteMany({ where: { quotationId } });
      await tx.quoteInstallment.deleteMany({ where: { quotationId } });
      const row = await tx.quotation.update({
        where: { id: quotationId },
        data: {
          packId: pack.id,
          packName: pack.name,
          archType,
          maxStepsPerArch: pack.maxStepsPerArch,
          includedCorrections: pack.includedCorrections,
          treatmentValidityMonths: pack.treatmentValidityMonths,
          isUnlimitedSteps: pack.isUnlimitedSteps,
          isUnlimitedCorrections: pack.isUnlimitedCorrections,
          isForOrthodontists: pack.isForOrthodontists,
          totalPrice: netDecimal,
          // Nothing was received (checked above under lock): the money
          // state of the new price starts from zero.
          paidAmount: new Prisma.Decimal(0),
          remainingAmount: netDecimal,
          paymentMode: null,
          paymentStatus: QuotationPaymentStatus.pending,
          currency: price.currency,
          loyaltyDiscountPercent: loyaltyApplied ? loyaltyPercentDecimal : null,
          loyaltyDiscountAmount: loyaltyApplied ? loyaltyAmountDecimal : null,
          loyaltySourceYear: loyaltyApplied ? loyaltyReward.sourceYear : null,
          loyaltySourceQuarter: loyaltyApplied
            ? loyaltyReward.sourceQuarter
            : null,
          // Mirror the new price onto the legacy Float columns too so the
          // PDF renderer + existing UI stay in sync. The legacy treatment/
          // fab/delivery breakdown is set to zero — for pack-based quotes
          // the price IS the bundle. The loyalty discount rides the
          // existing discountAmount column, which the PDF already renders
          // as a negative line. All of them are TTC.
          treatmentFees: grossPrice,
          fabricationFees: 0,
          deliveryFees: 0,
          discountAmount: loyaltyAmount,
          // A new pack starts from the loyalty remise alone: a percentage
          // the admin typed on the previous price no longer applies.
          discountPercent: null,
          subTotalHt: toAmount(split.ht),
          tvaAmount: toAmount(split.tva),
          tvaRate,
          totalTtc: netPrice,
        },
      });

      if (fresh.status !== QuotationStatus.draft) {
        await tx.orderAuditLog.create({
          data: quoteUpdateAudit({
            orderId: fresh.orderId,
            caller,
            actorName,
            changes: {
              ...(fresh.packName !== pack.name
                ? { packName: { from: fresh.packName, to: pack.name } }
                : {}),
              ...(fresh.totalTtc !== netPrice
                ? { totalTtc: { from: fresh.totalTtc, to: netPrice } }
                : {}),
            },
            metadata: {
              quotationId: fresh.id,
              quotationNumber: fresh.quotationNumber,
              quotationStatus: fresh.status,
              kind: 'pack',
              planCleared: true,
            },
          }),
        });
      }
      return row;
    });

    this.logger.log(
      `Attached pack ${pack.name} (${archType}) to quote ${quotationId} by ${caller.userId}`,
    );
    const rendered = await this.quotationPdf.refreshStoredPdf(updated);
    return presentQuote(this.prisma, rendered);
  }

  /**
   * Define the installment + batch plan. Validation is intentionally
   * heavy — every cross-field check that the spec calls out lives
   * here so the DB is never asked to enforce a business rule.
   *
   * Allowed while the quote is draft, sent or approved. Paid and
   * cancelled installments and their step batches are KEPT
   * (KEPT_INSTALLMENT_STATUSES): the body lists only the new unpaid rows,
   * which replace every open row and must
   *   • sum to totalPrice - Σ kept installments,
   *   • not overlap the step ranges of the kept batches (refused up front
   *     when they already hold every pack step, the rule behind the
   *     quote's freeStepsForReplan flag),
   * and are numbered after the highest kept installment / batch. With
   * no kept installment this is the full re-plan it has always been.
   *
   * Refused with 409 QUOTE_PAYMENT_IN_FLIGHT while an unpaid installment
   * has an attempt that may still settle: that attempt copied the row's
   * amount, and its settlement needs the row to exist.
   */
  async configurePaymentPlan(
    quotationId: string,
    dto: ConfigurePaymentPlanDto,
    caller: Caller,
  ): Promise<QuotationView<Quotation>> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException(
        'Only admins can configure the payment plan.',
      );
    }
    const quote = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
    });
    if (!quote || quote.deletedAt) {
      throw new NotFoundException('Quotation not found');
    }
    if (!quote.packId || !quote.totalPrice) {
      throw new BadRequestException(
        'Attach a pack first — payment plan requires a snapshotted total price.',
      );
    }
    assertQuoteEditable(quote.status);

    // ── Validation pass (the body alone) ────────────────────────
    // Range checks per installment.
    const maxStep = quote.isUnlimitedSteps
      ? Number.POSITIVE_INFINITY
      : (quote.maxStepsPerArch ?? 0);
    if (!quote.isUnlimitedSteps && maxStep === 0) {
      throw new BadRequestException(
        'Pack snapshot is missing maxStepsPerArch.',
      );
    }

    const rows = dto.installments.map((row, idx) => ({
      idx,
      amount: new Prisma.Decimal(row.amount.toFixed(3)),
      availableFrom: row.availableFrom
        ? new Date(row.availableFrom)
        : new Date(),
      dueDate: row.dueDate ? new Date(row.dueDate) : null,
      fromStep: row.batch.fromStep,
      toStep: row.batch.toStep,
    }));

    for (const row of rows) {
      if (row.fromStep > row.toStep) {
        throw new BadRequestException(
          `Installment #${row.idx + 1}: fromStep must be ≤ toStep.`,
        );
      }
      if (!quote.isUnlimitedSteps && row.toStep > maxStep) {
        throw new BadRequestException(
          `Installment #${row.idx + 1}: step range exceeds pack max (${maxStep}).`,
        );
      }
      if (row.dueDate && row.dueDate < row.availableFrom) {
        throw new BadRequestException(
          `Installment #${row.idx + 1}: dueDate cannot precede availableFrom.`,
        );
      }
    }

    // Overlap check — sort by fromStep then ensure each row starts
    // strictly after the previous row's toStep.
    const sorted = [...rows].sort((a, b) => a.fromStep - b.fromStep);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].fromStep <= sorted[i - 1].toStep) {
        throw new BadRequestException(
          `Step ranges overlap between installments #${sorted[i - 1].idx + 1} and #${
            sorted[i].idx + 1
          }.`,
        );
      }
    }

    const actorName =
      quote.status === QuotationStatus.draft
        ? null
        : await lookupActorName(this.prisma, caller.userId);

    // ── Checks against the stored plan + write, under lock ──────
    const result = await this.prisma.$transaction(async (tx) => {
      await lockQuoteForEdit(tx, quotationId);
      const fresh = await tx.quotation.findUnique({
        where: { id: quotationId },
        include: {
          installments: {
            orderBy: { installmentNumber: 'asc' },
            include: {
              stepBatch: true,
              payments: {
                where: { status: { in: IN_FLIGHT_PAYMENT_STATUSES } },
                select: { id: true },
              },
            },
          },
        },
      });
      if (!fresh || fresh.deletedAt) {
        throw new NotFoundException('Quotation not found');
      }
      if (!fresh.totalPrice) {
        throw new BadRequestException(
          'Attach a pack first — payment plan requires a snapshotted total price.',
        );
      }
      assertQuoteEditable(fresh.status);

      // Paid rows are frozen, and so are cancelled ones: a total edit
      // cancels an installment once nothing more is owed for it and
      // releases its aligners, so its batch may already be unlocked or
      // delivered and must never be deleted by a re-plan.
      const kept = fresh.installments.filter(isKeptInstallment);
      const replaced = fresh.installments.filter(
        (row) => !isKeptInstallment(row),
      );
      if (replaced.some((row) => row.payments.length > 0)) {
        throw new ConflictException(
          'A payment is in progress on an unpaid installment. Wait until it is settled or has failed before changing the plan.',
          QUOTE_ERROR.PAYMENT_IN_FLIGHT,
        );
      }
      // An open row whose batch an admin released by hand (spec §3): the
      // lab may already work on its steps, so it is never deleted.
      const releasedByHand = replaced.find(
        (row) => row.stepBatch && row.stepBatch.status !== BatchStatus.locked,
      );
      if (releasedByHand) {
        throw new ConflictException(
          `La tranche de l'échéance n°${releasedByHand.installmentNumber} a été débloquée manuellement : réglez cette échéance avant de modifier le plan.`,
          PAYMENT_PLAN_ERROR.RELEASED_BATCH_IN_PLAN,
        );
      }
      // The new rows must sum to what the kept rows leave to pay (a
      // cancelled row is at 0). Decimal arithmetic so we don't hit Number
      // precision artefacts.
      const keptSum = kept.reduce(
        (acc, row) => acc.plus(row.amount),
        new Prisma.Decimal(0),
      );
      const target = fresh.totalPrice.minus(keptSum);
      if (kept.length > 0 && target.lte(MONEY_EPSILON)) {
        throw new BadRequestException(
          'The kept (paid or cancelled) installments already cover the total of this quotation: there is nothing left to plan.',
        );
      }

      // Same rule as the freeStepsForReplan flag the quote carries: once
      // the kept batches hold every step of the pack, no new row can fit.
      const keptRanges = kept.flatMap((row) =>
        row.stepBatch ? [row.stepBatch] : [],
      );
      if (!hasFreeStepForReplan(fresh, keptRanges)) {
        throw new BadRequestException(
          `No step is left for a new installment: the kept (paid or cancelled) installments already cover steps 1–${fresh.maxStepsPerArch ?? 0}.`,
        );
      }
      this.assertPlanShape(dto.paymentMode, rows.length, kept.length);

      for (const row of rows) {
        const clash = kept.find(
          (keptRow) =>
            keptRow.stepBatch &&
            row.fromStep <= keptRow.stepBatch.toStep &&
            row.toStep >= keptRow.stepBatch.fromStep,
        );
        if (clash?.stepBatch) {
          throw new BadRequestException(
            `Installment #${row.idx + 1}: steps ${row.fromStep}–${row.toStep} overlap the kept installment #${clash.installmentNumber} (${clash.status}, steps ${clash.stepBatch.fromStep}–${clash.stepBatch.toStep}). Paid and cancelled installments keep their steps.`,
          );
        }
      }

      const sum = rows.reduce(
        (acc, row) => acc.plus(row.amount),
        new Prisma.Decimal(0),
      );
      const diff = sum.minus(target).abs();
      if (diff.gt(MONEY_EPSILON)) {
        throw new BadRequestException(
          kept.length > 0
            ? `Installment amounts (Σ ${sum.toString()}) must equal what is left to pay ` +
                `${target.toString()} (totalPrice ${fresh.totalPrice.toString()} − kept installments ${keptSum.toString()}). Difference: ${diff.toString()}.`
            : `Installment amounts (Σ ${sum.toString()}) must equal totalPrice ` +
                `${fresh.totalPrice.toString()}. Difference: ${diff.toString()}.`,
        );
      }

      // Open rows go (their batches first; dead attempts keep their row
      // as SetNull). Kept rows and their batches stay untouched.
      const replacedIds = replaced.map((row) => row.id);
      if (replacedIds.length > 0) {
        await tx.quoteStepBatch.deleteMany({
          where: { installmentId: { in: replacedIds } },
        });
        await tx.quoteInstallment.deleteMany({
          where: { id: { in: replacedIds } },
        });
      }

      // New rows continue the numbering after the kept ones: both
      // numbers are unique per quotation.
      const firstInstallment =
        kept.reduce((max, row) => Math.max(max, row.installmentNumber), 0) + 1;
      const firstBatch =
        kept.reduce(
          (max, row) => Math.max(max, row.stepBatch?.batchNumber ?? 0),
          0,
        ) + 1;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const installment = await tx.quoteInstallment.create({
          data: {
            quotationId,
            installmentNumber: firstInstallment + i,
            amount: row.amount,
            availableFrom: row.availableFrom,
            dueDate: row.dueDate,
            status: InstallmentStatus.pending,
          },
        });
        await tx.quoteStepBatch.create({
          data: {
            quotationId,
            installmentId: installment.id,
            batchNumber: firstBatch + i,
            fromStep: row.fromStep,
            toStep: row.toStep,
            status: BatchStatus.locked,
          },
        });
      }

      const money = await readOneQuoteMoney(tx, quotationId);
      const settlement = settleQuote(fresh.totalPrice, money.received);
      const updated = await tx.quotation.update({
        where: { id: quotationId },
        data: {
          // A plan that keeps paid rows has several installments, whatever
          // mode described the new ones.
          paymentMode:
            kept.length > 0 ? PaymentMode.installments : dto.paymentMode,
          paidAmount: settlement.paidAmount,
          remainingAmount: settlement.remainingAmount,
          paymentStatus: settlement.paymentStatus,
        },
      });
      if (
        settlement.paymentStatus === QuotationPaymentStatus.paid &&
        fresh.paymentStatus !== QuotationPaymentStatus.paid
      ) {
        await advanceOrderWhenPaid(tx, fresh.orderId);
      }

      if (fresh.status !== QuotationStatus.draft) {
        await tx.orderAuditLog.create({
          data: quoteUpdateAudit({
            orderId: fresh.orderId,
            caller,
            actorName,
            changes: {},
            metadata: {
              quotationId: fresh.id,
              quotationNumber: fresh.quotationNumber,
              quotationStatus: fresh.status,
              kind: 'plan',
              keptInstallments: kept.map((row) => row.installmentNumber),
              replacedInstallments: replaced.map((row) => ({
                installmentNumber: row.installmentNumber,
                amount: row.amount.toFixed(3),
              })),
              installments: rows.map((row, i) => ({
                installmentNumber: firstInstallment + i,
                amount: row.amount.toFixed(3),
                fromStep: row.fromStep,
                toStep: row.toStep,
              })),
            },
          }),
        });
      }
      return updated;
    });

    this.logger.log(
      `Configured payment plan (${dto.paymentMode}, ${rows.length} new installments) on quote ${quotationId}`,
    );
    const rendered = await this.quotationPdf.refreshStoredPdf(result);
    return presentQuote(this.prisma, rendered);
  }

  /**
   * FULL_PAYMENT / INSTALLMENTS count rules. Without a kept (paid or
   * cancelled) row they describe the whole plan, as always. Once rows are
   * kept they describe the new rows only: FULL_PAYMENT = settle the
   * balance in one row, INSTALLMENTS = one or more new rows (the plan
   * already has several).
   */
  private assertPlanShape(
    mode: PaymentMode,
    newRows: number,
    keptRows: number,
  ): void {
    if (mode === PaymentMode.full_payment && newRows !== 1) {
      throw new BadRequestException(
        keptRows > 0
          ? 'FULL_PAYMENT settles the balance in exactly one new installment, next to the kept (paid or cancelled) installments.'
          : 'FULL_PAYMENT requires exactly one installment.',
      );
    }
    if (mode === PaymentMode.installments && newRows < (keptRows > 0 ? 1 : 2)) {
      throw new BadRequestException(
        keptRows > 0
          ? 'INSTALLMENTS requires at least one new installment next to the kept (paid or cancelled) installments.'
          : 'INSTALLMENTS requires at least two installments.',
      );
    }
  }

  /**
   * Doctor-or-admin approval that ALSO progresses the order into the
   * payment phase when the quote carries a pack. Legacy quotes (no
   * packId) skip this branch and remain on the existing approve()
   * path.
   *
   * Returns true when this method took ownership (pack quote); false
   * when the legacy QuotationService.approve should run instead.
   */
  async tryApprovePackQuote(
    quote: Quotation,
    caller: Caller,
  ): Promise<boolean> {
    if (!quote.packId) return false;

    // Quote MUST have a fully configured plan or doctor cannot approve.
    // This should normally be caught earlier (QuotationService.send
    // refuses to dispatch pack quotes without a plan), but we keep the
    // guard here for legacy data and race-condition safety. The error
    // copy targets BOTH audiences — doctors get a clear "talk to the
    // clinic" path, admins get a clear next step.
    const planRowCount = await this.prisma.quoteInstallment.count({
      where: { quotationId: quote.id },
    });
    if (planRowCount === 0) {
      throw new BadRequestException(
        'The payment plan for this quote is not configured yet. Please ask the clinic admin to finalise the installments before you approve.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.quotation.update({
        where: { id: quote.id },
        data: {
          status: QuotationStatus.approved,
          approvedAt: new Date(),
          approvedById: caller.userId,
          doctorApprovedAt: new Date(),
          paymentStatus: QuotationPaymentStatus.pending,
        },
      });
      await tx.dentalOrder.update({
        where: { id: quote.orderId },
        data: { status: OrderStatus.payment_plan_selected },
      });
    });
    return true;
  }

  /**
   * Read the plan (installments + batches) for a quote — exposed
   * to both admin + doctor (the controller checks ownership).
   */
  /**
   * SECURITY (audit M-1): authorize the caller against the parent order
   * before returning any of the quote's financial schedule. Without this
   * an authenticated dentist/designer could read ANY order's installments
   * + step-batches by supplying a known quotation id (BOLA/CWE-639).
   * Mirrors the admin / owning-dentist / assigned-designer rule used by
   * every other quotation read path (QuotationService.assertOrderReadable).
   */
  private async assertPlanReadable(
    quotationId: string,
    caller: Caller,
  ): Promise<void> {
    const quote = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      select: {
        deletedAt: true,
        order: {
          select: { doctorId: true, assignedDesignerId: true, deletedAt: true },
        },
      },
    });
    if (!quote || quote.deletedAt || !quote.order || quote.order.deletedAt) {
      throw new NotFoundException('Quotation not found');
    }
    // Single shared rule — see common/access/order-access.policy.ts.
    this.orderAccess.assertCanRead(quote.order, caller);
  }

  /** Both halves of the plan, behind one access check. */
  async getPlan(quotationId: string, caller: Caller) {
    await this.assertPlanReadable(quotationId, caller);
    const [installments, batches] = await Promise.all([
      this.readInstallments(quotationId),
      this.readBatches(quotationId, caller),
    ]);
    return { installments, batches };
  }

  /** GET quotations/:id/installments: the schedule, without the batches. */
  async getInstallments(quotationId: string, caller: Caller) {
    await this.assertPlanReadable(quotationId, caller);
    return this.readInstallments(quotationId);
  }

  /**
   * GET quotations/:id/step-batches: the batches only, so the transfer
   * read (withLatestTransfers) and the installments query never run for a
   * half the route throws away.
   */
  async getBatches(quotationId: string, caller: Caller) {
    await this.assertPlanReadable(quotationId, caller);
    return this.readBatches(quotationId, caller);
  }

  /** The installments, overdue marked, each with its latest transfer. */
  private async readInstallments(quotationId: string) {
    const installments = await this.prisma.quoteInstallment.findMany({
      where: { quotationId },
      orderBy: { installmentNumber: 'asc' },
    });
    // Mark overdue on read — cheap derivation, no scheduler needed.
    const now = Date.now();
    const annotated = installments.map((row) =>
      row.status === InstallmentStatus.pending &&
      row.dueDate &&
      row.dueDate.getTime() < now
        ? { ...row, status: InstallmentStatus.overdue }
        : row,
    );
    // Each installment's latest bank-transfer declaration (CONTRACT §2.1
    // latestTransfer: state, review stamp, refusal reason, hasProof; never
    // a file path), read in one query over the plan's installments.
    return withLatestTransfers(this.prisma, annotated);
  }

  /** The batches; a manual unlock's reason is shown to staff only. */
  private async readBatches(quotationId: string, caller: Caller) {
    const batches = await this.prisma.quoteStepBatch.findMany({
      where: { quotationId },
      orderBy: { batchNumber: 'asc' },
    });
    // A manual unlock's reason is an admin's internal note (spec §3: the
    // doctor is not told): staff only.
    return isAdmin(caller)
      ? batches
      : batches.map((batch) => ({ ...batch, unlockReason: null }));
  }

  /**
   * POST quotations/:quotationId/step-batches/:batchId/unlock (admin, spec
   * §3, CONTRACT §2.5): release a LOCKED batch by hand, with a reason,
   * while its installment stays pending (the money rules are untouched).
   * One transaction, in the programme's lock order: the installment row
   * FOR UPDATE, then the order (lockProductionOrder), then the one writer
   * unlockStepBatch(source manual): guarded update, D2 projection (steps
   * an admin delivered before flip the batch), batch_unlocked journal row.
   *   • 400 UNLOCK_REASON_REQUIRED before any read when the reason is not
   *     3-500 characters once trimmed;
   *   • 404 BATCH_NOT_FOUND when the batch is not on this live quotation
   *     (also when a re-plan deleted it while this call waited for a lock);
   *   • 409 BATCH_UNLOCK_QUOTE_NOT_LIVE when the quote is neither sent nor
   *     accepted (nothing could be paid on it either);
   *   • an unlocked or delivered batch is returned as is (idempotent 200,
   *     nothing written, no event).
   * BatchUnlocked (source manual) goes out after the commit: the admins'
   * "lot débloqué" item; listeners never tell the doctor of a manual one,
   * nobody tells the technician.
   */
  async unlockBatch(
    quotationId: string,
    batchId: string,
    rawReason: unknown,
    caller: Caller,
  ): Promise<QuoteStepBatch> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException('Only admins can unlock a batch.');
    }
    const reason = validReason(rawReason);
    if (!reason) {
      throw new BadRequestException(
        'Indiquez le motif du déblocage (3 à 500 caractères).',
        BATCH_UNLOCK_ERROR.UNLOCK_REASON_REQUIRED,
      );
    }
    const notFound = () =>
      new NotFoundException(
        'Batch not found',
        BATCH_UNLOCK_ERROR.BATCH_NOT_FOUND,
      );

    const result = await this.prisma.$transaction(async (tx) => {
      const target = await tx.quoteStepBatch.findUnique({
        where: { id: batchId },
        select: UNLOCK_BATCH_TARGET_SELECT,
      });
      if (
        !target ||
        target.quotationId !== quotationId ||
        target.quotation.deletedAt ||
        target.quotation.order.deletedAt
      ) {
        throw notFound();
      }
      const { orderId } = target.quotation;
      // Installment first, then the order: a settlement of the same
      // installment (settleWithin) queues behind, never deadlocks.
      await tx.$queryRaw`SELECT id FROM "QuoteInstallment" WHERE id = ${target.installmentId} FOR UPDATE`;
      await lockProductionOrder(tx, orderId);

      // Re-read under the locks: a re-plan or a pack change (they lock the
      // installments first) may have deleted the batch meanwhile, and the
      // quote may have been recalled. A batch already released is the
      // idempotent answer whatever the quote's status.
      const live = await tx.quoteStepBatch.findUnique({
        where: { id: batchId },
        select: UNLOCK_BATCH_LIVE_SELECT,
      });
      if (
        !live ||
        live.quotationId !== quotationId ||
        live.quotation.deletedAt
      ) {
        throw notFound();
      }
      if (
        live.status === BatchStatus.locked &&
        !UNLOCKABLE_QUOTE_STATUSES.includes(live.quotation.status)
      ) {
        throw new ConflictException(
          "Le devis n'est ni envoyé ni accepté : la tranche ne peut pas être débloquée.",
          PAYMENT_PLAN_ERROR.QUOTE_NOT_UNLOCKABLE,
        );
      }

      const released = await unlockStepBatch(tx, {
        batchId,
        source: BatchUnlockSource.manual,
        actor: caller,
        reason,
      });
      // One after the other: a transaction client runs one query at a time.
      const batch = await tx.quoteStepBatch.findUniqueOrThrow({
        where: { id: batchId },
      });
      const order = released
        ? await tx.dentalOrder.findUnique({
            where: { id: orderId },
            select: UNLOCK_EVENT_ORDER_SELECT,
          })
        : null;
      return { batch, released, order };
    });

    if (result.released && result.order) {
      this.emitManualUnlock(result.released, result.order, caller);
      this.logger.log(
        `Batch ${result.released.batchNumber} (steps ${result.released.fromStep}-${result.released.toStep}) of quote ${quotationId} unlocked by hand by ${caller.userId}`,
      );
    }
    return result.batch;
  }

  /** After the commit, like every notification event. */
  private emitManualUnlock(
    released: UnlockedStepBatch,
    order: Prisma.DentalOrderGetPayload<{
      select: typeof UNLOCK_EVENT_ORDER_SELECT;
    }>,
    caller: Caller,
  ): void {
    this.events.emit(NotificationEvents.BatchUnlocked, {
      batchId: released.id,
      quotationId: released.quotationId,
      orderId: released.orderId,
      orderCode: order.orderCode,
      doctorId: order.doctorId,
      doctorName: order.doctor.fullName,
      patientName: order.patient.fullName,
      fromStep: released.fromStep,
      toStep: released.toStep,
      batchNumber: released.batchNumber,
      source: BatchUnlockSource.manual,
      paymentId: null,
      installmentNumber: released.installmentNumber,
      actorId: caller.userId,
    } satisfies BatchUnlockedEvent);
  }

  /**
   * "Marquer livré" on a step batch (admin only), kept for the existing
   * clients (owner decision D2, CONTRACT §3.4): ONE transaction under the
   * order lock.
   *   • locked    → 400, as before: steps_not_released is never
   *                 auto-confirmed (D1 wants a person and a note);
   *   • delivered → the row as is, no declaration and no notice (a
   *                 double click never pings the doctor twice);
   *   • unlocked, limited pack → the lab production delivery path, the
   *                 ONE source of truth for "delivered": each treated
   *                 arch's steps up to its approved total are declared,
   *                 the batch projection flips the batch (coverage start,
   *                 auto-finish) and the outbox writes the production
   *                 notice, which replaces the old BatchDelivered one;
   *   • unlocked, unlimited-step pack → its batches are payment
   *                 placeholders ([1,1], [2,2]…), not aligner ranges
   *                 (CONC-01): nothing is declared to the lab, the batch
   *                 is flipped here as before the production module, and
   *                 BatchDelivered tells the practitioner.
   * A warning the button cannot vouch for (steps already delivered) is a
   * 409 PRODUCTION_CONFIRM_REQUIRED: use the production form.
   */
  async deliverBatch(
    quotationId: string,
    batchId: string,
    caller: Caller,
  ): Promise<QuoteStepBatch> {
    if (!isAdmin(caller)) {
      throw new ForbiddenException(
        'Only admins can mark a batch as delivered.',
      );
    }
    const actorName = await lookupActorName(this.prisma, caller.userId);
    const result = await this.prisma.$transaction(async (tx) => {
      // The path's quotation names the order to lock, in one statement.
      // The pack kind is safe to read before the lock: attachPack refuses
      // once a payment was received, and an unlocked batch means one was.
      const quote = await tx.quotation.findUnique({
        where: { id: quotationId },
        select: { orderId: true, deletedAt: true, isUnlimitedSteps: true },
      });
      if (!quote || quote.deletedAt) {
        throw new NotFoundException('Batch not found');
      }
      const { orderId } = quote;
      await lockProductionOrder(tx, orderId);
      // Read under the lock: this is what absorbs a double click. A batch
      // of another quotation than the path's is the same 404 as before.
      const batch = await tx.quoteStepBatch.findUnique({
        where: { id: batchId },
      });
      if (!batch || batch.quotationId !== quotationId) {
        throw new NotFoundException('Batch not found');
      }
      if (batch.status === BatchStatus.locked) {
        throw new BadRequestException(
          'Locked batches cannot be delivered — wait for the linked installment to be paid.',
        );
      }
      if (batch.status === BatchStatus.delivered) {
        return { batch, delivered: null };
      }
      if (quote.isUnlimitedSteps) {
        return this.deliverPlaceholderBatch(tx, orderId, batch, caller);
      }

      await this.production.declareBatchDelivery(
        tx,
        { orderId, batch },
        caller,
        { actorName, now: new Date() },
      );
      // The projection chose the flip's date and author: the stored row is
      // the answer.
      return {
        batch: await tx.quoteStepBatch.findUniqueOrThrow({
          where: { id: batchId },
        }),
        delivered: null,
      };
    });
    // After the commit, as every notification event.
    if (result.delivered) {
      this.events.emit(NotificationEvents.BatchDelivered, result.delivered);
    }
    return result.batch;
  }

  /**
   * The pre-production "Marquer livré", kept for unlimited-step packs only
   * (CONC-01), in the caller's transaction under the order lock: flips the
   * one batch (deliveredByProduction false: no production cancel ever
   * reverts it), starts the coverage window with a compare-and-set on the
   * state read here (a concurrent hand-over that started it first wins),
   * and finishes the case once every batch is delivered. Returns the
   * BatchDelivered payload, emitted by the caller after the commit.
   *
   * The case passes the same gate as a production delivery first
   * (declareBatchDelivery): an archived order is a 404, a draft, cancelled
   * or rejected one a 409 ORDER_NOT_IN_PRODUCTION, so a stale quote panel
   * can never finish such a case nor notify its practitioner.
   */
  private async deliverPlaceholderBatch(
    tx: Prisma.TransactionClient,
    orderId: string,
    batch: QuoteStepBatch,
    caller: Caller,
  ): Promise<{ batch: QuoteStepBatch; delivered: BatchEvent }> {
    const order = await tx.dentalOrder.findUnique({
      where: { id: orderId },
      select: PLACEHOLDER_DELIVERY_ORDER_SELECT,
    });
    if (!order) throw new NotFoundException('Batch not found');
    // The batch is unlocked: the case has a released batch.
    this.orderAccess.assertCanProduce(
      {
        status: order.status,
        deletedAt: order.deletedAt,
        hasReleasedBatch: true,
      },
      caller,
    );
    const deliveredAt = new Date();
    const updated = await tx.quoteStepBatch.update({
      where: { id: batch.id, status: BatchStatus.unlocked },
      data: {
        status: BatchStatus.delivered,
        deliveredAt,
        deliveredById: caller.userId,
        deliveredByProduction: false,
      },
    });
    const coverage = coverageWindowPatch(
      {
        orderType: order.orderType,
        coverageStartedAt: order.coverageStartedAt,
        coverageExpiresAt: order.coverageExpiresAt,
        treatmentValidityMonths:
          order.quotation?.treatmentValidityMonths ?? null,
      },
      deliveredAt,
    );
    if (coverage) {
      await tx.dentalOrder.updateMany({
        where: {
          id: orderId,
          coverageStartedAt: order.coverageStartedAt,
          coverageExpiresAt: order.coverageExpiresAt,
        },
        data: coverage,
      });
    }
    const everyDelivered = (order.quotation?.stepBatches ?? []).every(
      (row) => row.id === batch.id || row.status === BatchStatus.delivered,
    );
    if (everyDelivered && order.status !== OrderStatus.finished) {
      await tx.dentalOrder.update({
        where: { id: orderId },
        data: { status: OrderStatus.finished },
        select: { id: true },
      });
    }
    return {
      batch: updated,
      delivered: {
        batchId: updated.id,
        quotationId: updated.quotationId,
        orderId,
        orderCode: order.orderCode,
        doctorId: order.doctorId,
        doctorName: order.doctor.fullName,
        patientName: order.patient.fullName,
        fromStep: updated.fromStep,
        toStep: updated.toStep,
        batchNumber: updated.batchNumber,
      },
    };
  }
}
