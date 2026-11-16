import {
  BatchStatus,
  OrderStatus,
  OrderType,
  type Prisma,
} from '@prisma/client';

/**
 * Coverage window of an INITIAL case: the period, counted from the first
 * time aligners reach the patient, during which the pack's included
 * corrections apply. Its two dates live on the order
 * (`coverageStartedAt`, `coverageExpiresAt`); the duration is the pack
 * validity snapshotted on the case's quotation (`treatmentValidityMonths`).
 *
 * Every writer that hands aligners over (first AlignerDelivery, first
 * delivered quote-step batch, the boot reconciliation, an admin moving the
 * case to shipped or finished) calls `startCoverageWindow`, which is
 * idempotent: the clock starts once and is never moved by a later event.
 */

/** Statuses whose manual (admin) entry is a hand-over of the aligners. */
export const COVERAGE_START_STATUSES: readonly OrderStatus[] = [
  OrderStatus.shipped,
  OrderStatus.finished,
];

/** True when moving an order into `status` starts its coverage window. */
export function startsCoverageWindow(status: OrderStatus): boolean {
  return COVERAGE_START_STATUSES.includes(status);
}

/**
 * `start` plus `months` calendar months, the day of month clamped to the
 * end of the target month (Jan 31 + 1 month = Feb 28, or Feb 29 in a leap
 * year), time of day kept. Computed in UTC like every stored instant.
 * `Date.setUTCMonth` would overflow into the next month instead
 * (Aug 31 + 6 months = Mar 3) and hand out days of coverage nobody sold.
 */
export function addMonthsClamped(start: Date, months: number): Date {
  if (!Number.isInteger(months)) {
    throw new RangeError(`Months must be an integer, got ${months}.`);
  }
  const target = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1),
  );
  const daysInTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(start.getUTCDate(), daysInTargetMonth));
  target.setUTCHours(
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds(),
    start.getUTCMilliseconds(),
  );
  return target;
}

/** What the window rule reads about an order. */
export interface CoverageWindowState {
  orderType: OrderType;
  coverageStartedAt: Date | null;
  coverageExpiresAt: Date | null;
  /** Validity of the live quotation's pack snapshot; null when unknown. */
  treatmentValidityMonths: number | null;
}

/** The coverage columns a hand-over writes. */
export interface CoverageWindowPatch {
  coverageStartedAt?: Date;
  coverageExpiresAt?: Date | null;
}

function expiryFrom(startedAt: Date, months: number | null): Date | null {
  return months !== null && months > 0
    ? addMonthsClamped(startedAt, months)
    : null;
}

/**
 * Pure decision: the columns to write when aligners are handed over at
 * `startedAt`, or null when nothing changes.
 *   • supplemental children have no window of their own (they are covered
 *     by their parent's);
 *   • a window that has not started starts now, its expiry known only when
 *     the validity is (unknown validity sends refinements to an admin);
 *   • a window started before the validity was known gets its expiry, from
 *     its ORIGINAL start, as soon as it is — never a new start date.
 */
export function coverageWindowPatch(
  state: CoverageWindowState,
  startedAt: Date,
): CoverageWindowPatch | null {
  if (state.orderType !== OrderType.initial) return null;
  if (state.coverageStartedAt === null) {
    return {
      coverageStartedAt: startedAt,
      coverageExpiresAt: expiryFrom(startedAt, state.treatmentValidityMonths),
    };
  }
  if (state.coverageExpiresAt === null) {
    const expiry = expiryFrom(
      state.coverageStartedAt,
      state.treatmentValidityMonths,
    );
    return expiry ? { coverageExpiresAt: expiry } : null;
  }
  return null;
}

/**
 * Start (or complete) the coverage window of `orderId` for a hand-over at
 * `startedAt`, inside the caller's transaction. Returns whether a column
 * was written. The write is a compare-and-set on the state it was decided
 * from, so two hand-overs racing each other cannot both start the clock:
 * the second one writes nothing.
 */
export async function startCoverageWindow(
  tx: Prisma.TransactionClient,
  orderId: string,
  startedAt: Date,
): Promise<boolean> {
  const order = await tx.dentalOrder.findUnique({
    where: { id: orderId },
    select: {
      orderType: true,
      coverageStartedAt: true,
      coverageExpiresAt: true,
      quotation: {
        select: { treatmentValidityMonths: true, deletedAt: true },
      },
    },
  });
  if (!order) return false;
  const liveQuote = order.quotation?.deletedAt ? null : order.quotation;
  const patch = coverageWindowPatch(
    {
      orderType: order.orderType,
      coverageStartedAt: order.coverageStartedAt,
      coverageExpiresAt: order.coverageExpiresAt,
      treatmentValidityMonths: liveQuote?.treatmentValidityMonths ?? null,
    },
    startedAt,
  );
  if (!patch) return false;
  const { count } = await tx.dentalOrder.updateMany({
    where: {
      id: orderId,
      coverageStartedAt: order.coverageStartedAt,
      coverageExpiresAt: order.coverageExpiresAt,
    },
    data: patch,
  });
  return count > 0;
}

/**
 * The first real hand-over of an order's aligners: the earliest recorded
 * AlignerDelivery or delivered quote-step batch, whichever came first.
 * Null when nothing was handed over yet. Used to backfill the window of
 * cases delivered before it was tracked.
 */
export async function firstHandOverAt(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<Date | null> {
  const [delivery, batch] = await Promise.all([
    tx.alignerDelivery.aggregate({
      where: { orderId },
      _min: { deliveredAt: true },
    }),
    tx.quoteStepBatch.aggregate({
      where: {
        status: BatchStatus.delivered,
        quotation: { orderId, deletedAt: null },
      },
      _min: { deliveredAt: true },
    }),
  ]);
  const dates = [delivery._min.deliveredAt, batch._min.deliveredAt].filter(
    (date): date is Date => date !== null,
  );
  if (dates.length === 0) return null;
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}
