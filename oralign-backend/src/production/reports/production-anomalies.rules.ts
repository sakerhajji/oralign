import {
  OrderStatus,
  ProductionArch,
  ProductionEventType,
  ProductionNoticeStatus,
} from '@prisma/client';
import {
  NOTICE_MAX_ATTEMPTS,
  PREVIOUS_ACT,
  PRODUCTION_ARCHES,
} from '../production.constants';
import {
  PRODUCTION_ANOMALY,
  PRODUCTION_WARNING,
  type ActCounters,
  type ArchPair,
  type PlannedTotals,
  type ProductionAnomaly,
  type ProductionAnomalyKind,
  type ProductionWarningCode,
} from '../production.contract';
import {
  isDeliveryComplete,
  mergeStepRanges,
  uncoveredStepRanges,
  type StepRange,
} from '../kernel';
import { batchCoverageNeeds } from '../batch-coverage';
import { RETRYABLE_SKIP_REASONS } from './production-notices.view';
import { isInRange, type InstantRange } from './report-period';
import { compareText, warningCodesOf } from './report-views';

/**
 * "Écarts" (CONTRACT §2.3): every anomaly is computed at read time from
 * three loads (the period's rows, the cases they touch, the notices) by
 * the pure functions below, never stored. legacy_batch rows never produce
 * one: the service loads `declared` rows only, and the order-level kinds
 * only look at cases that have declared rows.
 *
 * Archived (soft-deleted) cases are left out by the service: nothing on
 * them is actionable until they are restored.
 */

/** A `declared` row with performedAt in the period, live or cancelled. */
export interface AnomalyPeriodEvent {
  id: string;
  orderId: string;
  orderCode: string;
  patientName: string;
  type: ProductionEventType;
  arch: ProductionArch;
  stepFrom: number;
  stepTo: number;
  performedAt: Date;
  warnings: readonly string[];
  cancelledAt: Date | null;
}

/** A live row of a touched case, any origin (legacy deliveries do cover steps). */
export interface AnomalyLiveEvent {
  id: string;
  type: ProductionEventType;
  arch: ProductionArch;
  stepFrom: number;
  stepTo: number;
  performedAt: Date;
}

/** A case touched by the period, with its CURRENT state. */
export interface AnomalyOrder {
  orderId: string;
  orderCode: string;
  patientName: string;
  status: OrderStatus;
  coverageStartedAt: Date | null;
  planned: PlannedTotals;
  treatedArches: readonly ProductionArch[];
  counters: ArchPair<ActCounters>;
  lastActionAt: Date | null;
  /** Every non-cancelled event of the case. */
  liveEvents: readonly AnomalyLiveEvent[];
  /** Batches of the live quotation that are `delivered` AND `deliveredByProduction`. */
  productionBatches: readonly { fromStep: number; toStep: number }[];
  /** Earliest AlignerDelivery.deliveredAt (a calendar date at 00:00 UTC), or null. */
  firstAlignerDeliveryAt: Date | null;
}

/** A notice that ended without reaching the practitioner. */
export interface AnomalyNotice {
  id: string;
  orderId: string;
  orderCode: string;
  patientName: string;
  eventIds: readonly string[];
  status: ProductionNoticeStatus;
  attempts: number;
  skipReason: string | null;
  lastError: string | null;
  updatedAt: Date;
}

export interface AnomalyInput {
  range: InstantRange;
  events: readonly AnomalyPeriodEvent[];
  orders: readonly AnomalyOrder[];
  notices: readonly AnomalyNotice[];
}

const KIND_ORDER: readonly ProductionAnomalyKind[] =
  Object.values(PRODUCTION_ANOMALY);
const ARCH_RANK: Record<ProductionArch, number> = { upper: 0, lower: 1 };

type CaseFields = Pick<
  ProductionAnomaly,
  'orderId' | 'orderCode' | 'patientName'
>;

function caseOf(row: {
  orderId: string;
  orderCode: string;
  patientName: string;
}): CaseFields {
  return {
    orderId: row.orderId,
    orderCode: row.orderCode,
    patientName: row.patientName,
  };
}

