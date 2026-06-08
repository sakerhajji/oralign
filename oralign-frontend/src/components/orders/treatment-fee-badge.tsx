'use client';

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  OrderStatus,
  PaymentRecordStatus,
  type DentalOrder,
} from '@/lib/types';

/**
 * Derived treatment-fee status surfaced on every order row.
 *
 * The treatment fee lifecycle is ORTHOGONAL to the order lifecycle
 * (an order can be SUBMITTED with paid OR unpaid fee, etc.) — so we
 * don't pollute the OrderStatus enum with payment values. Instead we
 * derive one of four UI states from the two fields the backend
 * already returns:
 *
 *   • Paid       — treatmentFeePaidAt is stamped → unblocks treatment
 *                  plan creation. Green pill.
 *   • Pending    — status = awaiting_confirmation → doctor uploaded a
 *                  bank-transfer receipt, admin needs to verify. Blue
 *                  pill with a clock icon so the admin spots it in a
 *                  scan of the orders list.
 *   • Rejected   — admin rejected a previous attempt → doctor needs to
 *                  re-declare. Red pill (rare but possible state).
 *   • Unpaid     — no payment recorded yet → the doctor still owes the
 *                  fee. Amber pill.
 *
 * Returns null for orders where the fee is moot (e.g. DRAFT or
 * CANCELED) so we don't ship visual noise on rows that genuinely
 * don't care about the fee yet.
 */

type FeeState = 'paid' | 'pending' | 'rejected' | 'unpaid';

const META: Record<
  FeeState,
  { label: string; tone: string; Icon: typeof CheckCircle2 }
> = {
  paid: {
    label: 'Fee paid',
    tone: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Icon: CheckCircle2,
  },
  pending: {
    label: 'Fee pending',
    tone: 'bg-blue-100 text-blue-700 border-blue-200',
    Icon: Clock,
  },
  rejected: {
    label: 'Fee rejected',
    tone: 'bg-red-100 text-red-700 border-red-200',
    Icon: XCircle,
  },
  unpaid: {
    label: 'Fee unpaid',
    tone: 'bg-amber-100 text-amber-800 border-amber-200',
    Icon: AlertCircle,
  },
};

/**
 * Resolve the fee state from the order. Pure function — easy to unit
 * test, easy to reuse in filter chips or summary KPIs later.
 *
 * Returns `null` when the badge should be hidden:
 *   • Order is still a DRAFT (doctor hasn't submitted yet — no fee due)
 *   • Order is CANCELED (no fee will ever be due on a dead row)
 *
 * Everything else gets a badge so the absence of one is a meaningful
 * "this row doesn't apply" signal, not "the data is missing".
 */
export function resolveTreatmentFeeState(
  order: Pick<
    DentalOrder,
    'status' | 'treatmentFeePaidAt' | 'treatmentFeePaymentStatus'
  >,
): FeeState | null {
  // Rows where the fee is moot — return null so the badge column
  // doesn't render an extra chip for them.
  if (
    order.status === OrderStatus.DRAFT ||
    order.status === OrderStatus.CANCELED ||
    order.status === OrderStatus.CANCELLED
  ) {
    return null;
  }

  // `treatmentFeePaidAt` is the source of truth — once stamped, the
  // fee is settled regardless of how it got there (card, cash, or
  // admin-confirmed bank transfer).
  if (order.treatmentFeePaidAt) return 'paid';

  switch (order.treatmentFeePaymentStatus) {
    case PaymentRecordStatus.AWAITING_CONFIRMATION:
      return 'pending';
    case PaymentRecordStatus.REJECTED:
    case PaymentRecordStatus.FAILED:
      return 'rejected';
    // PENDING / null / undefined / CANCELLED / SUCCESS-without-paidAt:
    // treat them all as "doctor still owes" so admins see a clear
    // action item.
    default:
      return 'unpaid';
  }
}

export function TreatmentFeeBadge({
  order,
  className,
}: {
  order: Pick<
    DentalOrder,
    'status' | 'treatmentFeePaidAt' | 'treatmentFeePaymentStatus'
  >;
  className?: string;
}) {
  const state = resolveTreatmentFeeState(order);
  if (!state) return null;
  const { label, tone, Icon } = META[state];
  return (
    <Badge
      variant="outline"
      // `gap-1` keeps the icon and label tight; `border-transparent`
      // because the tone class already supplies its own bordered look.
      className={cn(
        'gap-1 border font-medium',
        tone,
        className,
      )}
      title={label}
    >
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
