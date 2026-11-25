import {
  BatchStatus,
  DeliveryRecipient,
  OrderStatus,
  ProductionArch,
  ProductionEventType,
  QuotationPaymentStatus,
} from '@prisma/client';
import { isAdmin, type Caller } from '../common/access/caller';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '../common/exceptions/app.exception';
import {
  businessInstant,
  businessToday,
  shiftCalendarDay,
} from '../common/time/business-day';
import {
  FUTURE_SKEW_MS,
  MIN_PRODUCTION_STEP,
  PREVIOUS_ACT,
  PRODUCTION_STATUSES,
  TECHNICIAN_BACKDATE_DAYS,
  TECHNICIAN_CANCEL_WINDOW_MS,
} from './production.constants';
import {
  PRODUCTION_ERROR,
  PRODUCTION_WARNING,
  type PlannedTotals,
  type ProductionArchChoice,
  type ProductionDeclareWindow,
  type ProductionWarningCode,
} from './production.contract';
import {
  coveredStepRanges,
  mergeStepRanges,
  RELEASED_BATCH_STATUSES,
  uncoveredStepRanges,
  type StepRange,
} from './kernel';

/**
 * The business rules of a production declaration and its cancel
 * (CONTRACT.md §3.1-§3.3). Pure: the service loads the state under the
 * order lock and asks these functions; nothing here touches Prisma, so
 * every rule is unit-tested on its own (production.rules.spec.ts).
 *
 * "Restricted" = the technician's rules. Everything an admin may do more
 * is keyed on isAdmin(), so any other role that ever reaches these
 * functions gets the narrower rule, never the wider one.
 */

/** Warning codes in their canonical order (the 409 body and the stored rows use it). */
const WARNING_ORDER: readonly ProductionWarningCode[] =
  Object.values(PRODUCTION_WARNING);

/** Warnings the legacy "Marquer livré" button confirms on the admin's behalf (§3.4). */
export const LEGACY_DELIVERY_AUTO_CONFIRM: readonly ProductionWarningCode[] = [
  PRODUCTION_WARNING.previous_stage_missing,
  PRODUCTION_WARNING.beyond_planned_total,
  PRODUCTION_WARNING.quantity_differs,
  PRODUCTION_WARNING.arch_not_treated,
];

/** Every step there is: the release state of a case without step batches. */
const ALL_STEPS: StepRange = { from: 0, to: Number.MAX_SAFE_INTEGER };

/** The admin rules apply only to admins; everyone else gets the technician's. */
export function isRestricted(caller: Pick<Caller, 'role'>): boolean {
  return !isAdmin(caller);
}

/** The rows a form's arch choice writes, upper first. */
export function archesOf(choice: ProductionArchChoice): ProductionArch[] {
  return choice === 'both'
    ? [ProductionArch.upper, ProductionArch.lower]
    : [choice];
}

/** Steps of the range, both ends included: the default quantity. */
export function stepCount(range: StepRange): number {
  return range.to - range.from + 1;
}

/** `quantity` as stored: the one sent, or one per step. */
export function resolvedQuantity(
  range: StepRange,
  sent?: number | null,
): number {
  return sent ?? stepCount(range);
}

/** 400 INVALID_STEP_RANGE (the DTO already bounds each end to 1..200). */
export function assertStepRange(range: StepRange): void {
  if (range.from < MIN_PRODUCTION_STEP || range.from > range.to) {
    throw new BadRequestException(
      `Steps ${range.from} to ${range.to} do not form a valid range.`,
      PRODUCTION_ERROR.INVALID_STEP_RANGE,
    );
  }
}

/**
 * When the act happened, as the request names it: the Tunis wall clock
 * `day` + `time`, or null when neither is sent (the server time is then
 * used, never a tablet's clock). One without the other is a 400
 * INVALID_DATE / INVALID_TIME, as a malformed value is.
 */
export function requestedPerformedAt(
  day: string | undefined,
  time: string | undefined,
): Date | null {
  if (day === undefined && time === undefined) return null;
  return businessInstant(day ?? '', time ?? '');
}

/**
 * 400 PERFORMED_AT_OUT_OF_RANGE: later than now + the skew; before the
 * order existed (everyone); for the technician, before the backdating
 * floor on the Tunis calendar (today - 7).
 */