function rangeOf(row: { stepFrom: number; stepTo: number }): StepRange {
  return { from: row.stepFrom, to: row.stepTo };
}

function latest(instants: readonly Date[]): Date {
  return new Date(Math.max(...instants.map((instant) => instant.getTime())));
}

function sortedIds(rows: readonly { id: string }[]): string[] {
  return rows.map((row) => row.id).sort(compareText);
}

/** Live ranges of one act on one arch. */
function liveRanges(
  events: readonly AnomalyLiveEvent[],
  type: ProductionEventType,
  arch: ProductionArch,
): StepRange[] {
  return events
    .filter((event) => event.type === type && event.arch === arch)
    .map(rangeOf);
}

// ── Row-level kinds ────────────────────────────────────────────────────

/**
 * The confirmed warnings of the LIVE rows: a cancelled row is reported as
 * cancelled_event only (it no longer duplicates nor skips anything).
 *   • already_declared → duplicate_declaration;
 *   • steps_not_released on a delivery → unreleased_delivery;
 *   • every other code (steps_not_released on another act included) →
 *     one confirmed_warning listing them.
 * One finding per row, i.e. per arch.
 */
export function warningAnomalies(
  events: readonly AnomalyPeriodEvent[],
): ProductionAnomaly[] {
  const items: ProductionAnomaly[] = [];
  for (const event of events) {
    if (event.cancelledAt) continue;
    const codes = warningCodesOf(event.warnings);
    if (codes.length === 0) continue;
    const base = {
      ...caseOf(event),
      arch: event.arch,
      steps: [rangeOf(event)],
      eventIds: [event.id],
      noticeId: null,
      at: event.performedAt.toISOString(),
      detail: event.type,
    };
    const isDelivery = event.type === ProductionEventType.aligner_delivered;
    const rest: ProductionWarningCode[] = [];
    for (const code of codes) {
      if (code === PRODUCTION_WARNING.already_declared) {
        items.push({
          ...base,
          kind: PRODUCTION_ANOMALY.duplicate_declaration,
          warnings: [code],
        });
      } else if (code === PRODUCTION_WARNING.steps_not_released && isDelivery) {
        items.push({
          ...base,
          kind: PRODUCTION_ANOMALY.unreleased_delivery,
          warnings: [code],
        });
      } else {
        rest.push(code);
      }
    }
    if (rest.length > 0) {
      items.push({
        ...base,
        kind: PRODUCTION_ANOMALY.confirmed_warning,
        warnings: rest,
      });
    }
  }
  return items;
}

/** Every cancelled row of the period, dated by its cancel. */
export function cancelledEventAnomalies(
  events: readonly AnomalyPeriodEvent[],
): ProductionAnomaly[] {
  return events
    .filter((event) => event.cancelledAt !== null)
    .map((event) => ({
      kind: PRODUCTION_ANOMALY.cancelled_event,
      ...caseOf(event),
      arch: event.arch,
      steps: [rangeOf(event)],
      eventIds: [event.id],
      noticeId: null,
      warnings: warningCodesOf(event.warnings),
      at: (event.cancelledAt ?? event.performedAt).toISOString(),
      detail: event.type,
    }));
}

/**
 * The period's live rows of an act that has a previous act, against the
 * CURRENT coverage of that previous act on the same arch (all of the
 * case's live rows, whenever they were performed): a later declaration of
 * the missing stage clears the finding. One finding per case × arch × act;
 * `steps` = the merged gaps, `eventIds` = the rows that have one, `at` =
 * their latest performedAt, `detail` = the later act (its previous act is
 * PREVIOUS_ACT[detail]).
 */
