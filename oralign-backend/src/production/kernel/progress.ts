import {
  Prisma,
  ProductionArch,
  ProductionEventType,
  type ProductionProgress,
} from '@prisma/client';
import type {
  ActCounters,
  ArchPair,
  PlannedTotals,
} from '../production.contract';
import { ACT_COUNTER_KEY, PRODUCTION_ACTS } from '../production.constants';
import { countCoveredSteps, type StepRange } from './step-ranges';

/**
 * The ProductionProgress projection (one row per order). RULES:
 *   • counter(act, arch) = number of DISTINCT steps covered by the union of
 *     the order's non-cancelled events of that act and arch, legacy_batch
 *     imports included, steps beyond the planned total included;
 *   • firstActionAt / lastActionAt = min / max performedAt of the same
 *     non-cancelled events (null when there are none);
 *   • it is RECOMPUTED from all the order's events, inside the transaction
 *     of every declare and cancel (after the write, under the order lock),
 *     and upserted; never incremented. The rebuild script runs the same
 *     function over every order.
 */

/** The columns computeProgress() reads. */
export const PROGRESS_EVENT_SELECT = {
  type: true,
  arch: true,
  stepFrom: true,
  stepTo: true,
  performedAt: true,
  cancelledAt: true,
} satisfies Prisma.ProductionEventSelect;

export type ProgressEventInput = Prisma.ProductionEventGetPayload<{
  select: typeof PROGRESS_EVENT_SELECT;
}>;

/** The eight counters, named as the ProductionProgress columns. */
export type ProgressCounterField = Exclude<
  keyof ProductionProgress,
  'orderId' | 'firstActionAt' | 'lastActionAt' | 'updatedAt'
>;

/** Column of each act × arch. */
export const PROGRESS_COUNTER_FIELD: Readonly<
  Record<ProductionEventType, ArchPair<ProgressCounterField>>
> = {
  [ProductionEventType.model_printed]: {
    upper: 'printedUpper',
    lower: 'printedLower',
  },
  [ProductionEventType.aligner_thermoformed]: {
    upper: 'thermoformedUpper',
    lower: 'thermoformedLower',
  },
  [ProductionEventType.aligner_cut]: { upper: 'cutUpper', lower: 'cutLower' },
  [ProductionEventType.aligner_delivered]: {
    upper: 'deliveredUpper',
    lower: 'deliveredLower',
  },
};

/** Everything of a ProductionProgress row but its key and updatedAt: the upsert payload. */
export type ProgressCounts = Record<ProgressCounterField, number> & {
  firstActionAt: Date | null;
  lastActionAt: Date | null;
};

/** The projection of one order's events (all of them, cancelled included: they are skipped here). */
export function computeProgress(
  events: readonly ProgressEventInput[],
): ProgressCounts {
  const ranges = new Map<ProgressCounterField, StepRange[]>();
  let first: Date | null = null;
  let last: Date | null = null;
  for (const event of events) {
    if (event.cancelledAt) continue;
    const field = PROGRESS_COUNTER_FIELD[event.type][event.arch];
    const list = ranges.get(field) ?? [];
    list.push({ from: event.stepFrom, to: event.stepTo });
    ranges.set(field, list);
    if (!first || event.performedAt < first) first = event.performedAt;
    if (!last || event.performedAt > last) last = event.performedAt;
  }
  const counts = { firstActionAt: first, lastActionAt: last } as ProgressCounts;
  for (const act of PRODUCTION_ACTS) {
    for (const arch of [ProductionArch.upper, ProductionArch.lower]) {
      const field = PROGRESS_COUNTER_FIELD[act][arch];
      counts[field] = countCoveredSteps(ranges.get(field) ?? []);
    }
  }
  return counts;
}

/** The counters a list screen reads (select it on ProductionProgress). */
export const PROGRESS_COUNTERS_SELECT = {
  printedUpper: true,
  printedLower: true,
  thermoformedUpper: true,
  thermoformedLower: true,
  cutUpper: true,
  cutLower: true,
  deliveredUpper: true,
  deliveredLower: true,
  firstActionAt: true,
  lastActionAt: true,
  updatedAt: true,
} satisfies Prisma.ProductionProgressSelect;

export type ProgressCountersRow = Prisma.ProductionProgressGetPayload<{
  select: typeof PROGRESS_COUNTERS_SELECT;
}>;

const ZERO_COUNTERS: ActCounters = {
  printed: 0,
  thermoformed: 0,
  cut: 0,
  delivered: 0,
};

/** API counters from a progress row; all zero when the order has none yet. */
export function countersFromProgress(
  row: Pick<ProductionProgress, ProgressCounterField> | null,
): ArchPair<ActCounters> {
  const pair: ArchPair<ActCounters> = {
    upper: { ...ZERO_COUNTERS },
    lower: { ...ZERO_COUNTERS },
  };
  if (!row) return pair;
  for (const act of PRODUCTION_ACTS) {
    const key = ACT_COUNTER_KEY[act];
    pair.upper[key] = row[PROGRESS_COUNTER_FIELD[act].upper];
    pair.lower[key] = row[PROGRESS_COUNTER_FIELD[act].lower];
  }
  return pair;
}

/**
 * Every treated arch has a known total and at least that many distinct
 * steps delivered. Count-based on purpose (lists read the projection,
 * never the events); deliveries above the total need a confirmed warning.
 */
export function isDeliveryComplete(
  planned: PlannedTotals,
  counters: ArchPair<ActCounters>,
): boolean {
  const arches = [ProductionArch.upper, ProductionArch.lower].filter(
    (arch) => planned[arch] !== null,
  );
  return (
    arches.length > 0 &&
    arches.every((arch) => {
      const total = planned[arch]?.total;
      return total != null && counters[arch].delivered >= total;
    })
  );
}

/** planned - delivered per arch, floored at 0; null when unknown or not treated. */
export function remainingByArch(
  planned: PlannedTotals,
  counters: ArchPair<ActCounters>,
): ArchPair<number | null> {
  const remaining = (arch: ProductionArch): number | null => {
    const total = planned[arch]?.total;
    return total == null ? null : Math.max(total - counters[arch].delivered, 0);
  };
  return {
    upper: remaining(ProductionArch.upper),
    lower: remaining(ProductionArch.lower),
  };
}

/** ProductionCaseSheet.sheetVersion: changes on every declare / cancel of the order. */
export function sheetVersionOf(progress: { updatedAt: Date } | null): string {
  return progress ? progress.updatedAt.toISOString() : '0';
}
