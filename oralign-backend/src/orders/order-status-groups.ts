import { OrderStatus } from '@prisma/client';

/**
 * Statuses that end an order's workflow: finished, cancelled (in the
 * current and the legacy spelling of the enum) and rejected. An order in
 * any other status, draft included, is still open.
 *
 * Listed as the closed set rather than the open one on purpose: a status
 * added to the lifecycle later counts as open until someone decides
 * otherwise, instead of silently dropping out of every "active" filter.
 */
export const CLOSED_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.finished,
  OrderStatus.canceled,
  OrderStatus.cancelled,
  OrderStatus.rejected,
];

/**
 * Statuses that do NOT make an order active: the draft that was never
 * submitted, and the closed outcomes. Every other status, submitted
 * through shipped (paid and the legacy in_review / approved included),
 * means the case is still moving.
 */
export const INACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.draft,
  ...CLOSED_ORDER_STATUSES,
];

/** True when the order's workflow is over (see CLOSED_ORDER_STATUSES). */
export function isClosedOrderStatus(status: OrderStatus): boolean {
  return CLOSED_ORDER_STATUSES.includes(status);
}

/** True when moving from `from` to `to` brings a closed order back to life. */
export function isReopening(from: OrderStatus, to: OrderStatus): boolean {
  return isClosedOrderStatus(from) && !isClosedOrderStatus(to);
}