export function stageSkippedAnomalies(
  events: readonly AnomalyPeriodEvent[],
  ordersById: ReadonlyMap<string, AnomalyOrder>,
): ProductionAnomaly[] {
  const groups = new Map<string, AnomalyPeriodEvent[]>();
  for (const event of events) {
    if (event.cancelledAt || PREVIOUS_ACT[event.type] === null) continue;
    const key = `${event.orderId}|${event.arch}|${event.type}`;
    const group = groups.get(key);
    if (group) group.push(event);
    else groups.set(key, [event]);
  }

  const items: ProductionAnomaly[] = [];
  for (const group of groups.values()) {
    const [first] = group;
    const order = ordersById.get(first.orderId);
    const previous = PREVIOUS_ACT[first.type];
    if (!order || previous === null) continue;
    const covered = liveRanges(order.liveEvents, previous, first.arch);
    const gaps: StepRange[] = [];
    const skipping: AnomalyPeriodEvent[] = [];
    for (const event of group) {
      const missing = uncoveredStepRanges(rangeOf(event), covered);
      if (missing.length === 0) continue;
      gaps.push(...missing);
      skipping.push(event);
    }
    if (skipping.length === 0) continue;
    items.push({
      kind: PRODUCTION_ANOMALY.stage_skipped,
      ...caseOf(order),
      arch: first.arch,
      steps: mergeStepRanges(gaps),
      eventIds: sortedIds(skipping),
      noticeId: null,
      warnings: [],
      at: latest(skipping.map((event) => event.performedAt)).toISOString(),
      detail: first.type,
    });
  }
  return items;
}

// ── Notices ────────────────────────────────────────────────────────────

/**
 * Notices that will not reach the practitioner without a person: failed
 * for good (NOTICE_MAX_ATTEMPTS; below that the dispatcher still retries),
 * or skipped for a reason a person can fix (the retryable ones: not a
 * cancelled delivery, nor a correction whose original never went out).
 */
export function noticeAnomalies(
  notices: readonly AnomalyNotice[],
): ProductionAnomaly[] {
  const items: ProductionAnomaly[] = [];
  for (const notice of notices) {
    const failed =
      notice.status === ProductionNoticeStatus.failed &&
      notice.attempts >= NOTICE_MAX_ATTEMPTS;
    const skipped =
      notice.status === ProductionNoticeStatus.skipped &&
      notice.skipReason !== null &&
      RETRYABLE_SKIP_REASONS.includes(notice.skipReason);
    if (!failed && !skipped) continue;
    items.push({
      kind: failed
        ? PRODUCTION_ANOMALY.notice_failed
        : PRODUCTION_ANOMALY.notice_skipped,
      ...caseOf(notice),
      arch: null,
      steps: null,
      eventIds: [...notice.eventIds].sort(compareText),
      noticeId: notice.id,
      warnings: [],
      at: notice.updatedAt.toISOString(),
      detail: failed ? notice.lastError : notice.skipReason,
    });
  }
  return items;
}

// ── Case-level kinds ───────────────────────────────────────────────────

/**
 * Cases whose last action falls in the period:
 *   • finished_incomplete: the case is `finished` while !isDeliveryComplete
 *     (count-based, like every list); one finding per treated arch that is
 *     short (or has no known total), `steps` = its undelivered steps up to
 *     the total (null when the total is unknown);
 *   • planned_total_unknown: one finding per treated arch without a total.
 */
export function caseStateAnomalies(
  orders: readonly AnomalyOrder[],
  range: InstantRange,
): ProductionAnomaly[] {
  const items: ProductionAnomaly[] = [];
  for (const order of orders) {
    if (!order.lastActionAt || !isInRange(order.lastActionAt, range)) continue;
    const at = order.lastActionAt.toISOString();
    const base = {
      ...caseOf(order),
      eventIds: [],
      noticeId: null,
      warnings: [],
      at,
      detail: null,
    };
    const finishedShort =
      order.status === OrderStatus.finished &&
      !isDeliveryComplete(order.planned, order.counters);
    for (const arch of PRODUCTION_ARCHES) {
      const planned = order.planned[arch];
      if (planned === null) continue;
      const total = planned.total;
      if (
        finishedShort &&
        (total === null || order.counters[arch].delivered < total)
      ) {
        items.push({
          ...base,
          kind: PRODUCTION_ANOMALY.finished_incomplete,
          arch,
          steps:
            total === null
              ? null
              : uncoveredStepRanges(
                  { from: 1, to: total },
                  liveRanges(
                    order.liveEvents,
                    ProductionEventType.aligner_delivered,
                    arch,
                  ),
                ),
        });
      }
      if (total === null) {
        items.push({
          ...base,
          kind: PRODUCTION_ANOMALY.planned_total_unknown,
          arch,
          steps: null,
        });
      }
    }
  }
  return items;
}

