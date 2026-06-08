'use client';

import { Badge } from '@/components/ui/badge';
import { OrderStatus } from '@/lib/types';
import { useT } from '@/lib/i18n/lang-context';

/**
 * English fallback labels. Used only as a last-resort backstop when
 * the i18n dictionary doesn't carry an entry (e.g. a brand-new enum
 * value lands before translations are committed). Real labels come
 * from `dict.orders.statusLabel.*` via `t()`.
 */
const STATUS_LABEL: Record<OrderStatus, string> = {
  // Submission
  [OrderStatus.DRAFT]:                 'Draft',
  [OrderStatus.SUBMITTED]:             'Submitted',
  [OrderStatus.UNDER_REVIEW]:          'Under review',
  // Treatment planning
  [OrderStatus.TREATMENT_PLANNING]:    'Treatment planning',
  [OrderStatus.TREATMENT_PLAN_READY]:  'Treatment ready',
  [OrderStatus.REVISION_REQUESTED]:    'Revision requested',
  [OrderStatus.TREATMENT_APPROVED]:    'Treatment approved',
  // Quote + payment
  [OrderStatus.QUOTATION_SENT]:        'Quotation sent',
  [OrderStatus.PAYMENT_PLAN_SELECTED]: 'Payment plan selected',
  [OrderStatus.PAYMENT_PENDING]:       'Payment pending',
  [OrderStatus.PAYMENT_REVIEW]:        'Payment review',
  [OrderStatus.PAID]:                  'Paid',
  // Production
  [OrderStatus.FABRICATION]:           'Fabrication',
  [OrderStatus.READY_TO_SHIP]:         'Ready to ship',
  [OrderStatus.SHIPPED]:               'Shipped',
  [OrderStatus.FINISHED]:              'Finished',
  // Terminal
  [OrderStatus.CANCELED]:              'Canceled',
  // Legacy
  [OrderStatus.IN_REVIEW]:             'In review',
  [OrderStatus.APPROVED]:              'Approved',
  [OrderStatus.REJECTED]:              'Rejected',
  [OrderStatus.CANCELLED]:             'Cancelled',
};

/**
 * Colour palette per lifecycle phase. Grey for early phases, blue for
 * planning, purple for billing, amber for fabrication, green for paid /
 * finished, red for terminal failures. Easy to scan across a list page.
 */
const STATUS_CLASSNAME: Record<OrderStatus, string> = {
  [OrderStatus.DRAFT]:                 'bg-slate-100 text-slate-700',
  [OrderStatus.SUBMITTED]:             'bg-blue-100 text-blue-700',
  [OrderStatus.UNDER_REVIEW]:          'bg-blue-100 text-blue-700',

  [OrderStatus.TREATMENT_PLANNING]:    'bg-indigo-100 text-indigo-700',
  [OrderStatus.TREATMENT_PLAN_READY]:  'bg-amber-100 text-amber-700',
  [OrderStatus.REVISION_REQUESTED]:    'bg-orange-100 text-orange-700',
  [OrderStatus.TREATMENT_APPROVED]:    'bg-emerald-100 text-emerald-700',

  [OrderStatus.QUOTATION_SENT]:        'bg-purple-100 text-purple-700',
  [OrderStatus.PAYMENT_PLAN_SELECTED]: 'bg-purple-100 text-purple-700',
  [OrderStatus.PAYMENT_PENDING]:       'bg-amber-100 text-amber-700',
  [OrderStatus.PAYMENT_REVIEW]:        'bg-amber-100 text-amber-700',
  [OrderStatus.PAID]:                  'bg-emerald-100 text-emerald-700',

  [OrderStatus.FABRICATION]:           'bg-cyan-100 text-cyan-700',
  [OrderStatus.READY_TO_SHIP]:         'bg-teal-100 text-teal-700',
  [OrderStatus.SHIPPED]:               'bg-teal-100 text-teal-700',
  [OrderStatus.FINISHED]:              'bg-emerald-100 text-emerald-700',

  [OrderStatus.CANCELED]:              'bg-red-100 text-red-700',
  // Legacy
  [OrderStatus.IN_REVIEW]:             'bg-primary/10 text-primary',
  [OrderStatus.APPROVED]:              'bg-emerald-100 text-emerald-700',
  [OrderStatus.REJECTED]:              'bg-red-100 text-red-700',
  [OrderStatus.CANCELLED]:             'bg-zinc-100 text-zinc-700',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useT();
  // Try the i18n dictionary first; fall back to the English STATUS_LABEL
  // map; fall back to the raw enum value as a last resort. The triple
  // fallback means a backend-side enum addition never crashes the row —
  // the badge degrades gracefully through three tiers.
  const dictKey = `orders.statusLabel.${status}`;
  const dictHit = t(dictKey);
  const label =
    dictHit !== dictKey ? dictHit : (STATUS_LABEL[status] ?? String(status));
  const className =
    STATUS_CLASSNAME[status] ?? 'bg-zinc-100 text-zinc-700';
  return (
    <Badge variant="secondary" className={className}>
      {label}
    </Badge>
  );
}

// Re-exports so other components (status-change dialog, filter chips)
// can reuse the same maps without duplicating them.
export { STATUS_LABEL as orderStatusLabel };
export { STATUS_CLASSNAME as orderStatusClassName };
