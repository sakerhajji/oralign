import {
  BatchStatus,
  OrderStatus,
  OrderType,
  Prisma,
  ProductionEventOrigin,
} from '@prisma/client';
import type { ProductionOrderKind } from '../production.contract';
import {
  NON_PRODUCTION_STATUSES,
  PAYMENT_PHASE_STATUSES,
  PRODUCTION_STATUSES,
  UNDECLARABLE_STATUSES,
} from '../production.constants';

/**
 * Which cases are "à fabriquer" (owner decision D3), as ONE rule shared by
 * the queue, the technician's declare / read checks and the admin progress
 * filter:
 *   • not soft-deleted, AND
 *   • status in PRODUCTION_STATUSES (paid, fabrication, ready_to_ship,
 *     shipped), OR
 *   • an installment case still paying (status not in
 *     NON_PRODUCTION_STATUSES) whose live quotation has at least one batch
 *     released (unlocked) or delivered.
 * Supplemental children follow the same rule: they are DentalOrders.
 */
export const RELEASED_BATCH_STATUSES: readonly BatchStatus[] = [
  BatchStatus.unlocked,
  BatchStatus.delivered,
];

/**
 * Prisma filter of the queue's "En cours" tab. The second branch names
 * the payment-phase statuses (the complement of the two lists, the same
 * rule as isInProductionQueue) so both branches use the status index.
 */
export function productionQueueWhere(): Prisma.DentalOrderWhereInput {
  return {
    deletedAt: null,
    OR: [
      { status: { in: [...PRODUCTION_STATUSES] } },
      {
        status: { in: [...PAYMENT_PHASE_STATUSES] },
        quotation: {
          is: {
            deletedAt: null,
            stepBatches: {
              some: { status: { in: [...RELEASED_BATCH_STATUSES] } },
            },
          },
        },
      },
    ],
  };
}

/**
 * "Terminés": cases with production behind them (a progress row whose
 * lastActionAt is set, i.e. at least one live event) that no longer match
 * the queue rule.
 */
export function productionDoneWhere(): Prisma.DentalOrderWhereInput {
  return {
    deletedAt: null,
    productionProgress: { is: { lastActionAt: { not: null } } },
    NOT: productionQueueWhere(),
  };
}

/**
 * Cases produced THROUGH the module: at least one `declared` event, live or
 * cancelled. legacy_batch imports (D5) do not count, so the go-live import
 * never opens the whole archive to the technician.
 */
export function productionHistoryWhere(): Prisma.DentalOrderWhereInput {
  return {
    productionEvents: { some: { origin: ProductionEventOrigin.declared } },
  };
}

/**
 * What a TECHNICIAN may read (sheet, dossier, files): the queue, plus the
 * cases declared through the module so her history links keep working
 * after a case leaves the queue. Admins read any non-deleted order.
 */
export function productionTechnicianReadWhere(): Prisma.DentalOrderWhereInput {
  return {
    deletedAt: null,
    OR: [productionQueueWhere(), productionHistoryWhere()],
  };
}

/** The technician's "Terminés" tab: done AND produced through the module. */
export function productionTechnicianDoneWhere(): Prisma.DentalOrderWhereInput {
  return { AND: [productionDoneWhere(), productionHistoryWhere()] };
}

/** productionTechnicianReadWhere() on an already-loaded order. */
export function isReadableByTechnician(order: {
  status: OrderStatus;
  deletedAt: Date | null;
  hasReleasedBatch: boolean;
  hasDeclaredEvent: boolean;
}): boolean {
  if (order.deletedAt) return false;
  return isInProductionQueue(order) || order.hasDeclaredEvent;
}

/** The same rule on an already-loaded order (`hasReleasedBatch` from its live quotation). */
export function isInProductionQueue(order: {
  status: OrderStatus;
  deletedAt: Date | null;
  hasReleasedBatch: boolean;
}): boolean {
  if (order.deletedAt) return false;
  if (PRODUCTION_STATUSES.includes(order.status)) return true;
  return (
    !NON_PRODUCTION_STATUSES.includes(order.status) && order.hasReleasedBatch
  );
}

/** Nobody (admins included) declares on a draft, cancelled or rejected order. */
export function isDeclarableStatus(status: OrderStatus): boolean {
  return !UNDECLARABLE_STATUSES.includes(status);
}

export function orderKindOf(orderType: OrderType): ProductionOrderKind {
  return orderType === OrderType.initial ? 'main' : 'supplemental';
}