/** The period's cancelled delivery rows, per case. */
function cancelledDeliveriesByOrder(
  events: readonly AnomalyPeriodEvent[],
): Map<string, AnomalyPeriodEvent[]> {
  const byOrder = new Map<string, AnomalyPeriodEvent[]>();
  for (const event of events) {
    if (
      !event.cancelledAt ||
      event.type !== ProductionEventType.aligner_delivered
    ) {
      continue;
    }
    const list = byOrder.get(event.orderId);
    if (list) list.push(event);
    else byOrder.set(event.orderId, [event]);
  }
  return byOrder;
}

function latestCancel(rows: readonly AnomalyPeriodEvent[]): string {
  return latest(
    rows.map((row) => row.cancelledAt ?? row.performedAt),
  ).toISOString();
}

/**
 * The coverage window (first-write-wins, never moved) started on a
 * delivery of the period that was later cancelled: a cancelled delivery
 * row performed at or before coverageStartedAt, while no live delivery
 * row (any origin) nor AlignerDelivery is at or before it. `detail` =
 * coverageStartedAt; `arch` set when the rows share one.
 */
export function coverageAnomalies(
  events: readonly AnomalyPeriodEvent[],
  ordersById: ReadonlyMap<string, AnomalyOrder>,
): ProductionAnomaly[] {
  const items: ProductionAnomaly[] = [];
  for (const [orderId, cancelled] of cancelledDeliveriesByOrder(events)) {
    const order = ordersById.get(orderId);
    const start = order?.coverageStartedAt;
    if (!order || !start) continue;
    const startMs = start.getTime();
    const starters = cancelled.filter(
      (row) => row.performedAt.getTime() <= startMs,
    );
    if (starters.length === 0) continue;
    const justified =
      order.liveEvents.some(
        (event) =>
          event.type === ProductionEventType.aligner_delivered &&
          event.performedAt.getTime() <= startMs,
      ) ||
      (order.firstAlignerDeliveryAt !== null &&
        order.firstAlignerDeliveryAt.getTime() <= startMs);
    if (justified) continue;
    const arches = new Set(starters.map((row) => row.arch));
    items.push({
      kind: PRODUCTION_ANOMALY.coverage_started_by_cancelled_delivery,
      ...caseOf(order),
      arch: arches.size === 1 ? starters[0].arch : null,
      steps: mergeStepRanges(starters.map(rangeOf)),
      eventIds: sortedIds(starters),
      noticeId: null,
      warnings: [],
      at: latestCancel(starters),
      detail: start.toISOString(),
    });
  }
  return items;
}

/**
 * A batch the module delivered (`deliveredByProduction`) on a `finished`
 * case keeps its `delivered` status after a cancel (the revert skips
 * finished cases, CONTRACT §3.4), although live deliveries no longer cover
 * it on a treated arch. "Cover" is the projection's own notion
 * (batchCoverageNeeds): per arch, the batch range up to that arch's
 * approved total, so the finding is exactly a revert the finish prevented.
 * Reported in the period of the cancelled delivery that uncovered it (a
 * cancelled row of the period overlapping the needed steps on that arch),
 * one finding per batch × arch: `steps` = the uncovered steps, `detail` =
 * the batch range "from-to". A batch needing no step (wholly beyond the
 * approved totals) is uncovered once no live delivery is left: one finding
 * with no arch and no steps, caused by the period's cancelled deliveries.
 */