export function assertPerformedAtInRange(input: {
  performedAt: Date;
  now: Date;
  orderCreatedAt: Date;
  restricted: boolean;
}): void {
  const { performedAt, now, orderCreatedAt, restricted } = input;
  const tooLate = performedAt.getTime() > now.getTime() + FUTURE_SKEW_MS;
  const beforeOrder = performedAt.getTime() < orderCreatedAt.getTime();
  const beforeFloor =
    restricted &&
    businessToday(performedAt) <
      shiftCalendarDay(businessToday(now), -TECHNICIAN_BACKDATE_DAYS);
  if (tooLate || beforeOrder || beforeFloor) {
    throw new BadRequestException(
      'The date and time of the act are outside what may be declared.',
      PRODUCTION_ERROR.PERFORMED_AT_OUT_OF_RANGE,
    );
  }
}

/** The Tunis days the caller's date picker offers (the server re-checks the instant). */
export function declareWindowOf(input: {
  now: Date;
  orderCreatedAt: Date;
  restricted: boolean;
}): ProductionDeclareWindow {
  const today = businessToday(input.now);
  const orderDay = businessToday(input.orderCreatedAt);
  if (!input.restricted) return { earliestDay: orderDay, latestDay: today };
  const floor = shiftCalendarDay(today, -TECHNICIAN_BACKDATE_DAYS);
  return {
    earliestDay: floor > orderDay ? floor : orderDay,
    latestDay: today,
  };
}

/** A batch of the live quotation as the release rule reads it. */
export interface ReleaseBatch {
  fromStep: number;
  toStep: number;
  status: BatchStatus;
}

/**
 * The steps released to the workshop (§3.1.5):
 *   • with batches on the live quotation: the union of the unlocked and
 *     delivered ranges (a step outside every batch is not released);
 *   • on an unlimited-step pack, whose batches are payment placeholders
 *     ([1,1], [2,2]… from the plan editor), not aligner ranges: every
 *     step once one batch is unlocked or delivered, or the order is in a
 *     production status; none otherwise (CONC-01);
 *   • without batches: every step when the quote is paid or the order is
 *     in a production status, none otherwise.
 * `quotation` is the LIVE quotation (null when none or deleted).
 */
export function releasedSteps(input: {
  status: OrderStatus;
  quotation: {
    paymentStatus: QuotationPaymentStatus;
    isUnlimitedSteps: boolean;
    batches: readonly ReleaseBatch[];
  } | null;
}): StepRange[] {
  const batches = input.quotation?.batches ?? [];
  if (batches.length > 0 && input.quotation?.isUnlimitedSteps) {
    const paidSome = batches.some((batch) =>
      RELEASED_BATCH_STATUSES.includes(batch.status),
    );
    return paidSome || PRODUCTION_STATUSES.includes(input.status)
      ? [ALL_STEPS]
      : [];
  }
  if (batches.length > 0) {
    return mergeStepRanges(
      batches
        .filter((batch) => RELEASED_BATCH_STATUSES.includes(batch.status))
        .map((batch) => ({ from: batch.fromStep, to: batch.toStep })),
    );
  }
  const everything =
    input.quotation?.paymentStatus === QuotationPaymentStatus.paid ||
    PRODUCTION_STATUSES.includes(input.status);
  return everything ? [ALL_STEPS] : [];
}

/** Every step of `range` is released. */
export function isRangeReleased(
  range: StepRange,
  released: readonly StepRange[],
): boolean {
  return uncoveredStepRanges(range, released).length === 0;
}

/** The fields of an event the range rules read. */
export interface RangeEvent {
  type: ProductionEventType;
  arch: ProductionArch;
  stepFrom: number;
  stepTo: number;
  cancelledAt: Date | null;
}

/** The ranges the non-cancelled events of one act cover on one arch. */
export function liveRanges(
  events: readonly RangeEvent[],
  type: ProductionEventType,
  arch: ProductionArch,
): StepRange[] {
  return events
    .filter(
      (event) =>
        event.cancelledAt === null &&
        event.type === type &&
        event.arch === arch,
    )
    .map((event) => ({ from: event.stepFrom, to: event.stepTo }));
}

/** What the per-row rules of one arch of a declaration read (all loaded under the lock). */
export interface RowRuleInput {
  type: ProductionEventType;
  arch: ProductionArch;
  range: StepRange;
  /** The quantity the request sent; null when it relied on the default. */
  quantitySent: number | null;
  restricted: boolean;
  treatedArches: readonly ProductionArch[];
  planned: PlannedTotals;
  /** The order's events BEFORE this declaration, cancelled included. */
  events: readonly RangeEvent[];
  released: readonly StepRange[];
}

