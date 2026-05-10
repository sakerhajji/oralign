'use client';

import { Badge } from '@/components/ui/badge';
import { OrderStatus } from '@/lib/types';

const statusLabel: Record<OrderStatus, string> = {
  [OrderStatus.DRAFT]: 'Draft',
  [OrderStatus.SUBMITTED]: 'Submitted',
  [OrderStatus.IN_REVIEW]: 'In review',
  [OrderStatus.APPROVED]: 'Approved',
  [OrderStatus.REJECTED]: 'Rejected',
  [OrderStatus.CANCELLED]: 'Cancelled',
};

const statusClassName: Record<OrderStatus, string> = {
  [OrderStatus.DRAFT]: 'bg-slate-100 text-slate-700',
  [OrderStatus.SUBMITTED]: 'bg-blue-100 text-blue-700',
  [OrderStatus.IN_REVIEW]: 'bg-primary/10 text-primary',
  [OrderStatus.APPROVED]: 'bg-emerald-100 text-emerald-700',
  [OrderStatus.REJECTED]: 'bg-red-100 text-red-700',
  [OrderStatus.CANCELLED]: 'bg-zinc-100 text-zinc-700',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant="secondary" className={statusClassName[status]}>
      {statusLabel[status]}
    </Badge>
  );
}
