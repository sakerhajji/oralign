import { OrderStatus } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
} from '../common/exceptions/app.exception';

/**
 * The business rules of aligner delivery tracking, as pure functions:
 * no I/O, no DI, no clock of their own. The service owns the transaction
 * and the lock; everything it decides, it decides through here — so the
 * rules are unit-testable in isolation and exist in exactly one place.
 *
 * Model: an order's aligners are ONE series, numbered 1..totalAligners.
 * Each delivery hands over a contiguous range [fromAligner, toAligner].
 * Ranges of one order never overlap; gaps are legal (a clinic may hand
 * over 8 → 10 while 4 → 7 is still at the lab) and simply show up as
 * several delivered ranges.
 */

/**
 * Largest series an order can declare. Same ceiling the treatment-plan
 * DTO already puts on an aligner count (treatment-plan.dto.ts, @Max(200)).
 */
export const MAX_ALIGNERS_PER_ORDER = 200;

/** Stable error codes — the frontend keys on these, never on messages. */
export const ALIGNER_DELIVERY_ERROR = {
  RANGE_INVALID: 'ALIGNER_RANGE_INVALID',
  RANGE_OUT_OF_BOUNDS: 'ALIGNER_RANGE_OUT_OF_BOUNDS',
  TOTAL_REQUIRED: 'ALIGNER_TOTAL_REQUIRED',
  TOTAL_ALREADY_SET: 'ALIGNER_TOTAL_ALREADY_SET',
  TOTAL_BELOW_DELIVERED: 'ALIGNER_TOTAL_BELOW_DELIVERED',
  DUPLICATE: 'ALIGNER_DELIVERY_DUPLICATE',
  OVERLAP: 'ALIGNER_DELIVERY_OVERLAP',
  DATE_INVALID: 'ALIGNER_DELIVERY_DATE_INVALID',
  DATE_IN_FUTURE: 'ALIGNER_DELIVERY_DATE_IN_FUTURE',
  DATE_BEFORE_ORDER: 'ALIGNER_DELIVERY_DATE_BEFORE_ORDER',
  ORDER_NOT_DELIVERABLE: 'ORDER_NOT_DELIVERABLE',
} as const;

export interface AlignerRange {
  fromAligner: number;
  toAligner: number;
}

/** A delivery as read back from the database. */
export interface PersistedDelivery extends AlignerRange {
  deliveredAt: Date;
}

/**
 * Orders no aligner can be handed over for: never submitted, or
 * cancelled/rejected (current and legacy spellings of the enum). Reading
 * the history of such an order stays allowed.
 */
const NON_DELIVERABLE_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>(
  [
    OrderStatus.draft,
    OrderStatus.canceled,
    OrderStatus.cancelled,
    OrderStatus.rejected,
  ],
);

export function orderAcceptsDeliveries(status: OrderStatus): boolean {
  return !NON_DELIVERABLE_STATUSES.has(status);
}

export function assertOrderAcceptsDeliveries(status: OrderStatus): void {
  if (!orderAcceptsDeliveries(status)) {
    throw new BadRequestException(
      `Aligner deliveries cannot be recorded on an order in "${status}" status.`,
      ALIGNER_DELIVERY_ERROR.ORDER_NOT_DELIVERABLE,
    );
  }
}

export function rangeQuantity(range: AlignerRange): number {
  return range.toAligner - range.fromAligner + 1;
}

export function formatRange(range: AlignerRange): string {
  return `${range.fromAligner} → ${range.toAligner}`;
}

/** 'YYYY-MM-DD' of a date-only value (stored as UTC midnight). */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Sorted copy with overlapping AND adjacent ranges merged:
 * [4→7, 1→3, 10→12] → [1→7, 10→12]. The input is never mutated.
 */
export function mergeRanges(ranges: readonly AlignerRange[]): AlignerRange[] {
  const sorted = ranges
    .map((r) => ({ fromAligner: r.fromAligner, toAligner: r.toAligner }))
    .sort((a, b) => a.fromAligner - b.fromAligner);
  const merged: AlignerRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.fromAligner <= last.toAligner + 1) {
      last.toAligner = Math.max(last.toAligner, range.toAligner);
    } else {
      merged.push(range);
    }
  }
  return merged;
}

