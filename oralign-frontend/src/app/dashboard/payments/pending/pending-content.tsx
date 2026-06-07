'use client';

import { useState } from 'react';
import {
  usePendingConfirmations,
  useConfirmBankTransfer,
  useRejectBankTransfer,
} from '@/lib/hooks';
import { type Payment } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle2, XCircle } from 'lucide-react';
import {
  OpenQuoteButton,
  PaymentHistoryTable,
  type PaymentRow,
} from '@/components/payments/payment-history-table';
import { PendingTreatmentFeesSection } from '@/components/payments/treatment-fees-section';

export function PendingPaymentsContent() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePendingConfirmations({ page, limit: 20 });
  const confirm = useConfirmBankTransfer();
  const reject = useRejectBankTransfer();

  const [confirming, setConfirming] = useState<Payment | null>(null);
  const [rejecting, setRejecting] = useState<Payment | null>(null);
  const [notes, setNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  // Backend wraps the list in the canonical PaginatedResponse envelope
  // (`{ data, total, page, limit, totalPages }`); UI used to expect
  // `.items` and crashed on first render. Use `.data` consistently.
  const items = (data?.data ?? []) as PaymentRow[];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Pending payment confirmations
        </h1>
        <p className="text-sm text-muted-foreground">
          Doctor-declared bank transfers awaiting verification — both the
          per-order treatment fee and individual installments. Confirming
          a payment runs the SUCCESS transition: for installments the
          linked step batch unlocks; for treatment fees the order's
          treatment plan unlocks.
        </p>
      </header>

      {/*
        Treatment-fee bank-transfer receipts awaiting confirmation. The
        section returns null on an empty queue so we don't double-stack
        empty cards above the installment queue on a clean dashboard.
        It uses the same PaymentMethod / PaymentRecordStatus vocabulary
        as the installment payments below so admins read both with one
        mental model.
       */}
      <PendingTreatmentFeesSection />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Installment payments awaiting confirmation</CardTitle>
            <CardDescription>
              {data?.total ?? 0} payment{data?.total === 1 ? '' : 's'} in
              queue
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <PaymentHistoryTable
            payments={items}
            isLoading={isLoading}
            emptyMessage="Nothing to confirm — queue is empty."
            renderActions={(p) => (
              <>
                <OpenQuoteButton
                  orderId={p.order?.id ?? p.quotation?.orderId}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setConfirming(p);
                    setNotes('');
                  }}
                >
                  <CheckCircle2 className="mr-1 size-4" />
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    setRejecting(p);
                    setRejectionReason('');
                  }}
                >
                  <XCircle className="mr-1 size-4" />
                  Reject
                </Button>
              </>
            )}
          />
        </CardContent>
      </Card>

      {/* Pagination — simple prev/next; the queue is normally small. */}
      {data && data.totalPages > 1 ? (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm bank transfer</DialogTitle>
            <DialogDescription>
              The linked installment will be marked paid and the step
              batch will unlock. This action is logged with your user id.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. matched on statement line 2026-05-22"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              disabled={confirm.isPending}
              onClick={() => {
                if (!confirming) return;
                confirm.mutate(
                  { paymentId: confirming.id, dto: { notes } },
                  { onSuccess: () => setConfirming(null) },
                );
              }}
            >
              Confirm payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!rejecting}
        onOpenChange={(o) => !o && setRejecting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject bank transfer</DialogTitle>
            <DialogDescription>
              The payment will be marked rejected. The doctor can declare
              a fresh transfer afterwards; previous attempts stay in the
              audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reason">Rejection reason *</Label>
            <Textarea
              id="reason"
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Required — shown to the doctor."
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectionReason.trim() || reject.isPending}
              onClick={() => {
                if (!rejecting) return;
                reject.mutate(
                  {
                    paymentId: rejecting.id,
                    dto: { rejectionReason: rejectionReason.trim() },
                  },
                  { onSuccess: () => setRejecting(null) },
                );
              }}
            >
              Reject payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
