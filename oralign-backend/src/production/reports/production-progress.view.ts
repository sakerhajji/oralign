import { Prisma } from '@prisma/client';
import { ProductionProgressStateParam } from '../dto';
import type { ProductionProgressRow } from '../production.contract';
import {
  countersFromProgress,
  isDeliveryComplete,
  isInProductionQueue,
  orderKindOf,
  PLANNED_TOTALS_ORDER_SELECT,
  plannedTotalsInputOf,
  productionDoneWhere,
  productionQueueWhere,
  PROGRESS_COUNTERS_SELECT,
  RELEASED_BATCH_STATUSES,
  remainingByArch,
  resolvePlannedTotals,
  treatedArches,
} from '../kernel';
import {
  ACTIVE_QUEUE_ORDER_BY,
  productionSearchWhere as queueSearchWhere,
} from '../production-queue.query';
import { isoOrNull } from './report-views';

/**
 * "Avancement" (GET production/admin/progress): one row per case, read
 * from the ProductionProgress projection, never from the events. Same
 * search and order as the queue's "En cours" tab.
 */

/**
 * Statements of the findMany: order + patient + doctor + parentOrder +
 * progress + quotation + its released batch + approved plan = 8 (+ the
 * count = 9). Only ONE released batch is loaded: `inQueue` only asks
 * whether one exists.
 */
export const PROGRESS_ROW_SELECT = {
  id: true,
  orderCode: true,
  orderType: true,
  parentOrderId: true,
  status: true,
  deletedAt: true,
  ...PLANNED_TOTALS_ORDER_SELECT,
  quotation: {
    select: {
      ...PLANNED_TOTALS_ORDER_SELECT.quotation.select,
      stepBatches: {
        where: { status: { in: [...RELEASED_BATCH_STATUSES] } },
        select: { id: true },
        take: 1,
      },
    },
  },
  parentOrder: { select: { orderCode: true } },
  patient: { select: { fullName: true } },
  doctor: { select: { fullName: true } },
  productionProgress: { select: PROGRESS_COUNTERS_SELECT },
} satisfies Prisma.DentalOrderSelect;

export type ProgressOrderRow = Prisma.DentalOrderGetPayload<{
  select: typeof PROGRESS_ROW_SELECT;
}>;

/** The queue's "En cours" order (one source: production-queue.query.ts). */
export const PROGRESS_ORDER_BY = ACTIVE_QUEUE_ORDER_BY;

/** all = in the queue OR with progress (legacy-only cases too); active = D3; done = out of it. */
export function progressStateWhere(
  state: ProductionProgressStateParam = ProductionProgressStateParam.all,
): Prisma.DentalOrderWhereInput {
  switch (state) {
    case ProductionProgressStateParam.active:
      return productionQueueWhere();
    case ProductionProgressStateParam.done:
      return productionDoneWhere();
    default:
      return {
        deletedAt: null,
        OR: [productionQueueWhere(), { productionProgress: { isNot: null } }],
      };
  }
}

/** The queue's search (one source: production-queue.query.ts); null when empty. */
export function productionSearchWhere(
  search: string | undefined,
): Prisma.DentalOrderWhereInput | null {
  return search ? queueSearchWhere(search) : null;
}

export function progressWhere(
  state: ProductionProgressStateParam | undefined,
  search: string | undefined,
): Prisma.DentalOrderWhereInput {
  const searchWhere = productionSearchWhere(search);
  const stateWhere = progressStateWhere(state);
  return searchWhere ? { AND: [stateWhere, searchWhere] } : stateWhere;
}

export function progressRowOf(row: ProgressOrderRow): ProductionProgressRow {
  const input = plannedTotalsInputOf(row);
  const planned = resolvePlannedTotals(input);
  const counters = countersFromProgress(row.productionProgress);
  const quote =
    row.quotation && !row.quotation.deletedAt ? row.quotation : null;
  return {
    orderId: row.id,
    orderCode: row.orderCode,
    kind: orderKindOf(row.orderType),
    orderType: row.orderType,
    parentOrderId: row.parentOrderId,
    parentOrderCode: row.parentOrder?.orderCode ?? null,
    patientName: row.patient.fullName,
    practitionerName: row.doctor.fullName,
    status: row.status,
    archTreatment: row.archTreatment,
    treatedArches: treatedArches(input),
    planned,
    counters,
    lastActionAt: isoOrNull(row.productionProgress?.lastActionAt),
    deliveryComplete: isDeliveryComplete(planned, counters),
    remaining: remainingByArch(planned, counters),
    firstActionAt: isoOrNull(row.productionProgress?.firstActionAt),
    inQueue: isInProductionQueue({
      status: row.status,
      deletedAt: row.deletedAt,
      hasReleasedBatch: (quote?.stepBatches.length ?? 0) > 0,
    }),
  };
}