/**
 * How many distinct aligners have been delivered: the size of the UNION
 * of the ranges, not the sum of their quantities — correct by
 * construction even if two rows ever overlapped.
 */
export function countDelivered(ranges: readonly AlignerRange[]): number {
  return mergeRanges(ranges).reduce((sum, r) => sum + rangeQuantity(r), 0);
}

/**
 * Lowest aligner number not yet delivered — the natural "from" of the
 * next delivery. Null when the whole series (total known) is delivered.
 */
export function firstUndelivered(
  ranges: readonly AlignerRange[],
  total: number | null,
): number | null {
  let candidate = 1;
  for (const range of mergeRanges(ranges)) {
    if (range.fromAligner > candidate) break;
    candidate = Math.max(candidate, range.toAligner + 1);
  }
  if (total !== null && candidate > total) return null;
  return candidate;
}

/** Highest aligner number already delivered (0 when none). */
export function highestDelivered(ranges: readonly AlignerRange[]): number {
  return ranges.reduce((max, r) => Math.max(max, r.toAligner), 0);
}

export function assertRangeWellFormed(range: AlignerRange): void {
  if (
    !Number.isInteger(range.fromAligner) ||
    !Number.isInteger(range.toAligner) ||
    range.fromAligner < 1 ||
    range.fromAligner > range.toAligner
  ) {
    throw new BadRequestException(
      `Invalid aligner range ${formatRange(range)}: "from" must be at least 1 and not greater than "to".`,
      ALIGNER_DELIVERY_ERROR.RANGE_INVALID,
    );
  }
}

/**
 * The series size a delivery is validated against. The order's stored
 * total wins; a request may only supply one while none exists (first
 * delivery). Supplying a DIFFERENT total later is refused rather than
 * silently applied — corrections go through the dedicated endpoint, so
 * a typo in a delivery form can never rewrite the series.
 */
export function resolveTotal(
  storedTotal: number | null,
  requestedTotal: number | null | undefined,
): number {
  // An explicit null is "no value", exactly like an omitted field.
  if (storedTotal !== null) {
    if (requestedTotal != null && requestedTotal !== storedTotal) {
      throw new BadRequestException(
        `This order's series is already set to ${storedTotal} aligners; correct it with the total endpoint instead.`,
        ALIGNER_DELIVERY_ERROR.TOTAL_ALREADY_SET,
      );
    }
    return storedTotal;
  }
  if (requestedTotal == null) {
    throw new BadRequestException(
      'The total number of aligners is required for the first delivery of an order.',
      ALIGNER_DELIVERY_ERROR.TOTAL_REQUIRED,
    );
  }
  return requestedTotal;
}

export function assertWithinTotal(range: AlignerRange, total: number): void {
  if (range.toAligner > total) {
    throw new BadRequestException(
      `Aligners ${formatRange(range)} exceed the order's series of ${total} aligners.`,
      ALIGNER_DELIVERY_ERROR.RANGE_OUT_OF_BOUNDS,
    );
  }
}

/**
 * The delivery a new range collides with, if any. An identical range is
 * reported as a duplicate (the usual cause: a double submit), anything
 * else sharing at least one aligner as an overlap.
 */
export function findConflict(
  range: AlignerRange,
  existing: readonly PersistedDelivery[],
): { kind: 'duplicate' | 'overlap'; delivery: PersistedDelivery } | null {
  const hit = existing.find(
    (d) => range.fromAligner <= d.toAligner && range.toAligner >= d.fromAligner,
  );
  if (!hit) return null;
  const identical =
    hit.fromAligner === range.fromAligner && hit.toAligner === range.toAligner;
  return { kind: identical ? 'duplicate' : 'overlap', delivery: hit };
}

