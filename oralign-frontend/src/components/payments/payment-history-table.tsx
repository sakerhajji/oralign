'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Banknote,
  CreditCard,
  ExternalLink,
  FileText,
  Landmark,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { PaymentMethod, PaymentRecordStatus, type Payment } from '@/lib/types';
import { cn } from '@/lib/utils';
import { TreatmentFeeReceiptDialog } from '@/components/orders/treatment-fee-receipt-dialog';

/**
 * Shared payment-history table used by:
 *  • /dashboard/payments/history   (role-aware — admin sees every
 *                                   payment in the system, dentist
 *                                   sees only their own)
 *  • /dashboard/payments/pending   (admin queue — same row layout
 *                                   with extra action buttons the
 *                                   caller renders via `renderActions`)
 *
 * Legacy `/account/billing` and `/dashboard/payments/mine` routes
 * now permanent-redirect to /dashboard/payments/history.
 *
 * Reuses the existing PaginatedResponse envelope and exposes a single
 * `renderActions` slot for queue-specific buttons (Confirm / Reject)
 * so the consumer keeps the imperative side-effects but the visual
 * grammar stays identical across all surfaces.
 */

export interface PaymentRow extends Payment {
  // The list endpoints already include this — type it inline so the
  // table component compiles against the real shape without forcing
  // every caller to widen the global Payment type.
  order?: {
    id: string;
    orderCode: string;
    doctor?: { id: string; fullName: string } | null;
    patient?: { id: string; fullName: string } | null;
  } | null;
  quotation?: {
    id: string;
    orderId: string;
    packName?: string | null;
  } | null;
  installment?: {
    id: string;
    installmentNumber: number;
    amount: string;
  } | null;
}

// Each method gets its own icon + colour palette so the column reads at
// a glance — green for cash (physical), indigo for cards (gateway),
// slate for bank transfers (manual confirmation).
const METHOD_META: Record<
  PaymentMethod,
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  [PaymentMethod.CARD]: {
    label: 'Card',
    icon: CreditCard,
    tone: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  },
  [PaymentMethod.BANK_TRANSFER]: {
    label: 'Bank transfer',
    icon: Landmark,
    tone: 'border-slate-200 bg-slate-50 text-slate-800',
  },
  [PaymentMethod.CASH]: {
    label: 'Cash',
    icon: Banknote,
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
};

/**
 * Renders the method as a coloured chip — icon + label — so admins
 * can sweep the column and spot e.g. "all the bank transfers awaiting
 * confirmation" without reading each row.
 */
function MethodChip({ method }: { method?: PaymentMethod }) {
  if (!method) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const meta = METHOD_META[method];
  if (!meta) {
    return (
      <Badge variant="outline" className="font-normal">
        {method}
      </Badge>
    );
  }
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        meta.tone,
      )}
    >
      <Icon className="size-3.5" />
      {meta.label}
    </span>
  );
}

