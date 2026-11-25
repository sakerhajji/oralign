import {
  BatchStatus,
  OrderStatus,
  OrderType,
  Prisma,
  ProductionArch,
  ProductionEventType,
} from '@prisma/client';
import {
  coverageWindowPatch,
  type CoverageWindowPatch,
} from '../orders/coverage-window';
import { batchCoverageNeeds } from './batch-coverage';
import type { PlannedTotals } from './production.contract';
import { BATCH_STATE_SELECT } from './production.selects';
import {
  PLANNED_TOTALS_ORDER_SELECT,
  plannedTotalsInputOf,
  resolvePlannedTotals,
  treatedArches,
  uncoveredStepRanges,
  type StepRange,
} from './kernel';

/**
 * QuoteStepBatch.status = delivered as a PROJECTION of the lab's
 * aligner_delivered events (owner decision D2, CONTRACT §3.4). Plain
 * tx-scoped functions with no DI, so the quotation and payment modules
 * call them inside their own transactions without importing anything
 * that could close a module cycle.
 *
 *   • flip: an `unlocked` batch whose range is covered on EVERY treated
 *     arch by live deliveries becomes `delivered` (deliveredByProduction).
 *     "Its range" is, per arch, the part up to that arch's approved total
 *     (batch-coverage.ts): a batch wholly beyond both totals is covered
 *     once the case has any live delivery;
 *   • revert: a batch the projection flipped that is no longer covered goes
 *     back to `unlocked`, unless the order is finished (the reports flag
 *     it); a batch an admin delivered the legacy way is never touched;
 *   • the first flip starts the coverage window (compare-and-set) and the
 *     last one finishes the order, as the old "deliver batch" did, but
 *     without its BatchDelivered notice: the production notice replaces it.
 *   • `locked` batches are never flipped: the unlock hooks re-run this.
 *   • an unlimited-step pack is never projected: its batches are payment
 *     placeholders ([1,1], [2,2]…), so a step-1 delivery would flip and
 *     finish the case (CONC-01). Its "Marquer livré" flips them itself.
 */

/** A batch of the live quotation, as the projection reads it. */
export interface ProjectionBatch {
  id: string;
  fromStep: number;
  toStep: number;
  status: BatchStatus;
  deliveredByProduction: boolean;
}

/** A live aligner_delivered row (any origin). */
export interface ProjectionDelivery {
  arch: ProductionArch;
  stepFrom: number;
  stepTo: number;
  performedAt: Date;
  createdById: string | null;
}

/** Everything the projection decides from, read under the order lock. */
export interface BatchProjectionState {
  status: OrderStatus;
  orderType: OrderType;
  coverageStartedAt: Date | null;
  coverageExpiresAt: Date | null;
  /** The live quotation's pack validity; null without one. */
  treatmentValidityMonths: number | null;
  treatedArches: readonly ProductionArch[];
  /** Per treated arch; an approved total clips what a batch needs. */
  planned: PlannedTotals;
  /** The live quotation is an unlimited-step pack: nothing is projected. */
  unlimitedSteps: boolean;
  /** The live quotation's batches; [] without one. */
  batches: readonly ProjectionBatch[];
  deliveries: readonly ProjectionDelivery[];
}

export interface BatchFlip {
  batchIds: string[];
  deliveredAt: Date;
  deliveredById: string | null;
}

export interface BatchProjectionPlan {
  /** One group per distinct (deliveredAt, deliveredById): one updateMany each. */
  flips: BatchFlip[];
  reverts: string[];
  coverage: CoverageWindowPatch | null;
  finish: boolean;
}

const NOTHING: BatchProjectionPlan = {
  flips: [],
  reverts: [],
  coverage: null,
  finish: false,
};

function overlaps(delivery: ProjectionDelivery, range: StepRange): boolean {
  return delivery.stepFrom <= range.to && delivery.stepTo >= range.from;
}

/** The latest of `rows` by performedAt; null for none (never a bare reduce). */
function latestOf(
  rows: readonly ProjectionDelivery[],
): ProjectionDelivery | null {
  let latest: ProjectionDelivery | null = null;
  for (const row of rows) {
    if (!latest || row.performedAt.getTime() > latest.performedAt.getTime()) {
      latest = row;
    }
  }
  return latest;
}