export function assertNoConflict(
  range: AlignerRange,
  existing: readonly PersistedDelivery[],
): void {
  const conflict = findConflict(range, existing);
  if (!conflict) return;
  const { delivery } = conflict;
  const on = toIsoDate(delivery.deliveredAt);
  if (conflict.kind === 'duplicate') {
    throw new ConflictException(
      `Aligners ${formatRange(range)} were already delivered on ${on}.`,
      ALIGNER_DELIVERY_ERROR.DUPLICATE,
    );
  }
  throw new ConflictException(
    `Aligners ${formatRange(range)} overlap the delivery of ${formatRange(delivery)} on ${on}.`,
    ALIGNER_DELIVERY_ERROR.OVERLAP,
  );
}

/** A corrected series may never drop below an aligner already handed over. */
export function assertTotalCoversDeliveries(
  total: number,
  existing: readonly AlignerRange[],
): void {
  const highest = highestDelivered(existing);
  if (total < highest) {
    throw new BadRequestException(
      `The series cannot be smaller than ${highest}: aligner ${highest} has already been delivered.`,
      ALIGNER_DELIVERY_ERROR.TOTAL_BELOW_DELIVERED,
    );
  }
}

/**
 * A delivery date is a CALENDAR date the clinic types in its local time,
 * while the server clock is UTC. Civil time zones span UTC−12 to UTC+14,
 * so the plausible window is exact rather than a blanket day of slack:
 *   • latest   = the date it already is somewhere on Earth (now + 14 h);
 *   • earliest = the date the order was created, as seen anywhere on
 *                Earth (createdAt − 12 h) — no aligner is handed over
 *                before its order exists, and a typo such as 0226-09-20
 *                cannot slip through.
 */
const HOUR_MS = 60 * 60 * 1000;
const WESTMOST_UTC_OFFSET_HOURS = -12;
const EASTMOST_UTC_OFFSET_HOURS = 14;

function utcCalendarDate(instant: Date): Date {
  return new Date(
    Date.UTC(
      instant.getUTCFullYear(),
      instant.getUTCMonth(),
      instant.getUTCDate(),
    ),
  );
}

/** The latest calendar date that is already "today" somewhere on Earth. */
export function latestDeliveryDate(now: Date): Date {
  return utcCalendarDate(
    new Date(now.getTime() + EASTMOST_UTC_OFFSET_HOURS * HOUR_MS),
  );
}

/** The earliest calendar date a delivery of an order can carry. */
export function earliestDeliveryDate(orderCreatedAt: Date): Date {
  return utcCalendarDate(
    new Date(orderCreatedAt.getTime() + WESTMOST_UTC_OFFSET_HOURS * HOUR_MS),
  );
}

/**
 * Parse a delivery calendar date ('YYYY-MM-DD') to UTC midnight; an
 * omitted (or null) date means today. Rejects impossible dates and dates
 * that are not yet "today" anywhere on Earth.
 */
export function parseDeliveryDate(
  isoDate: string | null | undefined,
  now: Date,
): Date {
  if (isoDate == null) return utcCalendarDate(now);

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  const parsed = match
    ? new Date(
        Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
      )
    : null;
  // The round trip rejects impossible calendar dates (2026-02-30 would
  // otherwise silently roll over to March 2nd).
  if (!parsed || toIsoDate(parsed) !== isoDate) {
    throw new BadRequestException(
      `"${isoDate}" is not a valid calendar date (expected YYYY-MM-DD).`,
      ALIGNER_DELIVERY_ERROR.DATE_INVALID,
    );
  }
  if (parsed.getTime() > latestDeliveryDate(now).getTime()) {
    throw new BadRequestException(
      `A delivery cannot be dated in the future (${isoDate}).`,
      ALIGNER_DELIVERY_ERROR.DATE_IN_FUTURE,
    );
  }
  return parsed;
}

export function assertNotBeforeOrder(
  deliveredAt: Date,
  orderCreatedAt: Date,
): void {
  const earliest = earliestDeliveryDate(orderCreatedAt);
  if (deliveredAt.getTime() < earliest.getTime()) {
    throw new BadRequestException(
      `A delivery cannot be dated before its order was created (${toIsoDate(earliest)}).`,
      ALIGNER_DELIVERY_ERROR.DATE_BEFORE_ORDER,
    );
  }
}
