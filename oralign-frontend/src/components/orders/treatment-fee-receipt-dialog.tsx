'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Banknote,
  Calendar,
  CheckCircle2,
  CreditCard,
  FilePen,
  FileText,
  Landmark,
  Loader2,
  Stethoscope,
  User,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PaymentStatusBadge } from '@/components/payments/payment-status-badge';
import {
  REASON_MAX,
  REASON_MIN,
  confirmProblem,
  isAlreadyProcessed,
} from '@/components/payments/pending/queue-format';
import { ReceiptViewer } from '@/components/payments/pending/receipt-viewer';
import { formatRate, recordedSplit } from '@/components/payments/withholding';
import { extractApiError } from '@/lib/api/error';
import type { TransferRef } from '@/lib/api/transfer-queue.service';
import { useConfirmTransfer, useOpenTransferReview } from '@/lib/hooks/use-transfer-queue';
import { cn } from '@/lib/utils';
import { formatBusinessDay } from '@/lib/utils/business-day';
import { formatPrice } from '@/lib/utils/currency';
import { useT } from '@/lib/i18n/lang-context';
import { PaymentMethod, PaymentRecordStatus } from '@/lib/types';

/**
 * The dentist's bank-transfer proof (justificatif), with the admin's
 * confirmation when the caller allows it: the order page's fee banner
 * opens it for an admin. (The payments history desk and the pending desk
 * have their own viewers: ReceiptViewerDialog, TransferReviewDialog.)
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │ Bank transfer proof     [To be confirmed]        X │
 *   │ Order ORD-1234                                       │
 *   ├──────────────────────────┬──────────────────────────┤
 *   │    [Proof]               │  Patient · Doctor         │
 *   │    image / PDF           │  Amount · Method · Date   │
 *   ├──────────────────────────┴──────────────────────────┤
 *   │                       [Cancel]  [✓ Confirm payment] │
 *   └─────────────────────────────────────────────────────┘
 *
 * Receipts are private (DECISIONS §1): the bytes come from the
 * authenticated proof stream (GET orders/:id/treatment-fee/proof, or GET
 * payments/:paymentId/proof for an installment) as a blob shown from a
 * local URL, never from a public /uploads path. The owning dentist and
 * admins may read it; anyone else gets « Reçu introuvable ».
 *
 * An admin who opens an awaiting fee to confirm it stamps its review
 * (« À vérifier » for the doctor) and reads his own notification of it.
 * A fee declared without a receipt is confirmed only with a
 * justification note.
 */
export interface TreatmentFeeReceiptDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** The order the fee (or the installment) belongs to. */
  orderId: string;
  /** Shown in the header so the admin knows which order they're looking at. */
  orderCode: string;
  /**
   * The installment's Payment, when `kind` is 'installment': its receipt
   * is read from GET payments/:paymentId/proof.
   */
  paymentId?: string | null;
  /**
   * Whether a receipt is attached (the API's hasProof / treatmentFeeHasProof).
   * The file itself always comes through the authenticated stream; without
   * one, confirming needs a justification note.
   */
  hasProof: boolean;
  /**
   * The declaration's instant (treatmentFeeDeclaredAt), when known: a
   * re-uploaded receipt is fetched afresh, and Confirm sends it so a
   * receipt replaced meanwhile is refused (409) instead of confirmed
   * unseen. The cache falls back to `submittedAt`; Confirm sends nothing.
   */
  declaredAt?: string | null;
  /**
   * Amount the doctor declared: the cash (due + stamp - any retenue) —
   * surfaced in the details column.
   */
  amount: number | null | undefined;
  /**
   * Retenue à la source the practitioner kept back, and its rate. With a
   * retenue or a stamp, the details show the amount due (TTC), the droit
   * de timbre, the retenue and the amount paid.
   */
  withholdingAmount?: number | string | null;
  withholdingRate?: number | string | null;
  /** Droit de timbre charged on top with the payment (0 / null before 2026-11-20). */
  stampAmount?: number | string | null;
  /** What the payment settles, when the API sends it (else amount + retenue - stamp). */
  settledAmount?: number | string | null;
  /** Labels the amount due: an installment (default) or a treatment fee. */
  kind?: 'installment' | 'fee';
  /** Currency code, defaults to TND if unset. */
  currency?: string;
  /** Doctor / patient context for the details column. */
  doctorName?: string | null;
  patientName?: string | null;
  /** Payment method — usually `bank_transfer`. Surfaces a labelled chip. */
  method?: PaymentMethod | null;
  /** ISO date string when the doctor uploaded the proof (or recorded intent). */
  submittedAt?: string | null;
  /**
   * What `submittedAt` is: the day the transfer was declared (default),
   * or the day it was paid.
   */
  dateLabel?: 'submitted' | 'paid';
  /**
   * The payment's status for the header badge. Defaults to awaiting
   * confirmation, the state of every proof opened to be confirmed; the
   * payments history passes the row's real status.
   */
  status?: PaymentRecordStatus | null;
  /**
   * When true the modal renders the "Confirm payment" footer button.
   * Drives off the caller's authz check + the order's current status.
   */
  canConfirm: boolean;
  /** Optional success callback (parent closes the dialog + refreshes). */
  onConfirmed?: () => void;
  /**
   * Another action for the footer, beside Close — e.g. the way to the
   * queue where an installment transfer is confirmed.
   */
  footerAction?: ReactNode;
}

