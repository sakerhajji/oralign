import { Injectable, Logger } from '@nestjs/common';
import {
  OrderStatus,
  PaymentProvider,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { type Caller } from '../../common/access/caller';
import { NotFoundException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import {
  WelcomeGiftMarkResponseDto,
  WelcomeGiftStatusDto,
} from '../dto/welcome-gift.dto';
import { OrderAuditService } from './order-audit.service';

/** OrderAuditLog action written when the gift lands on an order. */
export const WELCOME_GIFT_AUDIT_ACTION = 'welcome_gift_applied';

/** Hosted card attempts still open at the gateway (same set ClicToPay reuses). */
const LIVE_CARD_STATUSES: PaymentRecordStatus[] = [
  PaymentRecordStatus.pending,
  PaymentRecordStatus.unknown,
];

/**
 * "This doctor already has a case": an order that was submitted at least
 * once or is past draft. No `deletedAt` filter on purpose — an archived or
 * canceled case still was one of the doctor's cases. It only decides
 * `firstCase` (which copy the doctor sees), never eligibility.
 */
const SUBMITTED_ONCE: Prisma.DentalOrderWhereInput[] = [
  { submittedAt: { not: null } },
  { status: { not: OrderStatus.draft } },
];

/** What the gift waives on one order, frozen at the moment it is applied. */
type Waiver = {
  treatmentFee: Prisma.Decimal;
  cbctFee: Prisma.Decimal;
  total: Prisma.Decimal;
  currency: string;
};

/** The settings columns a waiver is priced from. */
type WaiverSettings = {
  defaultTreatmentFee: Prisma.Decimal;
  defaultCurrency: string | null;
};

/**
 * Welcome gift, once per practitioner: the order's treatment-fee charge
 * (live `defaultTreatmentFee` + the order's own CBCT supplement snapshot)
 * is waived on the NEXT case a doctor submits while the gift is on — a new
 * practitioner's first case, a current practitioner's next one.
 *
 * The doctor mark `User.welcomeGiftUsedAt` alone decides: NULL = the gift
 * lands on the next submitted case, set = never. It is written with the
 * gift, nothing clears it automatically, and an admin may set or clear it
 * by hand (`setDoctorMark`): a doctor reset to "available" gets a new gift
 * on a later case, so one doctor can hold several gift orders over time.
 * Cases submitted before are never repriced, and nothing else is either —
 * quotes, packs, installments and loyalty never read these columns.
 *
 * The gift is frozen on the order (`welcomeGift*` columns) and is never paid,
 * so `treatmentFeePaidAt/Amount` stay NULL: the order stays out of revenue,
 * treatment-fee receipts and invoices. The fee engine refuses to charge it
 * (WELCOME_GIFT_NOTHING_DUE) and the treatment-plan gate accepts it.
 */
@Injectable()
export class WelcomeGiftService {
  private readonly logger = new Logger(WelcomeGiftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderAudit: OrderAuditService,
  ) {}

  /**
   * Banner state for one doctor, from the LIVE settings. `eligible` is the
   * banner rule: switch on, the doctor not marked, and something worth
   * offering (total > 0). The mark alone decides: an earlier gift order
   * does not count once an admin cleared the mark. Drafts and past cases
   * do not matter either; they only decide `firstCase` (no case submitted
   * yet = the gift will land on their very first case). `giftOrderId` is
   * the doctor's most recent gift order, for information only.
   */
  async getStatus(doctorId: string): Promise<WelcomeGiftStatusDto> {
    const [settings, doctor, giftOrder, submitted] = await Promise.all([
      this.prisma.companyBillingSettings.findFirst({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
        select: {
          welcomeGiftEnabled: true,
          defaultTreatmentFee: true,
          defaultCurrency: true,
          cbctSupplementEnabled: true,
          cbctSupplementFee: true,
        },
      }),
      this.prisma.user.findUnique({
        where: { id: doctorId },
        select: { welcomeGiftUsedAt: true },
      }),
      this.prisma.dentalOrder.findFirst({
        where: { doctorId, welcomeGiftAppliedAt: { not: null } },
        orderBy: { welcomeGiftAppliedAt: 'desc' },
        select: { id: true },
      }),
      this.prisma.dentalOrder.findFirst({
        where: { doctorId, OR: SUBMITTED_ONCE },
        select: { id: true },
      }),
    ]);

    // No settings row = nothing configured = nothing to offer.
    const enabled = settings?.welcomeGiftEnabled ?? false;
    const treatmentFee = new Prisma.Decimal(settings?.defaultTreatmentFee ?? 0);
    const supplement = new Prisma.Decimal(settings?.cbctSupplementFee ?? 0);
    const cbctOffered =
      Boolean(settings?.cbctSupplementEnabled) && supplement.gt(0);
    const cbctFee = cbctOffered ? supplement : new Prisma.Decimal(0);
    const total = treatmentFee.add(cbctFee);
    // A missing user row never qualifies (applyOnSubmit refuses it too).
    const unmarked = doctor !== null && doctor.welcomeGiftUsedAt === null;

    return {
      enabled,
      eligible: enabled && unmarked && total.gt(0),
      firstCase: !submitted,
      currency: settings?.defaultCurrency || 'TND',
      treatmentFee: treatmentFee.toNumber(),
      cbctFee: cbctFee.toNumber(),
      cbctOffered,
      total: total.toNumber(),
      giftOrderId: giftOrder?.id ?? null,
    };
  }

  /**
   * Apply the gift to `orderId` if its doctor's mark is clear. Runs INSIDE
   * OrderService.submitOrder's transaction, after the status update, so the
   * gift and the doctor mark commit (or roll back) together with the
   * submission.
   *
   * Returns true only when THIS call wrote the gift. An order that already
   * carries it (an admin rolled it back to draft and it is re-submitted)
   * keeps it untouched and returns false: never re-priced, never removed —
   * even when an admin cleared the doctor's mark meanwhile (the doctor then
   * stays available and the gift lands on their next NEW case).
   *
   * Concurrency: every gift decision of one doctor (this method and the
   * admin's `setDoctorMark`) is serialized by a transaction-scoped advisory
   * lock, which is database-wide and so holds across app instances, and
   * every rule is re-read AFTER the lock with `tx`. Under READ COMMITTED
   * each statement sees the commits of the transactions that held the lock
   * before us, so two drafts submitted at the same instant cannot both
   * receive the gift. `writeGift` then CLAIMS the mark with a
   * compare-and-set (`UPDATE … WHERE welcomeGiftUsedAt IS NULL`) and only
   * writes the order when it won, so even a writer that bypassed the lock
   * could not turn one mark into two gifts. Nothing here can raise a
   * constraint error mid-transaction (there is no unique index on gift
   * orders any more: a doctor reset by an admin may hold several).
   *
   * A gift stays with the doctor who received it: an admin's
   * OrderService.updateOrder refuses to move a gift order to another doctor
   * (400 WELCOME_GIFT_ORDER_REASSIGN), and purgeOrders treats the gift as
   * protected history, so a gift order can be archived but never purged.
   */
  async applyOnSubmit(
    tx: Prisma.TransactionClient,
    orderId: string,
    doctorId: string,
    caller: Caller,
  ): Promise<boolean> {
    await this.lockDoctor(tx, doctorId);

    const order = await tx.dentalOrder.findUnique({
      where: { id: orderId },
      select: {
        doctorId: true,
        useCbctWithScans: true,
        cbctFeeAmount: true,
        treatmentFeePaidAt: true,
        treatmentFeePaymentMethod: true,
        welcomeGiftAppliedAt: true,
      },
    });
    // The lock is keyed on the doctor we were told about; an order that
    // changed hands meanwhile is not decided under the right lock.
    if (!order || order.doctorId !== doctorId) return false;
    // Idempotent per order: an existing gift is kept as frozen.
    if (order.welcomeGiftAppliedAt) return false;

    // Rule 1 — the master switch on the active settings row.
    const settings = await this.activeSettings(tx);
    if (!settings?.welcomeGiftEnabled) return false;

    // Rule 2 — the doctor mark is clear. The mark alone decides: earlier
    // cases do NOT matter (a current practitioner gets it on their next
    // case), and neither does an earlier gift order once an admin reset
    // the mark. Read here for an early exit; `writeGift` claims it with a
    // compare-and-set.
    const doctor = await tx.user.findUnique({
      where: { id: doctorId },
      select: { welcomeGiftUsedAt: true },
    });
    if (!doctor || doctor.welcomeGiftUsedAt) return false;

    // Rule 3 — no treatment-fee activity on this order. We never refund
    // automatically, so a doctor who already started paying keeps the
    // normal flow.
    if (order.treatmentFeePaidAt || order.treatmentFeePaymentMethod) {
      return false;
    }
    if (await this.hasLiveCardAttempt(tx, orderId)) return false;

    // Rule 4 — something to waive: the live treatment fee plus the order's
    // OWN CBCT snapshot (only when it requested CBCT).
    const waiver = WelcomeGiftService.priceWaiver(
      settings,
      order.useCbctWithScans ? order.cbctFeeAmount : null,
    );
    // gt(0), not isPositive(): Decimal.js counts +0 as positive.
    if (!waiver.total.gt(0)) return false;

    // Not a rule, the copy: is this the doctor's very first case? Any OTHER
    // case ever submitted counts — archived and canceled ones included.
    const earlier = await tx.dentalOrder.findFirst({
      where: { doctorId, id: { not: orderId }, OR: SUBMITTED_ONCE },
      select: { id: true },
    });

    return this.writeGift(
      tx,
      { id: orderId, doctorId },
      waiver,
      earlier === null,
      caller,
    );
  }

  /**
   * Admin control of the doctor mark. `used = true` marks the doctor (the
   * gift will not be offered again; an existing mark keeps its original
   * timestamp), `used = false` clears it (the doctor gets the gift on the
   * next case they submit — a new gift order, earlier ones stay as they
   * are). Idempotent. Runs under the same per-doctor advisory lock as
   * `applyOnSubmit`, so it cannot interleave with a submission deciding
   * the gift for that doctor.
   *
   * 404 when the user does not exist, is soft-deleted or is not a dentist:
   * the mark only means something for a practitioner.
   */
  async setDoctorMark(
    doctorId: string,
    used: boolean,
    caller: Caller,
  ): Promise<WelcomeGiftMarkResponseDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockDoctor(tx, doctorId);
      const doctor = await tx.user.findUnique({
        where: { id: doctorId },
        select: { role: true, deletedAt: true, welcomeGiftUsedAt: true },
      });
      if (!doctor || doctor.deletedAt || doctor.role !== UserRole.dentist) {
        throw new NotFoundException('Practitioner not found');
      }
      const current = doctor.welcomeGiftUsedAt;
      // Idempotent: already in the requested state → keep it as is (a
      // "used" mark keeps the instant the gift was actually consumed).
      if (used === (current !== null)) {
        return { welcomeGiftUsedAt: current, changed: false };
      }
      const next = used ? new Date() : null;
      await tx.user.update({
        where: { id: doctorId },
        data: { welcomeGiftUsedAt: next },
      });
      return { welcomeGiftUsedAt: next, changed: true };
    });

    this.logger.log(
      `Welcome gift mark ${used ? 'set (used)' : 'cleared (available)'} for doctor ${doctorId} by ${caller.role} ${caller.userId}${result.changed ? '' : ' (unchanged)'}`,
    );
    return { doctorId, welcomeGiftUsedAt: result.welcomeGiftUsedAt };
  }

  /**
   * Serializes every gift decision of one doctor, transaction-scoped:
   * released at COMMIT / ROLLBACK.
   */
  private async lockDoctor(
    tx: Prisma.TransactionClient,
    doctorId: string,
  ): Promise<void> {
    const lockKey = `welcome-gift:${doctorId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
  }

  /** The active billing settings row, newest first (rule 1 + pricing). */
  private activeSettings(tx: Prisma.TransactionClient) {
    return tx.companyBillingSettings.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: {
        welcomeGiftEnabled: true,
        defaultTreatmentFee: true,
        defaultCurrency: true,
      },
    });
  }

  /** A hosted card attempt for the treatment fee still open at the gateway. */
  private async hasLiveCardAttempt(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<boolean> {
    const live = await tx.payment.findFirst({
      where: {
        orderId,
        purpose: PaymentPurpose.treatment_fee,
        provider: PaymentProvider.clictopay,
        status: { in: LIVE_CARD_STATUSES },
      },
      select: { id: true },
    });
    return live !== null;
  }

  /**
   * What the gift waives: the LIVE treatment fee plus the given CBCT
   * snapshot (null = no CBCT charge), in the settings currency.
   */
  private static priceWaiver(
    settings: WaiverSettings,
    cbctSnapshot: Prisma.Decimal | null,
  ): Waiver {
    const treatmentFee = new Prisma.Decimal(settings.defaultTreatmentFee);
    const cbctFee = new Prisma.Decimal(cbctSnapshot ?? 0);
    return {
      treatmentFee,
      cbctFee,
      total: treatmentFee.add(cbctFee),
      currency: settings.defaultCurrency || 'TND',
    };
  }

  /**
   * The ONE write path of the gift: the doctor mark (claimed first), the
   * frozen columns on the order (same instant) and one
   * `welcome_gift_applied` audit row. The payment columns are never
   * touched — nothing was paid. Returns false, writing nothing, when the
   * mark was no longer clear.
   */
  private async writeGift(
    tx: Prisma.TransactionClient,
    order: { id: string; doctorId: string },
    waiver: Waiver,
    firstCase: boolean,
    caller: Caller,
  ): Promise<boolean> {
    const appliedAt = new Date();
    // Compare-and-set on the doctor mark: only the writer that flips it
    // from NULL wins. From now on this doctor is not eligible again,
    // whatever later happens to this order, unless an admin clears it.
    const claimed = await tx.user.updateMany({
      where: { id: order.doctorId, welcomeGiftUsedAt: null },
      data: { welcomeGiftUsedAt: appliedAt },
    });
    if (claimed.count !== 1) return false;

    await tx.dentalOrder.update({
      where: { id: order.id },
      data: {
        welcomeGiftAppliedAt: appliedAt,
        welcomeGiftTreatmentFee: waiver.treatmentFee,
        welcomeGiftCbctFee: waiver.cbctFee,
        welcomeGiftCurrency: waiver.currency,
        welcomeGiftFirstCase: firstCase,
      },
    });
    const auditEntry = await this.orderAudit.entry(
      caller,
      WELCOME_GIFT_AUDIT_ACTION,
      null,
      {
        treatmentFee: waiver.treatmentFee.toNumber(),
        cbctFee: waiver.cbctFee.toNumber(),
        total: waiver.total.toNumber(),
        currency: waiver.currency,
        firstCase,
      },
    );
    await tx.orderAuditLog.create({
      data: { orderId: order.id, ...auditEntry },
    });

    this.logger.log(
      `Welcome gift applied to order ${order.id} (doctor ${order.doctorId}, ${firstCase ? 'first case' : 'later case'}): ${waiver.total.toString()} ${waiver.currency} waived`,
    );
    return true;
  }
}
