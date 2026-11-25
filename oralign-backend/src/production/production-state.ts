import { Prisma, ProductionArch, ProductionEventType } from '@prisma/client';
import type { PlannedTotals } from './production.contract';
import {
  computeProgress,
  plannedTotalsInputOf,
  PROGRESS_COUNTERS_SELECT,
  RELEASED_BATCH_STATUSES,
  resolvePlannedTotals,
  treatedArches,
  type ProgressCountersRow,
  type ProgressEventInput,
  type StepRange,
} from './kernel';
import type {
  BatchProjectionState,
  ProjectionBatch,
  ProjectionDelivery,
} from './production-batch-projection';
import { compareArches, releasedSteps } from './production.rules';
import type { StateOrderRow } from './production.selects';

/**
 * What the production rules derive from an order loaded with the rules
 * quotation select (STATE_ORDER_SELECT, SHEET_ORDER_SELECT): one place, so
 * the case sheet shows exactly what a declaration would be checked
 * against, and the projection runs on the same reading.
 */
export type RulesOrderRow = Pick<
  StateOrderRow,
  | 'status'
  | 'archTreatment'
  | 'treatBothArch'
  | 'totalAligners'
  | 'treatmentPlans'
  | 'quotation'
>;

export interface OrderFacts {
  /** The live quotation (null when none or soft-deleted). */
  quote: NonNullable<StateOrderRow['quotation']> | null;
  /**
   * Its batches as aligner step ranges, ascending by fromStep; [] without
   * a live quotation, and on an unlimited-step pack, whose batches are
   * payment placeholders ([1,1], [2,2]…): nothing may read them as steps
   * (the case sheet's ranges, the projection), CONC-01.
   */
  batches: ProjectionBatch[];
  planned: PlannedTotals;
  treated: ReturnType<typeof treatedArches>;
  released: StepRange[];
  /** The queue rule's "a batch is unlocked or delivered" (placeholders included). */
  hasReleasedBatch: boolean;
}

export function orderFactsOf(order: RulesOrderRow): OrderFacts {
  const quote =
    order.quotation && !order.quotation.deletedAt ? order.quotation : null;
  const stepBatches = quote?.stepBatches ?? [];
  const unlimited = quote?.isUnlimitedSteps ?? false;
  const input = plannedTotalsInputOf(order);
  return {
    quote,
    batches: unlimited ? [] : stepBatches,
    planned: resolvePlannedTotals(input),
    treated: treatedArches(input),
    released: releasedSteps({
      status: order.status,
      quotation: quote
        ? {
            paymentStatus: quote.paymentStatus,
            isUnlimitedSteps: unlimited,
            batches: stepBatches,
          }
        : null,
    }),
    hasReleasedBatch: stepBatches.some((batch) =>
      RELEASED_BATCH_STATUSES.includes(batch.status),
    ),
  };
}

/** The projection state from what declare / cancel read under the lock, after their write. */
export function projectionStateOf(
  order: Pick<
    StateOrderRow,
    'status' | 'orderType' | 'coverageStartedAt' | 'coverageExpiresAt'
  >,
  facts: OrderFacts,
  events: readonly (ProjectionDelivery & {
    type: ProductionEventType;
    cancelledAt: Date | null;
  })[],
): BatchProjectionState {
  return {
    status: order.status,
    orderType: order.orderType,
    coverageStartedAt: order.coverageStartedAt,
    coverageExpiresAt: order.coverageExpiresAt,
    treatmentValidityMonths: facts.quote?.treatmentValidityMonths ?? null,
    treatedArches: facts.treated,
    planned: facts.planned,
    unlimitedSteps: facts.quote?.isUnlimitedSteps ?? false,
    batches: facts.batches,
    deliveries: events
      .filter(
        (event) =>
          event.cancelledAt === null &&
          event.type === ProductionEventType.aligner_delivered,
      )
      .map((event) => ({
        arch: event.arch,
        stepFrom: event.stepFrom,
        stepTo: event.stepTo,
        performedAt: event.performedAt,
        createdById: event.createdById,
      })),
  };
}

/**
 * Recompute the order's ProductionProgress from ALL its events (cancelled
 * ones are skipped by computeProgress) and upsert it: never incremented,
 * so it cannot drift. Runs under the order lock, after the write.
 */
export async function writeProgress(
  tx: Prisma.TransactionClient,
  orderId: string,
  events: readonly ProgressEventInput[],
): Promise<ProgressCountersRow> {
  const counts = computeProgress(events);
  return tx.productionProgress.upsert({
    where: { orderId },
    create: { orderId, ...counts },
    update: counts,
    select: PROGRESS_COUNTERS_SELECT,
  });
}

/** Upper first, then by id: the order the rows of a declaration are shown in. */
export function byArchThenId(
  a: { arch: ProductionArch; id: string },
  b: { arch: ProductionArch; id: string },
): number {
  return (
    compareArches(a.arch, b.arch) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
