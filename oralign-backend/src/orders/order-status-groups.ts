import { OrderStatus } from '@prisma/client';

/**
 * Statuses that do NOT make an order active: the draft that was never
 * submitted, and the closed outcomes (finished, cancelled, rejected, in
 * the current and the legacy spelling of the enum). Every other status,
 * submitted through shipped (paid and the legacy in_review / approved
 * included), means the case is still moving.
 *
 * Listed as the closed set rather than the open one on purpose: a status
 * added to the lifecycle later counts as active until someone decides
 * otherwise, instead of silently dropping out of every "active" filter.
 */
export const INACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.draft,
  OrderStatus.finished,
  OrderStatus.canceled,
  OrderStatus.cancelled,
  OrderStatus.rejected,
];