/**
 * The pure decision. `actorId` is who the flips are attributed to
 * (deliveredById); null = the author of the latest covering delivery,
 * which is what an unlock hook wants (the payer did not deliver anything).
 */
export function planBatchProjection(
  state: BatchProjectionState,
  actorId: string | null,
): BatchProjectionPlan {
  const arches = state.treatedArches;
  if (
    state.unlimitedSteps ||
    arches.length === 0 ||
    state.batches.length === 0
  ) {
    return NOTHING;
  }
  const deliveriesOf = new Map<ProductionArch, ProjectionDelivery[]>(
    arches.map((arch) => [
      arch,
      state.deliveries.filter((row) => row.arch === arch),
    ]),
  );
  const lastDelivery = latestOf(state.deliveries);

  /**
   * The latest delivery covering the batch, or null when it is not
   * covered: on every arch, the steps it needs (clipped to the arch's
   * approved total) are delivered. A batch needing nothing on any arch
   * is covered by the case's latest live delivery, if it has one. Flip
   * and revert both ask this, so they stay symmetric.
   */
  const coverOf = (batch: ProjectionBatch): ProjectionDelivery | null => {
    const needs = batchCoverageNeeds(batch, arches, state.planned);
    if (needs.length === 0) return lastDelivery;
    const covering: ProjectionDelivery[] = [];
    for (const need of needs) {
      const range: StepRange = { from: need.fromStep, to: need.toStep };
      const rows = deliveriesOf.get(need.arch) ?? [];
      const delivered = rows.map((row) => ({
        from: row.stepFrom,
        to: row.stepTo,
      }));
      if (uncoveredStepRanges(range, delivered).length > 0) return null;
      covering.push(...rows.filter((row) => overlaps(row, range)));
    }
    return latestOf(covering);
  };

  const groups = new Map<string, BatchFlip>();
  const flipped = new Set<string>();
  for (const batch of state.batches) {
    if (batch.status !== BatchStatus.unlocked) continue;
    const latest = coverOf(batch);
    if (!latest) continue;
    const deliveredById = actorId ?? latest.createdById;
    const key = `${latest.performedAt.getTime()}|${deliveredById ?? ''}`;
    const group = groups.get(key) ?? {
      batchIds: [],
      deliveredAt: latest.performedAt,
      deliveredById,
    };
    group.batchIds.push(batch.id);
    groups.set(key, group);
    flipped.add(batch.id);
  }

  const finished = state.status === OrderStatus.finished;
  const reverts = finished
    ? []
    : state.batches
        .filter(
          (batch) =>
            batch.status === BatchStatus.delivered &&
            batch.deliveredByProduction &&
            coverOf(batch) === null,
        )
        .map((batch) => batch.id);

  const flips = [...groups.values()];
  if (flips.length === 0) return { ...NOTHING, reverts };

  const startedAt = new Date(
    Math.min(...flips.map((flip) => flip.deliveredAt.getTime())),
  );
  const reverted = new Set(reverts);
  const allDelivered = state.batches.every(
    (batch) =>
      !reverted.has(batch.id) &&
      (batch.status === BatchStatus.delivered || flipped.has(batch.id)),
  );
  return {
    flips,
    reverts,
    coverage: coverageWindowPatch(state, startedAt),
    finish: allDelivered && !finished,
  };
}

/**
 * Row-lock the order for the rest of the transaction. Every writer of the
 * production state (declare, cancel, this projection, the scripts) takes
 * it first; a second call in the same transaction does not wait.
 */