/**
 * The technician's hard gates (§3.1.4): a step above the APPROVED plan's
 * total is a 400; a delivery of steps that are not all released is a 409
 * with a neutral message (no amount, no payment wording, D1).
 */
export function assertTechnicianGates(input: RowRuleInput): void {
  if (!input.restricted) return;
  const planned = input.planned[input.arch];
  if (
    planned?.source === 'approved_plan' &&
    planned.total !== null &&
    input.range.to > planned.total
  ) {
    throw new BadRequestException(
      `Step ${input.range.to} is above the planned total of this arch (${planned.total}).`,
      PRODUCTION_ERROR.STEP_BEYOND_PLANNED_TOTAL,
    );
  }
  if (
    input.type === ProductionEventType.aligner_delivered &&
    !isRangeReleased(input.range, input.released)
  ) {
    throw new ConflictException(
      'Some of these steps are not released for delivery yet. Please see an administrator.',
      PRODUCTION_ERROR.STEPS_NOT_RELEASED,
    );
  }
}

/** The warnings of one row, in PRODUCTION_WARNING order (§3.1.5). */
export function rowWarnings(input: RowRuleInput): ProductionWarningCode[] {
  const found = new Set<ProductionWarningCode>();
  const previous = PREVIOUS_ACT[input.type];
  if (
    previous &&
    uncoveredStepRanges(
      input.range,
      liveRanges(input.events, previous, input.arch),
    ).length > 0
  ) {
    found.add(PRODUCTION_WARNING.previous_stage_missing);
  }
  if (
    coveredStepRanges(
      input.range,
      liveRanges(input.events, input.type, input.arch),
    ).length > 0
  ) {
    found.add(PRODUCTION_WARNING.already_declared);
  }
  if (
    input.quantitySent !== null &&
    input.quantitySent !== stepCount(input.range)
  ) {
    found.add(PRODUCTION_WARNING.quantity_differs);
  }
  const total = input.planned[input.arch]?.total;
  if (total != null && input.range.to > total) {
    found.add(PRODUCTION_WARNING.beyond_planned_total);
  }
  if (!input.treatedArches.includes(input.arch)) {
    found.add(PRODUCTION_WARNING.arch_not_treated);
  }
  const isDelivery = input.type === ProductionEventType.aligner_delivered;
  if (
    !isRangeReleased(input.range, input.released) &&
    (!isDelivery || !input.restricted)
  ) {
    found.add(PRODUCTION_WARNING.steps_not_released);
  }
  return sortWarnings(found);
}

/** Distinct codes, in PRODUCTION_WARNING order. */
export function sortWarnings(
  codes: Iterable<ProductionWarningCode>,
): ProductionWarningCode[] {
  const set = new Set(codes);
  return WARNING_ORDER.filter((code) => set.has(code));
}

/**
 * §3.1.6: every warning that applies must be confirmed (409
 * PRODUCTION_CONFIRM_REQUIRED, body `warnings` = the union), and a
 * confirmed warning needs a note (400 NOTE_REQUIRED).
 */
export function assertWarningsConfirmed(input: {
  warnings: readonly ProductionWarningCode[];
  confirmed: readonly ProductionWarningCode[];
  note: string | null;
}): void {
  const unconfirmed = input.warnings.filter(
    (code) => !input.confirmed.includes(code),
  );
  if (unconfirmed.length > 0) {
    throw new ConflictException(
      'This declaration needs a confirmation.',
      PRODUCTION_ERROR.PRODUCTION_CONFIRM_REQUIRED,
      { warnings: sortWarnings(input.warnings) },
    );
  }
  if (input.warnings.length > 0 && !input.note) {
    throw new BadRequestException(
      'A note is required to confirm these warnings.',
      PRODUCTION_ERROR.NOTE_REQUIRED,
    );
  }
}

// ── Idempotency fingerprint (§3.2) ─────────────────────────────────────

/** The identity of a declaration as stored on its rows. */
export interface DeclarationFingerprint {
  orderId: string;
  type: ProductionEventType;
  /** Upper first. */
  arches: readonly ProductionArch[];
  stepFrom: number;
  stepTo: number;
  quantity: number;
  deliveredTo: DeliveryRecipient | null;
  deliveredToName: string | null;
  /** Only when the request named the instant: a retry cannot reproduce the server time. */
  performedAt: Date | null;
}

