import {
  BatchStatus,
  Prisma,
  ProductionArch,
  ProductionEventType,
} from '@prisma/client';
import { batchCoverageNeeds } from './batch-coverage';
import type {
  ArchPair,
  PlannedTotals,
  ProductionArchRelease,
  ProductionReleaseState,
  ProductionReleaseSummary,
  ProductionStepSpan,
} from './production.contract';
import {
  computeProgress,
  mergeStepRanges,
  plannedTotalsInputOf,
  PROGRESS_COUNTERS_SELECT,
  RELEASED_BATCH_STATUSES,
  resolvePlannedTotals,
  treatedArches,
  uncoveredStepRanges,
  type ProgressCountersRow,
  type ProgressEventInput,
  type StepRange,
} from './kernel';
import type {
  BatchProjectionState,
  ProjectionBatch,
  ProjectionDelivery,
} from './production-batch-projection';
import {
  compareArches,
  releasedSteps,
  releasesEveryStep,
} from './production.rules';
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

// ── Release (spec §3: what the workshop may work on) ───────────────────

/** A batch's steps as a span (both ends included). */
type BatchSpan = Pick<ProjectionBatch, 'fromStep' | 'toStep'>;

/**
 * The batch range on one arch, its end trimmed to the arch's APPROVED
 * total (batch-coverage.ts: provisional or unknown totals never trim);
 * null when the batch holds no step of that arch's plan.
 */
function archSpanOf(
  batch: BatchSpan,
  arch: ProductionArch,
  planned: PlannedTotals,
): StepRange | null {
  const [need] = batchCoverageNeeds(batch, [arch], planned);
  return need ? { from: need.fromStep, to: need.toStep } : null;
}

/**
 * The batch range trimmed to the highest approved total of the treated
 * arches (one range serves both arches); null when no treated arch needs
 * any of its steps (a batch wholly beyond the approved plan).
 */
export function trimmedBatchSpan(
  batch: BatchSpan,
  arches: readonly ProductionArch[],
  planned: PlannedTotals,
): ProductionStepSpan | null {
  const needs = batchCoverageNeeds(batch, arches, planned);
  if (needs.length === 0) return null;
  return {
    from: batch.fromStep,
    to: Math.max(...needs.map((need) => need.toStep)),
  };
}

const byFromStep = (a: BatchSpan, b: BatchSpan): number =>
  a.fromStep - b.fromStep || a.toStep - b.toStep;

/**
 * The release block of a case (ProductionOrderSummary.release), from the
 * same facts the declare rules read, so the card can never promise a step
 * the server refuses:
 *   • everything released (no schedule; an unlimited pack once paid):
 *     unscheduled / all, every arch [1 → total];
 *   • nothing released: none, with the lowest locked batch as `next`;
 *   • limited batches: per treated arch the released batches merged and
 *     trimmed to that arch's approved total; partial while a locked batch
 *     holds a planned step (or a planned step lies outside every batch),
 *     all otherwise.
 * Pure: the queue, the case sheet and the specs call it on loaded rows.
 */
export function releaseSummaryOf(
  facts: Pick<
    OrderFacts,
    'quote' | 'batches' | 'planned' | 'treated' | 'released'
  >,
): ProductionReleaseSummary {
  const { planned, treated } = facts;
  const stepBatches = facts.quote?.stepBatches ?? [];
  const everything = releasesEveryStep(facts.released);
  const nothing = facts.released.length === 0;

  const totalOf = (arch: ProductionArch): ProductionStepSpan | null => {
    const total = planned[arch]?.total ?? null;
    return total !== null && total >= 1 ? { from: 1, to: total } : null;
  };
  // Limited pack only: facts.batches is [] on an unlimited pack (CONC-01).
  const releasedBatches = facts.batches.filter((batch) =>
    RELEASED_BATCH_STATUSES.includes(batch.status),
  );
  const unlockedOf = (arch: ProductionArch): ProductionStepSpan[] => {
    if (everything) {
      const total = totalOf(arch);
      return total ? [total] : [];
    }
    if (nothing) return [];
    return mergeStepRanges(
      releasedBatches.flatMap((batch) => {
        const span = archSpanOf(batch, arch, planned);
        return span ? [span] : [];
      }),
    );
  };
  const archOf = (arch: ProductionArch): ProductionArchRelease | null => {
    const target = planned[arch];
    if (target === null) return null;
    const unlocked = unlockedOf(arch);
    return {
      total: totalOf(arch),
      provisional: target.provisional,
      unlocked,
      workableTo: unlocked.length > 0 ? unlocked[unlocked.length - 1].to : null,
    };
  };
  const arches: ArchPair<ProductionArchRelease | null> = {
    upper: archOf(ProductionArch.upper),
    lower: archOf(ProductionArch.lower),
  };

  const nextLocked = [...facts.batches]
    .filter((batch) => batch.status === BatchStatus.locked)
    .sort(byFromStep)
    .map((batch) => trimmedBatchSpan(batch, treated, planned))
    .find((span): span is ProductionStepSpan => span !== null);
  const next = everything ? null : (nextLocked ?? null);

  let state: ProductionReleaseState;
  if (everything) {
    state = stepBatches.length > 0 ? 'all' : 'unscheduled';
  } else {
    const shown = [arches.upper, arches.lower].filter(
      (arch): arch is ProductionArchRelease => arch !== null,
    );
    const anyUnlocked = shown.some((arch) => arch.unlocked.length > 0);
    // A planned step outside every released span (a locked batch, or a
    // plan longer than the batches) keeps the case partial.
    const gapLeft = shown.some(
      (arch) =>
        arch.total !== null &&
        uncoveredStepRanges(arch.total, arch.unlocked).length > 0,
    );
    state = !anyUnlocked
      ? 'none'
      : next !== null || gapLeft
        ? 'partial'
        : 'all';
  }
  return { state, arches, next };
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
