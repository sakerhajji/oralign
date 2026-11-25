import { OrderType, Prisma } from '@prisma/client';
import { PaginatedResponse } from '../../common/dto/response.dto';
import { DEFAULT_PAGE_SIZE } from '../production.constants';
import {
  PRODUCTION_WARNING,
  type ProductionEventView,
  type ProductionEventWithOrder,
  type ProductionOrderRef,
  type ProductionWarningCode,
} from '../production.contract';
import { orderKindOf } from '../kernel';

/**
 * Shapes the admin desk shares: the event row it lists (journal,
 * cancelled rows) and the order reference every row carries. Explicit
 * whitelists, never `include`: each nested relation costs one batched
 * statement per call, whatever the number of rows.
 */

/** What names a case in a list: order + patient (2 statements). */
export const REPORT_ORDER_REF_SELECT = {
  orderCode: true,
  orderType: true,
  patient: { select: { fullName: true } },
} satisfies Prisma.DentalOrderSelect;

export interface OrderRefRow {
  orderCode: string;
  orderType: OrderType;
  patient: { fullName: string };
}

/** Every column ProductionEventView shows (no idempotency key). */
export const REPORT_EVENT_COLUMNS = {
  id: true,
  orderId: true,
  declarationId: true,
  type: true,
  arch: true,
  stepFrom: true,
  stepTo: true,
  quantity: true,
  performedAt: true,
  createdAt: true,
  createdById: true,
  createdByName: true,
  createdByRole: true,
  deliveredTo: true,
  deliveredToName: true,
  note: true,
  warnings: true,
  origin: true,
  notifiedAt: true,
  cancelledAt: true,
  cancelledById: true,
  cancelledByName: true,
  cancelReason: true,
} satisfies Prisma.ProductionEventSelect;

/** An event row with its case (3 statements per call). */
export const REPORT_EVENT_SELECT = {
  ...REPORT_EVENT_COLUMNS,
  order: { select: REPORT_ORDER_REF_SELECT },
} satisfies Prisma.ProductionEventSelect;

export type ReportEventRow = Prisma.ProductionEventGetPayload<{
  select: typeof REPORT_EVENT_SELECT;
}>;

/** The event order of a journal: performedAt, then createdAt, upper first, id. */
export const JOURNAL_ORDER_BY = [
  { performedAt: 'asc' },
  { createdAt: 'asc' },
  { arch: 'asc' },
  { id: 'asc' },
] satisfies Prisma.ProductionEventOrderByWithRelationInput[];

/** Cancelled rows, latest cancel first; arch then id keep a declaration's rows in place. */
export const CANCELLED_ORDER_BY = [
  { cancelledAt: 'desc' },
  { arch: 'asc' },
  { id: 'asc' },
] satisfies Prisma.ProductionEventOrderByWithRelationInput[];

const WARNING_ORDER: readonly ProductionWarningCode[] =
  Object.values(PRODUCTION_WARNING);

/**
 * The stored warning strings as API codes: known codes only, deduplicated,
 * in PRODUCTION_WARNING order (the column is a free String[]).
 */
export function warningCodesOf(
  raw: readonly string[] | null | undefined,
): ProductionWarningCode[] {
  const stored = new Set(raw ?? []);
  return WARNING_ORDER.filter((code) => stored.has(code));
}

/** Plain code-point order: deterministic for codes and ids, whatever the locale. */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isoOrNull(instant: Date | null | undefined): string | null {
  return instant ? instant.toISOString() : null;
}

export function orderRefOf(
  orderId: string,
  order: OrderRefRow,
): ProductionOrderRef {
  return {
    orderId,
    orderCode: order.orderCode,
    kind: orderKindOf(order.orderType),
    orderType: order.orderType,
    patientName: order.patient.fullName,
  };
}

/**
 * ProductionEventView of a row on the ADMIN desk: an admin may cancel any
 * live row, legacy_batch included (CONTRACT §3.3), so canCancel is "not
 * cancelled yet". Never reuse it for a technician view.
 */
export function adminEventViewOf(
  row: Prisma.ProductionEventGetPayload<{
    select: typeof REPORT_EVENT_COLUMNS;
  }>,
): ProductionEventView {
  return {
    id: row.id,
    orderId: row.orderId,
    declarationId: row.declarationId,
    type: row.type,
    arch: row.arch,
    stepFrom: row.stepFrom,
    stepTo: row.stepTo,
    quantity: row.quantity,
    performedAt: row.performedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    createdByName: row.createdByName,
    createdByRole: row.createdByRole,
    deliveredTo: row.deliveredTo,
    deliveredToName: row.deliveredToName,
    note: row.note,
    warnings: warningCodesOf(row.warnings),
    origin: row.origin,
    notifiedAt: isoOrNull(row.notifiedAt),
    cancelledAt: isoOrNull(row.cancelledAt),
    cancelledById: row.cancelledById,
    cancelledByName: row.cancelledByName,
    cancelReason: row.cancelReason,
    canCancel: row.cancelledAt === null,
  };
}

export function adminEventWithOrderOf(
  row: ReportEventRow,
): ProductionEventWithOrder {
  return {
    ...adminEventViewOf(row),
    order: orderRefOf(row.orderId, row.order),
  };
}

/** page / limit of a paged query, with the repo defaults (1, 20). */
export function pagingOf(query: { page?: number; limit?: number }): {
  page: number;
  limit: number;
  skip: number;
} {
  const page = query.page ?? 1;
  const limit = query.limit ?? DEFAULT_PAGE_SIZE;
  return { page, limit, skip: (page - 1) * limit };
}

export function pageOf<T>(
  data: T[],
  total: number,
  paging: { page: number; limit: number },
): PaginatedResponse<T> {
  return new PaginatedResponse(
    data,
    total,
    paging.page,
    paging.limit,
    Math.ceil(total / paging.limit),
  );
}
