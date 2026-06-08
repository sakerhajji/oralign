'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Banknote,
  CreditCard,
  ExternalLink,
  FileText,
  Landmark,
  ReceiptText,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  usePendingTreatmentFees,
  useTreatmentFeesHistory,
} from '@/lib/hooks';
import type { TreatmentFeeRow } from '@/lib/api/orders.service';
import { PaymentMethod, PaymentRecordStatus } from '@/lib/types';
import { TreatmentFeeReceiptDialog } from '@/components/orders/treatment-fee-receipt-dialog';

/**
 * Maps `PaymentMethod` → method label + icon + Tailwind color set.
 * Single source so the pending + history views read identically.
 */
const METHOD_META: Record<
  PaymentMethod,
  { label: string; Icon: typeof CreditCard; tone: string }
> = {
  [PaymentMethod.CARD]: {
    label: 'Card',
    Icon: CreditCard,
    tone: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  [PaymentMethod.BANK_TRANSFER]: {
    label: 'Bank transfer',
    Icon: Landmark,
    tone: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  [PaymentMethod.CASH]: {
    label: 'Cash',
    Icon: Banknote,
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
};

const STATUS_TONE: Record<PaymentRecordStatus, string> = {
  [PaymentRecordStatus.PENDING]: 'bg-amber-100 text-amber-800',
  [PaymentRecordStatus.AWAITING_CONFIRMATION]:
    'bg-blue-100 text-blue-800',
  [PaymentRecordStatus.SUCCESS]: 'bg-emerald-100 text-emerald-800',
  [PaymentRecordStatus.FAILED]: 'bg-red-100 text-red-800',
  [PaymentRecordStatus.REJECTED]: 'bg-red-100 text-red-800',
  [PaymentRecordStatus.CANCELLED]: 'bg-muted text-muted-foreground',
};

function PaymentMethodBadge({
  method,
}: {
  method: PaymentMethod | null;
}) {
  if (!method) return <span className="text-muted-foreground">—</span>;
  const meta = METHOD_META[method];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${meta.tone}`}
    >
      <meta.Icon className="size-3" />
      {meta.label}
    </span>
  );
}

function StatusBadge({
  status,
}: {
  status: PaymentRecordStatus | null;
}) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge
      variant="outline"
      className={`${STATUS_TONE[status]} border-transparent capitalize`}
    >
      {status.replace('_', ' ')}
    </Badge>
  );
}

/**
 * Row table primitive shared by the pending + history sections so
 * style stays in lockstep. `renderActions` lets callers slot in the
 * right-edge buttons per surface (Confirm on /pending; ExternalLink
 * to the order on /history).
 */
function TreatmentFeeTable({
  rows,
  isLoading,
  emptyMessage,
  renderActions,
  onViewProof,
}: {
  rows: TreatmentFeeRow[];
  isLoading: boolean;
  emptyMessage: string;
  renderActions: (row: TreatmentFeeRow) => React.ReactNode;
  /**
   * Optional click handler for the "View" button in the Proof column.
   * Renders a clickable affordance ONLY for bank-transfer rows that
   * carry a `proofPath`; non-bank-transfer rows always render a dash
   * because there is nothing to view. Wiring is opt-in so we don't
   * force every consumer to handle the dialog state.
   */
  onViewProof?: (row: TreatmentFeeRow) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Doctor / Patient</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Date</TableHead>
          {/*
            Proof column — meaningful only for bank-transfer rows. Card
            and cash rows always render "—" because there's no proof
            file to show. The button opens the shared
            TreatmentFeeReceiptDialog (same viewer the admin uses on
            the pending queue) so doctor-uploaded photos / PDFs render
            inline with click-to-zoom.
           */}
          <TableHead>Proof</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.orderId}>
            <TableCell className="font-medium">
              <Link
                href={`/dashboard/orders/${row.orderId}`}
                className="hover:underline"
              >
                {row.orderCode}
              </Link>
            </TableCell>
            <TableCell>
              <div className="text-sm">
                {row.doctor?.fullName ?? '—'}
              </div>
              <div className="text-xs text-muted-foreground">
                {row.patient?.fullName ?? ''}
              </div>
            </TableCell>
            <TableCell>
              <PaymentMethodBadge method={row.method} />
            </TableCell>
            <TableCell>
              <StatusBadge status={row.status} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.amount !== null ? `${row.amount} TND` : '—'}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {row.paidAt
                ? format(new Date(row.paidAt), 'MMM d, yyyy')
                : row.submittedAt
                  ? `Submitted ${format(
                      new Date(row.submittedAt),
                      'MMM d',
                    )}`
                  : '—'}
            </TableCell>
            <TableCell>
              {row.method === PaymentMethod.BANK_TRANSFER && row.proofPath && onViewProof ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => onViewProof(row)}
                  title="View the doctor-uploaded receipt"
                >
                  <FileText className="size-3" />
                  View
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">{renderActions(row)}</div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * "Treatment fees awaiting confirmation" — drop into the admin
 * /payments/pending page above the existing installment queue.
 * Renders nothing when there's nothing pending so the page doesn't
 * sprout an empty card on a clean queue.
 */
export function PendingTreatmentFeesSection() {
  const { data, isLoading } = usePendingTreatmentFees({ page: 1, limit: 20 });
  const rows = data?.data ?? [];
  // The currently-opened row drives the viewer modal. Holding the
  // full row lets us pass amount + doctor / patient context for the
  // dialog header without re-fetching.
  const [active, setActive] = useState<TreatmentFeeRow | null>(null);

  if (!isLoading && rows.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ReceiptText className="size-5 text-primary" />
                Treatment fees awaiting confirmation
              </CardTitle>
              <CardDescription>
                Doctor-uploaded bank-transfer receipts for the order&apos;s
                professional fee. Open the receipt to review the proof
                and confirm in one place.
              </CardDescription>
            </div>
            {data?.total ? (
              <Badge variant="secondary">{data.total} pending</Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <TreatmentFeeTable
            rows={rows}
            isLoading={isLoading}
            emptyMessage="No treatment fees waiting for confirmation."
            onViewProof={(row) => setActive(row)}
            renderActions={(row) => (
              <Button
                size="sm"
                variant="default"
                className="gap-1.5"
                onClick={() => setActive(row)}
              >
                <ReceiptText className="size-4" />
                Review &amp; confirm
              </Button>
            )}
          />
        </CardContent>
      </Card>

      {/*
        Single shared dialog instance — mounted only while a row is
        active so the blob-fetch hook doesn't churn on every render.
        Closes itself on confirm, which invalidates the queries so
        the row hops from pending → history.
       */}
      {active && (
        <TreatmentFeeReceiptDialog
          open={!!active}
          onOpenChange={(next) => {
            if (!next) setActive(null);
          }}
          orderId={active.orderId}
          orderCode={active.orderCode}
          proofPath={active.proofPath}
          amount={active.amount}
          currency="TND"
          doctorName={active.doctor?.fullName ?? null}
          patientName={active.patient?.fullName ?? null}
          method={active.method}
          submittedAt={active.submittedAt ?? active.updatedAt ?? null}
          canConfirm
        />
      )}
    </>
  );
}

/**
 * "Treatment fee history" — drop into the admin /payments/history
 * page. Hidden when there's no history yet so we don't ship an empty
 * card to fresh installations.
 */
export function TreatmentFeesHistorySection() {
  const { data, isLoading } = useTreatmentFeesHistory({ page: 1, limit: 20 });
  const rows = data?.data ?? [];
  // Active row whose receipt is being inspected in the modal viewer.
  // History rows are read-only — the dialog mounts with canConfirm
  // disabled because these fees are already settled.
  const [activeReceipt, setActiveReceipt] = useState<TreatmentFeeRow | null>(
    null,
  );

  if (!isLoading && rows.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ReceiptText className="size-5 text-primary" />
                Treatment fee payments
              </CardTitle>
              <CardDescription>
                Every treatment-fee payment across the system — card, bank
                transfer, and cash. Separate from installment payments
                below.
              </CardDescription>
            </div>
            {data?.total ? (
              <Badge variant="secondary">{data.total} total</Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <TreatmentFeeTable
            rows={rows}
            isLoading={isLoading}
            emptyMessage="No treatment-fee payments recorded yet."
            onViewProof={(row) => setActiveReceipt(row)}
            renderActions={(row) => (
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="gap-1"
                title="Open order"
              >
                <Link href={`/dashboard/orders/${row.orderId}`}>
                  <ExternalLink className="size-3.5" />
                  Order
                </Link>
              </Button>
            )}
          />
        </CardContent>
      </Card>

      {/*
        Shared dialog — same one the pending queue and the order-detail
        banner use. canConfirm=false because this surface is purely
        historical (the fee is already settled).
       */}
      {activeReceipt && (
        <TreatmentFeeReceiptDialog
          open={!!activeReceipt}
          onOpenChange={(next) => {
            if (!next) setActiveReceipt(null);
          }}
          orderId={activeReceipt.orderId}
          orderCode={activeReceipt.orderCode}
          proofPath={activeReceipt.proofPath}
          amount={activeReceipt.amount}
          currency="TND"
          doctorName={activeReceipt.doctor?.fullName ?? null}
          patientName={activeReceipt.patient?.fullName ?? null}
          method={activeReceipt.method}
          submittedAt={activeReceipt.paidAt ?? activeReceipt.submittedAt ?? null}
          canConfirm={false}
        />
      )}
    </>
  );
}