/** The stored columns a fingerprint is compared with. */
export interface FingerprintRow {
  orderId: string;
  type: ProductionEventType;
  arch: ProductionArch;
  stepFrom: number;
  stepTo: number;
  quantity: number;
  deliveredTo: DeliveryRecipient | null;
  deliveredToName: string | null;
  performedAt: Date;
}

/**
 * The fingerprint of a request. `note` and the confirmed warnings are not
 * part of it: a 409 PRODUCTION_CONFIRM_REQUIRED writes nothing, so the
 * confirmed retry with the same key never meets rows of its own.
 */
export function declarationFingerprint(input: {
  orderId: string;
  type: ProductionEventType;
  arches: readonly ProductionArch[];
  range: StepRange;
  quantity?: number | null;
  deliveredTo?: DeliveryRecipient | null;
  deliveredToName?: string | null;
  performedAt: Date | null;
}): DeclarationFingerprint {
  const isDelivery = input.type === ProductionEventType.aligner_delivered;
  const name = input.deliveredToName?.trim();
  return {
    orderId: input.orderId,
    type: input.type,
    arches: [...new Set(input.arches)].sort(compareArches),
    stepFrom: input.range.from,
    stepTo: input.range.to,
    quantity: resolvedQuantity(input.range, input.quantity),
    deliveredTo: isDelivery ? (input.deliveredTo ?? null) : null,
    deliveredToName: isDelivery && name ? name : null,
    performedAt: input.performedAt,
  };
}

/** The rows (one per arch) are exactly the declaration the fingerprint names. */
export function matchesFingerprint(
  fingerprint: DeclarationFingerprint,
  rows: readonly FingerprintRow[],
): boolean {
  const arches = rows.map((row) => row.arch).sort(compareArches);
  if (
    arches.length !== fingerprint.arches.length ||
    arches.some((arch, index) => arch !== fingerprint.arches[index])
  ) {
    return false;
  }
  return rows.every(
    (row) =>
      row.orderId === fingerprint.orderId &&
      row.type === fingerprint.type &&
      row.stepFrom === fingerprint.stepFrom &&
      row.stepTo === fingerprint.stepTo &&
      row.quantity === fingerprint.quantity &&
      row.deliveredTo === fingerprint.deliveredTo &&
      (row.deliveredToName ?? null) === fingerprint.deliveredToName &&
      (fingerprint.performedAt === null ||
        row.performedAt.getTime() === fingerprint.performedAt.getTime()),
  );
}

/** Upper before lower: the enum order, the order of the rows of a declaration. */
export function compareArches(a: ProductionArch, b: ProductionArch): number {
  const rank = (arch: ProductionArch) =>
    arch === ProductionArch.upper ? 0 : 1;
  return rank(a) - rank(b);
}

// ── Cancel (§3.3) ──────────────────────────────────────────────────────

/** The fields of an event the cancel rules read. */
export interface CancellableEvent {
  createdById: string | null;
  createdAt: Date;
  cancelledAt: Date | null;
}

function withinCancelWindow(event: CancellableEvent, now: Date): boolean {
  return (
    now.getTime() - event.createdAt.getTime() < TECHNICIAN_CANCEL_WINDOW_MS
  );
}

/**
 * Whether the caller may cancel the row now: never a cancelled row; an
 * admin any live row (legacy_batch included); anyone else only her own,
 * while it is less than 24 h old (from createdAt, not performedAt, so a
 * backdated entry can still be fixed).
 */
export function canCancel(
  event: CancellableEvent,
  caller: Caller,
  now: Date,
): boolean {
  if (event.cancelledAt) return false;
  if (isAdmin(caller)) return true;
  return event.createdById === caller.userId && withinCancelWindow(event, now);
}

/** 403 CANCEL_NOT_OWN_EVENT: the technician cancels her own rows only. */
export function assertOwnEvent(event: CancellableEvent, caller: Caller): void {
  if (isAdmin(caller) || event.createdById === caller.userId) return;
  throw new ForbiddenException(
    'You can only cancel your own entries.',
    PRODUCTION_ERROR.CANCEL_NOT_OWN_EVENT,
  );
}

/** 403 CANCEL_WINDOW_PASSED: a technician's row older than 24 h. */
export function assertCancelWindow(
  event: CancellableEvent,
  caller: Caller,
  now: Date,
): void {
  if (isAdmin(caller) || withinCancelWindow(event, now)) return;
  throw new ForbiddenException(
    'This entry is more than 24 hours old: ask an administrator to cancel it.',
    PRODUCTION_ERROR.CANCEL_WINDOW_PASSED,
  );
}