export function batchKeptAnomalies(
  events: readonly AnomalyPeriodEvent[],
  ordersById: ReadonlyMap<string, AnomalyOrder>,
): ProductionAnomaly[] {
  const items: ProductionAnomaly[] = [];
  for (const [orderId, cancelled] of cancelledDeliveriesByOrder(events)) {
    const order = ordersById.get(orderId);
    if (!order || order.status !== OrderStatus.finished) continue;
    const anyLiveDelivery = order.liveEvents.some(
      (event) => event.type === ProductionEventType.aligner_delivered,
    );
    for (const batch of order.productionBatches) {
      const needs = batchCoverageNeeds(
        batch,
        order.treatedArches,
        order.planned,
      );
      if (needs.length === 0) {
        if (anyLiveDelivery) continue;
        items.push({
          kind: PRODUCTION_ANOMALY.batch_kept_after_cancel,
          ...caseOf(order),
          arch: null,
          steps: null,
          eventIds: sortedIds(cancelled),
          noticeId: null,
          warnings: [],
          at: latestCancel(cancelled),
          detail: `${batch.fromStep}-${batch.toStep}`,
        });
        continue;
      }
      for (const { arch, fromStep, toStep } of needs) {
        const gaps = uncoveredStepRanges(
          { from: fromStep, to: toStep },
          liveRanges(
            order.liveEvents,
            ProductionEventType.aligner_delivered,
            arch,
          ),
        );
        if (gaps.length === 0) continue;
        const causes = cancelled.filter(
          (row) =>
            row.arch === arch &&
            row.stepFrom <= toStep &&
            row.stepTo >= fromStep,
        );
        if (causes.length === 0) continue;
        items.push({
          kind: PRODUCTION_ANOMALY.batch_kept_after_cancel,
          ...caseOf(order),
          arch,
          steps: gaps,
          eventIds: sortedIds(causes),
          noticeId: null,
          warnings: [],
          at: latestCancel(causes),
          detail: `${batch.fromStep}-${batch.toStep}`,
        });
      }
    }
  }
  return items;
}

// ── Ordering and counts ────────────────────────────────────────────────

function archRank(arch: ProductionArch | null): number {
  return arch === null ? 2 : ARCH_RANK[arch];
}

function firstRef(item: ProductionAnomaly): string {
  return item.eventIds[0] ?? item.noticeId ?? '';
}

/**
 * `at` desc, then the kind (PRODUCTION_ANOMALY order), orderCode, arch
 * (upper, lower, none), the first event / notice id, then the steps and
 * the detail, so two refetches never swap two rows.
 */
export function compareAnomalies(
  a: ProductionAnomaly,
  b: ProductionAnomaly,
): number {
  return (
    compareText(b.at, a.at) ||
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
    compareText(a.orderCode, b.orderCode) ||
    archRank(a.arch) - archRank(b.arch) ||
    compareText(firstRef(a), firstRef(b)) ||
    (a.steps?.[0]?.from ?? 0) - (b.steps?.[0]?.from ?? 0) ||
    compareText(a.detail ?? '', b.detail ?? '')
  );
}

/** Every kind, zeros included, so the tabs never miss a key. */
export function countAnomaliesByKind(
  items: readonly ProductionAnomaly[],
): Record<ProductionAnomalyKind, number> {
  const counts = Object.fromEntries(
    KIND_ORDER.map((kind) => [kind, 0]),
  ) as Record<ProductionAnomalyKind, number>;
  for (const item of items) counts[item.kind] += 1;
  return counts;
}

/** All the kinds, sorted and counted. */
export function detectAnomalies(input: AnomalyInput): {
  items: ProductionAnomaly[];
  countsByKind: Record<ProductionAnomalyKind, number>;
} {
  const ordersById = new Map(
    input.orders.map((order) => [order.orderId, order] as const),
  );
  const items = [
    ...stageSkippedAnomalies(input.events, ordersById),
    ...warningAnomalies(input.events),
    ...cancelledEventAnomalies(input.events),
    ...noticeAnomalies(input.notices),
    ...caseStateAnomalies(input.orders, input.range),
    ...coverageAnomalies(input.events, ordersById),
    ...batchKeptAnomalies(input.events, ordersById),
  ].sort(compareAnomalies);
  return { items, countsByKind: countAnomaliesByKind(items) };
}