export async function lockProductionOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "DentalOrder" WHERE id = ${orderId} FOR UPDATE`;
}

/**
 * The order columns the projection loads itself (unlock hooks). The
 * planned-total inputs ride in the same statements (order, plan,
 * quotation), so clipping to the approved totals costs no query.
 */
const PROJECTION_ORDER_SELECT = {
  status: true,
  orderType: true,
  coverageStartedAt: true,
  coverageExpiresAt: true,
  ...PLANNED_TOTALS_ORDER_SELECT,
  quotation: {
    select: {
      ...PLANNED_TOTALS_ORDER_SELECT.quotation.select,
      treatmentValidityMonths: true,
      stepBatches: { select: BATCH_STATE_SELECT },
    },
  },
} satisfies Prisma.DentalOrderSelect;

/** Live aligner_delivered rows of an order (all origins). */
export const PROJECTION_DELIVERY_SELECT = {
  arch: true,
  stepFrom: true,
  stepTo: true,
  performedAt: true,
  createdById: true,
} satisfies Prisma.ProductionEventSelect;

async function loadProjectionState(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<BatchProjectionState | null> {
  const order = await tx.dentalOrder.findUnique({
    where: { id: orderId },
    select: PROJECTION_ORDER_SELECT,
  });
  const quote = order?.quotation?.deletedAt ? null : order?.quotation;
  const batches = quote?.stepBatches ?? [];
  // Nothing can flip or revert (an unlimited pack never does): spare the
  // events read.
  const movable =
    !quote?.isUnlimitedSteps &&
    batches.some(
      (batch) =>
        batch.status === BatchStatus.unlocked ||
        (batch.status === BatchStatus.delivered && batch.deliveredByProduction),
    );
  if (!order || !movable) return null;
  const deliveries = await tx.productionEvent.findMany({
    where: {
      orderId,
      type: ProductionEventType.aligner_delivered,
      cancelledAt: null,
    },
    select: PROJECTION_DELIVERY_SELECT,
  });
  const input = plannedTotalsInputOf(order);
  return {
    status: order.status,
    orderType: order.orderType,
    coverageStartedAt: order.coverageStartedAt,
    coverageExpiresAt: order.coverageExpiresAt,
    treatmentValidityMonths: quote?.treatmentValidityMonths ?? null,
    treatedArches: treatedArches(input),
    planned: resolvePlannedTotals(input),
    unlimitedSteps: quote?.isUnlimitedSteps ?? false,
    batches,
    deliveries,
  };
}

/**
 * Re-project an order's batches inside the caller's transaction.
 *
 * Without `state` (the unlock hooks in PaymentsService and the quotation
 * total edit) it takes the order lock FIRST and only then reads: those
 * hooks hold the installment / quotation / batch rows, never the order,
 * and a delivery declared concurrently would otherwise commit against a
 * batch it still saw locked (write skew). Declare and cancel take the
 * order lock before the batches and never wait on those rows, so the two
 * orders cannot deadlock.
 *
 * With `state` the caller holds the lock and read it under it; the
 * projection then costs its writes only (one updateMany per flip group,
 * one for the reverts, the coverage compare-and-set, the finish).
 */
export async function projectBatches(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    /** deliveredById of the flips; null = the latest covering delivery's author. */
    actorId: string | null;
    state?: BatchProjectionState;
  },
): Promise<BatchProjectionPlan> {
  let state = input.state ?? null;
  if (!state) {
    await lockProductionOrder(tx, input.orderId);
    state = await loadProjectionState(tx, input.orderId);
    if (!state) return NOTHING;
  }
  const plan = planBatchProjection(state, input.actorId);

  let flippedCount = 0;
  let expected = 0;
  for (const flip of plan.flips) {
    expected += flip.batchIds.length;
    const { count } = await tx.quoteStepBatch.updateMany({
      where: { id: { in: flip.batchIds }, status: BatchStatus.unlocked },
      data: {
        status: BatchStatus.delivered,
        deliveredAt: flip.deliveredAt,
        deliveredById: flip.deliveredById,
        deliveredByProduction: true,
      },
    });
    flippedCount += count;
  }
  if (plan.reverts.length > 0) {
    await tx.quoteStepBatch.updateMany({
      where: {
        id: { in: plan.reverts },
        status: BatchStatus.delivered,
        deliveredByProduction: true,
      },
      data: {
        status: BatchStatus.unlocked,
        deliveredAt: null,
        deliveredById: null,
        deliveredByProduction: false,
      },
    });
  }
  if (plan.coverage && flippedCount > 0) {
    // Compare-and-set on the state it was decided from: a concurrent
    // hand-over (AlignerDelivery) that started the clock first wins.
    await tx.dentalOrder.updateMany({
      where: {
        id: input.orderId,
        coverageStartedAt: state.coverageStartedAt,
        coverageExpiresAt: state.coverageExpiresAt,
      },
      data: plan.coverage,
    });
  }
  // A re-plan racing on the batch rows (deleted, re-created) matched
  // fewer rows than decided: never finish the case on a guess.
  if (plan.finish && flippedCount === expected) {
    await tx.dentalOrder.update({
      where: { id: input.orderId },
      data: { status: OrderStatus.finished },
      select: { id: true },
    });
  }
  return plan;
}