function statusBadge(status: PaymentRecordStatus): React.ReactNode {
  switch (status) {
    case PaymentRecordStatus.SUCCESS:
      return <Badge className="bg-emerald-600">Success</Badge>;
    case PaymentRecordStatus.AWAITING_CONFIRMATION:
      return <Badge className="bg-amber-500">Awaiting confirmation</Badge>;
    case PaymentRecordStatus.PENDING:
      return <Badge variant="secondary">Pending</Badge>;
    case PaymentRecordStatus.REJECTED:
      return <Badge variant="destructive">Rejected</Badge>;
    case PaymentRecordStatus.FAILED:
      return <Badge variant="destructive">Failed</Badge>;
    case PaymentRecordStatus.CANCELLED:
      return <Badge variant="outline">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

/**
 * Whether the row carries a viewable bank-transfer receipt. Only
 * bank_transfer payments produce a proofUrl; card / cash rows skip
 * the column entirely. Used to decide whether to render the "View"
 * button or the dash placeholder.
 */
function hasProof(payment: PaymentRow): boolean {
  return Boolean(payment.proofUrl);
}

export function PaymentHistoryTable({
  payments,
  isLoading,
  emptyMessage = 'No payments yet.',
  showActor = true,
  renderActions,
}: {
  payments: PaymentRow[];
  isLoading: boolean;
  emptyMessage?: string;
  /** Show the doctor + patient column (off on the doctor's own page). */
  showActor?: boolean;
  /** Per-row action buttons — Confirm/Reject on the pending queue. */
  renderActions?: (p: PaymentRow) => React.ReactNode;
}) {
  // Active row whose receipt is being inspected in the modal viewer.
  // We hoist it to the table (not each row) so only ONE dialog is
  // mounted at any time, no matter how many rows the page renders.
  const [activeReceipt, setActiveReceipt] = useState<PaymentRow | null>(null);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="flex min-h-32 items-center justify-center p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          {showActor ? <TableHead>Doctor · patient</TableHead> : null}
          <TableHead>Order</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Installment</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Proof</TableHead>
          {renderActions ? <TableHead className="text-right">Actions</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p) => {
          const orderId = p.order?.id ?? p.quotation?.orderId;
          const proofAvailable = hasProof(p);
          return (
            <TableRow key={p.id}>
              <TableCell className="text-xs">
                {new Date(p.createdAt).toLocaleString()}
              </TableCell>
              {showActor ? (
                <TableCell className="text-xs">
                  {p.order?.doctor?.fullName ? (
                    <div className="font-medium">{p.order.doctor.fullName}</div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  {p.order?.patient?.fullName ? (
                    <div className="text-muted-foreground">
                      {p.order.patient.fullName}
                    </div>
                  ) : null}
                </TableCell>
              ) : null}
              <TableCell className="text-xs">
                {orderId && p.order?.orderCode ? (
                  <Link
                    href={`/dashboard/orders/${orderId}?tab=quote`}
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    <FileText className="size-3" />
                    {p.order.orderCode}
                    <ExternalLink className="size-3" />
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                {p.quotation?.packName ? (
                  <div className="text-muted-foreground">
                    {p.quotation.packName}
                  </div>
                ) : null}
              </TableCell>
              <TableCell>
                {/* `paymentMethod` is the wire field name (Prisma
                    column). `method` is the legacy alias still kept
                    on the Payment type for backward compat — we
                    fall through to it so older API payloads keep
                    rendering instead of showing "—". */}
                <MethodChip method={p.paymentMethod ?? p.method} />
              </TableCell>
              <TableCell className="text-xs">
                {p.installment ? (
                  <>
                    #{p.installment.installmentNumber}
                    <div className="text-muted-foreground">
                      {p.installment.amount} {p.currency}
                    </div>
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="font-mono">
                {p.amount} {p.currency}
              </TableCell>
              <TableCell>{statusBadge(p.status)}</TableCell>
              <TableCell>
                {proofAvailable ? (
                  // Opens the shared receipt viewer — same modal the
                  // treatment-fee admin queue + order detail use. The
                  // old <a href={proof}> link 404'd on the frontend
                  // origin because proofUrl is a backend-relative path;
                  // the dialog resolves it correctly via
                  // resolveUploadUrl + renders inline.
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => setActiveReceipt(p)}
                    title="View the doctor-uploaded receipt"
                  >
                    <FileText className="size-3" />
                    View
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              {renderActions ? (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">{renderActions(p)}</div>
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>

    {/*
      Single dialog for ALL rows — mounted only while a row is active
      so the dialog's internal hooks (lightbox, etc.) don't churn for
      every row in the table. canConfirm is always false here because
      this is a history view: the row is either already settled or
      sitting in the pending queue (where the dedicated Confirm /
      Reject buttons in `renderActions` handle the action).
     */}
    {activeReceipt && (
      <TreatmentFeeReceiptDialog
        open={!!activeReceipt}
        onOpenChange={(next) => {
          if (!next) setActiveReceipt(null);
        }}
        orderId={activeReceipt.order?.id ?? activeReceipt.quotation?.orderId ?? ''}
        orderCode={activeReceipt.order?.orderCode ?? '—'}
        proofPath={activeReceipt.proofUrl ?? null}
        amount={Number(activeReceipt.amount ?? 0)}
        currency={activeReceipt.currency ?? 'TND'}
        doctorName={activeReceipt.order?.doctor?.fullName ?? null}
        patientName={activeReceipt.order?.patient?.fullName ?? null}
        method={activeReceipt.paymentMethod ?? activeReceipt.method ?? null}
        submittedAt={activeReceipt.createdAt}
        canConfirm={false}
      />
    )}
    </>
  );
}

/**
 * Small helper for the per-row "Open quote" button used in the
 * pending queue — colocated here so the same wording + icon shows up
 * everywhere we link back to the quotation surface.
 */
export function OpenQuoteButton({ orderId }: { orderId: string | undefined }) {
  if (!orderId) return null;
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={`/dashboard/orders/${orderId}?tab=quote`}>
        <FileText className="mr-1 size-3" />
        Open quote
      </Link>
    </Button>
  );
}
