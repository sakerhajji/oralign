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
import { useT } from '@/lib/i18n/lang-context';

export function PendingPaymentsContent() {
  const { t } = useT();
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
  const totalCount = data?.total ?? 0;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('paymentsPending.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('paymentsPending.subtitle')}
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
            <CardTitle>{t('paymentsPending.installmentsCardTitle')}</CardTitle>
            <CardDescription>
              {totalCount === 1
                ? t('paymentsPending.queueCountOne')
                : t('paymentsPending.queueCountMany', { count: totalCount })}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <PaymentHistoryTable
            payments={items}
            isLoading={isLoading}
            emptyMessage={t('paymentsPending.queueEmpty')}
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
                  {t('paymentsPending.confirm')}
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
                  {t('paymentsPending.reject')}
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
            {t('paymentsHistory.pageOf', {
              page: data.page,
              total: data.totalPages,
            })}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('paymentsCommon.actions.previous')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('paymentsCommon.actions.next')}
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
            <DialogTitle>{t('paymentsPending.confirmDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('paymentsPending.confirmDialogDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="notes">{t('paymentsPending.notesLabel')}</Label>
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('paymentsPending.notesPh')}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              {t('paymentsPending.cancel')}
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
              {t('paymentsPending.confirmPayment')}
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
            <DialogTitle>{t('paymentsPending.rejectDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('paymentsPending.rejectDialogDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reason">
              {t('paymentsPending.rejectReasonLabel')}
            </Label>
            <Textarea
              id="reason"
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder={t('paymentsPending.rejectReasonPh')}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              {t('paymentsPending.cancel')}
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
              {t('paymentsPending.rejectPayment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
