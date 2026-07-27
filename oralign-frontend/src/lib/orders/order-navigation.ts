import { OrderStatus, type DentalOrder } from '@/lib/types';

export type OrderDetailRouteTab = 'order' | 'treatment-plans' | 'quote';

type RouterLike = {
  push: (href: string) => void;
};

const TREATMENT_STATUSES = new Set<OrderStatus>([
  OrderStatus.TREATMENT_PLANNING,
  OrderStatus.TREATMENT_PLAN_READY,
  OrderStatus.REVISION_REQUESTED,
  OrderStatus.TREATMENT_APPROVED,
]);

const QUOTE_AND_PAYMENT_STATUSES = new Set<OrderStatus>([
  OrderStatus.QUOTATION_SENT,
  OrderStatus.PAYMENT_PLAN_SELECTED,
  OrderStatus.PAYMENT_PENDING,
  OrderStatus.PAYMENT_REVIEW,
  OrderStatus.PAID,
  OrderStatus.FABRICATION,
  OrderStatus.READY_TO_SHIP,
  OrderStatus.SHIPPED,
  OrderStatus.FINISHED,
]);

export function getOrderWorkflowTab(
  order: Pick<
    DentalOrder,
    'status' | 'latestPlanStatus' | 'treatmentPlansCount'
  >,
): OrderDetailRouteTab {
  if (QUOTE_AND_PAYMENT_STATUSES.has(order.status)) {
    return 'quote';
  }

  if (
    TREATMENT_STATUSES.has(order.status) ||
    (order.treatmentPlansCount ?? 0) > 0 ||
    !!order.latestPlanStatus
  ) {
    return 'treatment-plans';
  }

  return 'order';
}

export function safeDashboardReturnTo(value?: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith('/dashboard')) return null;
  if (value.startsWith('//')) return null;
  return value;
}

export function buildOrderNavigationHref(
  order: Pick<
    DentalOrder,
    'id' | 'status' | 'latestPlanStatus' | 'treatmentPlansCount'
  >,
  options?: {
    returnTo?: string | null;
  },
): string {
  const params = new URLSearchParams();
  const tab = getOrderWorkflowTab(order);
  const returnTo = safeDashboardReturnTo(options?.returnTo);

  if (tab !== 'order') {
    params.set('tab', tab);
  }
  if (returnTo) {
    params.set('returnTo', returnTo);
  }

  const query = params.toString();
  return `/dashboard/orders/${order.id}${query ? `?${query}` : ''}`;
}

export function handleOrderNavigation(
  order: Pick<
    DentalOrder,
    'id' | 'status' | 'latestPlanStatus' | 'treatmentPlansCount'
  >,
  router: RouterLike,
  options?: {
    returnTo?: string | null;
  },
) {
  router.push(buildOrderNavigationHref(order, options));
}