/** Epoch ms of an ISO instant, or 0: the cache identity of a fee receipt. */
function epochOf(iso: string | null | undefined): number {
  const ms = iso ? new Date(iso).getTime() : Number.NaN;
  return Number.isFinite(ms) && ms >= 0 ? Math.trunc(ms) : 0;
}

export function TreatmentFeeReceiptDialog({
  open,
  onOpenChange,
  orderId,
  orderCode,
  paymentId,
  hasProof,
  declaredAt,
  amount,
  withholdingAmount,
  withholdingRate,
  stampAmount,
  settledAmount,
  kind = 'installment',
  currency = 'TND',
  doctorName,
  patientName,
  method,
  submittedAt,
  dateLabel = 'submitted',
  status = PaymentRecordStatus.AWAITING_CONFIRMATION,
  canConfirm,
  onConfirmed,
  footerAction,
}: TreatmentFeeReceiptDialogProps) {
  const { t, lang } = useT();
  const withProof = hasProof;
  // The receipt's address and cache identity (the subject key shape).
  const transfer = useMemo<TransferRef | null>(
    () =>
      kind === 'fee'
        ? { kind: 'treatment_fee', orderId, paymentId: null }
        : paymentId
          ? { kind: 'installment', orderId, paymentId }
          : null,
    [kind, orderId, paymentId],
  );
  const cacheKey = transfer
    ? transfer.kind === 'installment'
      ? `installment:${transfer.paymentId}`
      : `treatment_fee:${orderId}:${epochOf(declaredAt ?? submittedAt)}`
    : null;
  // Confirming needs a route: an installment without its payment id has none.
  const confirmable = canConfirm && transfer !== null;
  const awaiting = status === PaymentRecordStatus.AWAITING_CONFIRMATION;

  const confirm = useConfirmTransfer();
  const openReview = useOpenTransferReview();
  const [overrideNote, setOverrideNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const overrideId = useId();
  const split = recordedSplit(amount, withholdingAmount, withholdingRate, stampAmount, settledAmount);

  // An admin opening an awaiting transfer to decide on it stamps the review
  // once per opening (idempotent server-side).
  const stamped = useRef(false);
  const { mutate: stampReview } = openReview;
  useEffect(() => {
    if (!open) {
      stamped.current = false;
      return;
    }
    if (!confirmable || !awaiting || !transfer || stamped.current) return;
    stamped.current = true;
    stampReview({ ref: transfer });
  }, [open, confirmable, awaiting, transfer, stampReview]);

  const problem = confirmProblem({ hasProof: withProof, overrideNote, notes: '' });
  const overrideError =
    touched && problem === 'override' ? t('pendingDesk.review.tooShort', { min: REASON_MIN }) : null;

  const sendConfirm = () => {
    if (!transfer) return;
    setTouched(true);
    if (problem) return;
    setFailure(null);
    confirm.mutate(
      {
        ref: transfer,
        body: {
          overrideNote: withProof ? undefined : overrideNote.trim(),
          // Only the real declaration instant: a receipt replaced since is
          // refused (409) instead of confirmed unseen.
          declaredAt: kind === 'fee' ? (declaredAt ?? undefined) : undefined,
        },
      },
      {
        onSuccess: () => {
          onConfirmed?.();
          onOpenChange(false);
        },
        onError: (error) => {
          const info = extractApiError(error);
          setFailure(
            isAlreadyProcessed(info) ? t('pendingDesk.review.alreadyBody') : info.message,
          );
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (confirm.isPending) return;
        onOpenChange(next);
      }}
    >
      {/*
        Desktop comfort: an explicit ~920 px / 82vh shell gives the
        two-column split real room. The shared DialogContent caps width at
        `sm:max-w-sm`, so the sm/lg max-width is overridden here. Below lg
        the columns stack and the body scrolls while header / footer stay.
       */}
      <DialogContent className="flex h-auto max-h-[90vh] w-full flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl sm:max-w-[600px] lg:h-[82vh] lg:max-w-[920px]">
        {/* ─── Header ─────────────────────────────────────────── */}
        <DialogHeader className="space-y-1 border-b bg-card px-6 py-5 pe-14 text-left sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold sm:text-xl">
                {t('feeUi.receiptDialog.title')}
              </DialogTitle>
              <DialogDescription className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                {t('feeUi.receiptDialog.orderCode', { code: orderCode })}
              </DialogDescription>
            </div>
            <PaymentStatusBadge status={status} className="shrink-0" />
          </div>
        </DialogHeader>

        {/* ─── Body: receipt | summary (side by side from lg) ──── */}
        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_42%] lg:overflow-hidden">
          {/* A column, centred only while it fits (`-safe`): a receipt
              taller than the panel must never overflow above the scroll
              top, where it cannot be reached. Tall enough below lg for a
              PDF's actions, frame and phone hint; clipped below that. */}
          <div className="flex h-[46dvh] min-h-[360px] flex-col items-stretch justify-center-safe overflow-hidden border-b bg-muted/40 p-4 lg:h-auto lg:min-h-0 lg:border-e lg:border-b-0 lg:p-8">
            {transfer && cacheKey ? (
              <ReceiptViewer
                transfer={transfer}
                subjectKey={cacheKey}
                hasProof={withProof}
                orderCode={orderCode}
                installmentNumber={null}
              />
            ) : (
              <p className="text-center text-sm text-muted-foreground">{t('pendingDesk.viewer.notFoundBody')}</p>
            )}
          </div>

          <div className="flex flex-col bg-card p-6 lg:min-h-0 lg:overflow-y-auto lg:p-7">
            <h3 className="mb-4 text-sm font-medium">{t('feeUi.receiptDialog.summary')}</h3>
            <div className="space-y-4">
              <DetailRow
                icon={<User className="h-3.5 w-3.5" />}
                label={t('feeUi.receiptDialog.patient')}
                value={patientName ?? '—'}
              />
              <DetailRow
                icon={<Stethoscope className="h-3.5 w-3.5" />}
                label={t('feeUi.receiptDialog.doctor')}
                value={doctorName ? `Dr. ${doctorName}` : '—'}
              />
              <Divider />
              {split ? (
                <>
                  {/* With a stamp or a retenue: what was due (TTC), the
                      stamp added, what the practitioner kept back, and
                      what reached the account. */}
                  <DetailRow
                    icon={<Banknote className="h-3.5 w-3.5" />}
                    label={t(kind === 'fee' ? 'withholdingUi.dueFee' : 'withholdingUi.dueInstallment')}
                    value={<span className="tabular-nums">{formatPrice(split.due, currency)}</span>}
                  />
                  {split.stamp > 0 ? (
                    <DetailRow
                      icon={<Banknote className="h-3.5 w-3.5" />}
                      label={t('withholdingUi.stamp')}
                      value={<span className="tabular-nums">+ {formatPrice(split.stamp, currency)}</span>}
                    />
                  ) : null}
                  {split.withheld > 0 ? (
                    <DetailRow
                      icon={<Banknote className="h-3.5 w-3.5" />}
                      label={
                        split.rate !== null
                          ? t('feeUi.receiptDialog.withheld', { rate: formatRate(split.rate, lang) })
                          : t('feeUi.receiptDialog.withheldNoRate')
                      }
                      value={<span className="tabular-nums">− {formatPrice(split.withheld, currency)}</span>}
                    />
                  ) : null}
                  <DetailRow
                    icon={<Banknote className="h-3.5 w-3.5" />}
                    label={t('feeUi.receiptDialog.amountPaid')}
                    value={
                      <span className="text-lg font-bold tabular-nums">
                        {formatPrice(split.cash, currency)}
                      </span>
                    }
                    highlight
                  />
                </>
              ) : (
                <DetailRow
                  icon={<Banknote className="h-3.5 w-3.5" />}
                  label={t('feeUi.receiptDialog.amount')}
                  value={
                    <span className="text-lg font-bold tabular-nums">
                      {formatPrice(amount ?? 0, currency)}
                    </span>
                  }
                  highlight
                />
              )}
              <DetailRow
                icon={<MethodIcon method={method} />}
                label={t('feeUi.receiptDialog.method')}
                value={t(`paymentsCommon.method.${method ?? PaymentMethod.BANK_TRANSFER}`)}
              />
              {submittedAt && (
                <DetailRow
                  icon={<Calendar className="h-3.5 w-3.5" />}
                  label={t(
                    dateLabel === 'paid' ? 'feeUi.receiptDialog.paid' : 'feeUi.receiptDialog.submitted',
                  )}
                  // The dashboard's day format, in Tunis time (the days the
                  // payments desk lists and counts by).
                  value={formatBusinessDay(submittedAt, lang)}
                />
              )}
              <DetailRow
                icon={<FileText className="h-3.5 w-3.5" />}
                label={t('feeUi.receiptDialog.receipt')}
                value={t(withProof ? 'pendingDesk.receipt.attached' : 'pendingDesk.receipt.none')}
              />
            </div>

            {confirmable && (
              <div className="mt-auto space-y-3 pt-6">
                {!withProof && (
                  <div className="space-y-1.5">
                    <Label htmlFor={overrideId}>{t('pendingDesk.review.overrideLabel')}</Label>
                    <Textarea
                      id={overrideId}
                      rows={2}
                      value={overrideNote}
                      maxLength={REASON_MAX + 20}
                      onChange={(event) => setOverrideNote(event.target.value)}
                      placeholder={t('pendingDesk.review.overridePh')}
                      aria-invalid={overrideError ? true : undefined}
                      aria-describedby={`${overrideId}-help`}
                      disabled={confirm.isPending}
                    />
                    <p
                      id={`${overrideId}-help`}
                      aria-live="polite"
                      className={cn('text-xs', overrideError ? 'text-destructive' : 'text-muted-foreground')}
                    >
                      {overrideError ??
                        t('pendingDesk.review.overrideHelp', { min: REASON_MIN, max: REASON_MAX })}
                    </p>
                  </div>
                )}
                {/* What Confirm will do, in plain words. */}
                <p className="rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-xs leading-relaxed text-blue-900/80 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
                  {t('feeUi.receiptDialog.confirmHint')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ─── Footer ─────────────────────────────────────────── */}
        <div className="space-y-3 border-t bg-card px-6 py-4 sm:px-8">
          {failure && (
            <Alert variant="destructive" role="alert">
              <AlertTriangle aria-hidden="true" />
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-row flex-wrap items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="ghost"
              className="pointer-coarse:h-12"
              disabled={confirm.isPending}
              onClick={() => onOpenChange(false)}
            >
              {/* Cancel only means something next to Confirm. */}
              {confirmable ? t('common.cancel') : t('common.close')}
            </Button>
            {footerAction}
            {confirmable && (
              <Button
                type="button"
                className="min-w-[180px] gap-1.5 bg-emerald-600 font-medium text-white shadow-sm hover:bg-emerald-700 pointer-coarse:h-12"
                disabled={confirm.isPending}
                onClick={sendConfirm}
              >
                {confirm.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {t('feeUi.receiptDialog.confirmBtn')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function DetailRow({
  icon,
  label,
  value,
  highlight,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[16px_1fr] items-start gap-x-2.5 gap-y-0.5',
        highlight && '-mx-2 rounded-md bg-emerald-50/60 p-2 dark:bg-emerald-950/30',
      )}
    >
      <div
        aria-hidden="true"
        className={cn('mt-0.5 text-muted-foreground', highlight && 'text-emerald-700 dark:text-emerald-300')}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            'text-xs text-muted-foreground',
            highlight && 'text-emerald-700 dark:text-emerald-300',
          )}
        >
          {label}
        </p>
        <div
          className={cn('text-sm text-foreground', highlight && 'text-emerald-900 dark:text-emerald-100')}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-border" />;
}

function MethodIcon({ method }: { method?: PaymentMethod | null }) {
  if (method === PaymentMethod.CARD) return <CreditCard className="h-3.5 w-3.5" />;
  if (method === PaymentMethod.CASH) return <Banknote className="h-3.5 w-3.5" />;
  if (method === PaymentMethod.CHEQUE) return <FilePen className="h-3.5 w-3.5" />;
  return <Landmark className="h-3.5 w-3.5" />;
}
