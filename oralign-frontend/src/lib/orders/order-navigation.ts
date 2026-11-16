import {
  OrderStatus,
  OrderType,
  type DentalOrder,
  type SupplementalKind,
} from '@/lib/types';

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

// ─── Supplemental orders (children of an initial case) ──────────────────────

/**
 * The shape every order row of the app carries (orders list, dashboard,
 * patient list): enough to tell a child from its case and to route it.
 */
export interface OrderKindRef {
  id: string;
  orderType: OrderType;
  parentOrderId?: string | null;
}

/** Element id of the supplemental requests section on a case's page. */
export const SUPPLEMENTAL_REQUESTS_ANCHOR = 'supplemental-requests';

export function isSupplementalOrder<T extends Pick<OrderKindRef, 'orderType'>>(
  order: T,
): order is T & { orderType: SupplementalKind } {
  return order.orderType !== OrderType.INITIAL;
}

/** Dictionary key of a child's kind ("Aligner replacement"…); null for a case. */
export function orderKindLabelKey(
  order: Pick<OrderKindRef, 'orderType'>,
): string | null {
  return isSupplementalOrder(order) ? `supplemental.type.${order.orderType}` : null;
}

/**
 * Whether an order still has an editor to open. A child is only ever
 * edited as a draft, in its own wizard: once submitted the request is
 * frozen and the generic order endpoints refuse it.
 */
export function hasOrderEditor(
  order: Pick<OrderKindRef, 'orderType'> & Pick<DentalOrder, 'status'>,
): boolean {
  return !isSupplementalOrder(order) || order.status === OrderStatus.DRAFT;
}

/** Query parameters of `/dashboard/orders/[id]/supplemental/new`. */
export const SUPPLEMENTAL_WIZARD_QUERY = {
  type: 'type',
  requestId: 'requestId',
} as const;

/** The supplemental wizard of a case, for a kind (and a draft to resume). */
export function buildSupplementalWizardHref(target: {
  parentOrderId: string;
  type: SupplementalKind;
  requestId?: string | null;
}): string {
  const params = new URLSearchParams({
    [SUPPLEMENTAL_WIZARD_QUERY.type]: target.type,
  });
  if (target.requestId) {
    params.set(SUPPLEMENTAL_WIZARD_QUERY.requestId, target.requestId);
  }
  return `/dashboard/orders/${target.parentOrderId}/supplemental/new?${params.toString()}`;
}

/**
 * The editor of an order: the initial order wizard for a case, the
 * supplemental wizard of its parent for a child. A child that lost its
 * parent link has no editor and falls back to its own page, so the
 * initial-order edit page can never redirect to itself.
 */
export function buildOrderEditHref(order: OrderKindRef): string {
  if (!isSupplementalOrder(order)) return `/dashboard/orders/${order.id}/edit`;
  if (!order.parentOrderId) return `/dashboard/orders/${order.id}`;
  return buildSupplementalWizardHref({
    parentOrderId: order.parentOrderId,
    type: order.orderType,
    requestId: order.id,
  });
}

/** The page of the case a child belongs to; the order itself for a case. */
export function buildParentCaseHref(order: OrderKindRef): string {
  const caseId = isSupplementalOrder(order)
    ? (order.parentOrderId ?? order.id)
    : order.id;
  return `/dashboard/orders/${caseId}`;
}

/** The supplemental requests section of a case's page. */
export function buildSupplementalRequestsHref(order: OrderKindRef): string {
  return `${buildParentCaseHref(order)}#${SUPPLEMENTAL_REQUESTS_ANCHOR}`;
}
