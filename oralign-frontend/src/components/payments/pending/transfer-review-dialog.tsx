'use client';

import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileQuestion,
  Loader2,
  XCircle,
} from 'lucide-react';
import { RecordedPaymentBreakdown } from '@/components/payments/withholding';
import { TransferStateBadge } from '@/components/payments/transfer-state-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePhoneLayout } from '@/hooks/use-phone-layout';
import { extractApiError } from '@/lib/api/error';
import {
  useConfirmTransfer,
  useOpenTransferReview,
  useRejectTransfer,
} from '@/lib/hooks/use-transfer-queue';
import { doctorWithTitle } from '@/lib/doctor/doctor-contact';
import { useT } from '@/lib/i18n/lang-context';
import { refusalReasonOf } from '@/lib/payments/transfer-state';
import type { TransferQueueRow } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatBusinessDay, formatBusinessTime } from '@/lib/utils/business-day';
import { formatPrice } from '@/lib/utils/currency';
import {
  REASON_MAX,
  REASON_MIN,
  confirmProblem,
  isAlreadyProcessed,
  isAwaiting,
  reasonProblem,
  rowSplit,
  transferRefOf,
} from './queue-format';
import { ReceiptViewer } from './receipt-viewer';

type Step = 'review' | 'confirm' | 'reject';
type Outcome = { kind: 'already' } | { kind: 'failed'; message: string } | null;
type TitleComponent = ComponentType<{ className?: string; children?: ReactNode }>;

/**
 * One transfer under review (either kind): the receipt, fetched behind the
 * JWT, beside what to look for on the bank statement and who sent it; then
 * Confirmer or Refuser, each confirmed in place (a second step in the same
 * surface, never a browser prompt). A dialog on wide screens, a bottom
 * sheet on phones.
 *
 * Opening a transfer still awaiting stamps the review (the global « À
 * vérifier ») and marks MY subject rows read (« Consulté »). Someone else
 * may have closed it meanwhile (another admin, or the doctor withdrew or
 * replaced it): the 409 reads « Déjà traité » and the list refreshes.
 */
export function TransferReviewDialog({
  row,
  open,
  onOpenChange,
  returnTo,
}: {
  /** The transfer to show; the last one stays while the surface closes. */
  row: TransferQueueRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The desk's address, for the order page's way back. */
  returnTo: string;
}) {
  const live = usePhoneLayout();
  // The layout is read once per opening (as in ProductionOverlay): turning
  // a phone to landscape crosses 767 px, and swapping the sheet for the
  // dialog would remount the review (the typed reason, the step, and the
  // answer of a decision in flight with it).
  const [held, setHeld] = useState(live);
  if ((!open || held === null) && held !== live) setHeld(live);
  const phone = open && held !== null ? held : live;
  const [shown, setShown] = useState(row);
  if (row && row !== shown) setShown(row);
  // Each opening starts afresh (first step, empty notes, a new review
  // stamp); counted during the render, as the surface opens.
  const [wasOpen, setWasOpen] = useState(open);
  const [opening, setOpening] = useState(0);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpening((count) => count + 1);
  }
  // A write in flight keeps the surface open (its answer lands here).
  const [busy, setBusy] = useState(false);
  const change = (next: boolean) => {
    if (!next && busy) return;
    onOpenChange(next);
  };
  const holdWhileBusy = (event: Event) => {
    if (busy) event.preventDefault();
  };

  if (phone === null || !shown) return null;
  const body = (Title: TitleComponent, Description: TitleComponent) => (
    <ReviewBody
      // A new transfer, or a new opening, starts at its first step.
      key={`${shown.subjectKey}#${opening}`}
      row={shown}
      open={open}
      returnTo={returnTo}
      Title={Title}
      Description={Description}
      onBusyChange={setBusy}
      onDone={() => onOpenChange(false)}
    />
  );

  if (phone) {
    return (
      // A controlled vaul drawer still slides away on a drag even when
      // onOpenChange is ignored: `dismissible` is what stops the gesture
      // while a decision is in flight.
      <Drawer open={open} onOpenChange={change} dismissible={!busy}>
        <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[94dvh]">
          {body(DrawerTitle, DrawerDescription)}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={change}>
      {/* DialogContent caps at sm:max-w-sm: the sm / lg overrides win it back. */}
      <DialogContent
        className="flex max-h-[92dvh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[680px] lg:h-[88vh] lg:max-w-[1080px]"
        onInteractOutside={holdWhileBusy}
        onEscapeKeyDown={holdWhileBusy}
      >
        {body(DialogTitle, DialogDescription)}
      </DialogContent>
    </Dialog>
  );
}

function ReviewBody({
  row,
  open,
  returnTo,
  Title,
  Description,
  onBusyChange,
  onDone,
}: {
  row: TransferQueueRow;
  open: boolean;
  returnTo: string;
  Title: TitleComponent;
  Description: TitleComponent;
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
}) {
  const { t, lang } = useT();
  const ref = transferRefOf(row);
  const awaiting = isAwaiting(row);
  const openReview = useOpenTransferReview();
  const confirm = useConfirmTransfer();
  const reject = useRejectTransfer();
  const [step, setStep] = useState<Step>('review');
  const [notes, setNotes] = useState('');
  const [overrideNote, setOverrideNote] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const busy = confirm.isPending || reject.isPending;

  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  // Stamp the review once per opening of a transfer still awaiting (the
  // body is remounted for each opening).
  const stamped = useRef(false);
  const { mutate: stampReview } = openReview;
  useEffect(() => {
    if (!open || !awaiting || stamped.current) return;
    stamped.current = true;
    stampReview({ ref: transferRefOf(row), subjectKey: row.subjectKey });
  }, [open, awaiting, row, stampReview]);

  const fail = (error: unknown) => {
    const info = extractApiError(error);
    setOutcome(
      isAlreadyProcessed(info) ? { kind: 'already' } : { kind: 'failed', message: info.message },
    );
  };

  const sendConfirm = () => {
    setTouched(true);
    if (confirmProblem({ hasProof: row.hasProof, overrideNote, notes })) return;
    setOutcome(null);
    confirm.mutate(
      {
        ref,
        body: {
          notes: row.kind === 'installment' ? notes.trim() || undefined : undefined,
          overrideNote: row.hasProof ? undefined : overrideNote.trim(),
          // A fee receipt replaced since the review is never confirmed unseen.
          declaredAt: row.kind === 'treatment_fee' ? row.declaredAt : undefined,
        },
      },
      { onSuccess: onDone, onError: fail },
    );
  };

  const sendReject = () => {
    setTouched(true);
    if (reasonProblem(reason)) return;
    setOutcome(null);
    reject.mutate(
      {
        ref,
        body: {
          rejectionReason: reason.trim(),
          declaredAt: row.kind === 'treatment_fee' ? row.declaredAt : undefined,
        },
      },
      { onSuccess: onDone, onError: fail },
    );
  };

  const goTo = (next: Step) => {
    setStep(next);
    setTouched(false);
    setOutcome(null);
  };

  const split = rowSplit(row);
  const currency = row.amounts.currency;
  const kindLabel =
    row.kind === 'treatment_fee'
      ? t('pendingDesk.review.titleFee')
      : row.installmentNumber !== null
        ? t('pendingDesk.review.titleInstallment', { n: row.installmentNumber })
        : t('pendingDesk.review.titleInstallmentNoRank');
  const orderHref = orderLink(row, returnTo);
  const reasonText = refusalReasonOf(row.rejectionReason);
  const when = (iso: string | null) =>
    iso ? `${formatBusinessDay(iso, lang)} · ${formatBusinessTime(iso, lang)}` : null;

  return (
    <>
      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="shrink-0 border-b px-4 pt-4 pb-3 pe-14 sm:px-6 sm:pt-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Title className="text-base font-semibold sm:text-lg">{kindLabel}</Title>
          <TransferStateBadge state={row.state} audience="admin" />
        </div>
        <Description className="mt-1 text-sm text-muted-foreground">
          {[t('pendingDesk.review.order', { code: row.orderCode }), row.patient?.fullName]
            .filter(Boolean)
            .join(' · ')}
        </Description>
      </header>

      {/* ─── Body: receipt | facts (side by side from lg) ───────── */}
      <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden">
        <section
          aria-label={t('pendingDesk.col.receipt')}
          // Tall enough below lg for a PDF (actions, frame, phone hint);
          // clipped, so a receipt never paints over « Montant viré ».
          className="h-[50dvh] min-h-[340px] overflow-hidden border-b bg-muted/40 p-3 sm:p-4 lg:h-auto lg:min-h-0 lg:border-e lg:border-b-0 lg:p-6"
        >
          <ReceiptViewer
            transfer={ref}
            subjectKey={row.subjectKey}
            hasProof={row.hasProof}
            orderCode={row.orderCode}
            installmentNumber={row.installmentNumber}
          />
        </section>

        <section className="flex flex-col gap-5 p-4 sm:p-6 lg:min-h-0 lg:overflow-y-auto">
          {/* What the admin looks for on the statement: the cash. */}
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {t('pendingDesk.review.cash')}
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
              {formatPrice(row.amounts.cash, currency)}
            </p>
            {awaiting && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t('pendingDesk.review.statementHint')}
              </p>
            )}
          </div>

          {split && (
            <RecordedPaymentBreakdown
              split={split}
              currency={currency}
              kind={row.kind === 'treatment_fee' ? 'fee' : 'installment'}
              cashLabel={t('pendingDesk.review.cash')}
            />
          )}

          {awaiting && !row.hasProof && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <FileQuestion aria-hidden="true" />
              <AlertDescription>{t('pendingDesk.review.noProofWarning')}</AlertDescription>
            </Alert>
          )}

          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
            <Fact label={t('pendingDesk.review.patient')} value={row.patient?.fullName} />
            <Fact
              label={t('pendingDesk.review.doctor')}
              value={doctorWithTitle(row.doctor?.fullName)}
            />
            <Fact label={t('pendingDesk.review.declaredAt')} value={when(row.declaredAt)} tabular />
            {row.reviewOpenedAt && (
              <Fact label={t('pendingDesk.review.openedAt')} value={when(row.reviewOpenedAt)} tabular />
            )}
            {row.processedAt && row.status === 'success' && (
              <Fact label={t('pendingDesk.review.processedValide')} value={when(row.processedAt)} tabular />
            )}
            {row.processedAt && row.status === 'rejected' && (
              <Fact label={t('pendingDesk.review.processedRefuse')} value={when(row.processedAt)} tabular />
            )}
            {reasonText && <Fact label={t('pendingDesk.review.reason')} value={reasonText} />}
          </dl>

          <Button asChild variant="outline" size="sm" className="self-start pointer-coarse:h-12">
            <Link href={orderHref}>
              <ExternalLink aria-hidden="true" />
              {t('pendingDesk.review.openOrder')}
            </Link>
          </Button>
        </section>
      </div>

      {/* ─── Footer: the decision, confirmed in place ───────────── */}
      <footer className="shrink-0 space-y-3 border-t bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        {outcome?.kind === 'already' && (
          <Alert>
            <CheckCircle2 aria-hidden="true" />
            <AlertTitle>{t('pendingDesk.review.alreadyTitle')}</AlertTitle>
            <AlertDescription>{t('pendingDesk.review.alreadyBody')}</AlertDescription>
          </Alert>
        )}
        {outcome?.kind === 'failed' && (
          <Alert variant="destructive" role="alert">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>{t('pendingDesk.review.failedTitle')}</AlertTitle>
            <AlertDescription>{outcome.message}</AlertDescription>
          </Alert>
        )}

        {!awaiting || outcome?.kind === 'already' ? (
          <Actions>
            <Button type="button" variant="outline" className="pointer-coarse:h-12" onClick={onDone}>
              {t('pendingDesk.review.close')}
            </Button>
          </Actions>
        ) : step === 'review' ? (
          <Actions>
            <Button
              type="button"
              variant="destructive"
              className="pointer-coarse:h-12 sm:min-w-28"
              onClick={() => goTo('reject')}
            >
              <XCircle aria-hidden="true" />
              {t('pendingDesk.review.reject')}
            </Button>
            <Button
              type="button"
              className="pointer-coarse:h-12 sm:min-w-44"
              onClick={() => goTo('confirm')}
            >
              <CheckCircle2 aria-hidden="true" />
              {t('pendingDesk.review.confirm')}
            </Button>
          </Actions>
        ) : step === 'confirm' ? (
          <ConfirmStep
            row={row}
            notes={notes}
            onNotes={setNotes}
            overrideNote={overrideNote}
            onOverrideNote={setOverrideNote}
            touched={touched}
            busy={busy}
            onBack={() => goTo('review')}
            onSubmit={sendConfirm}
          />
        ) : (
          <RejectStep
            reason={reason}
            onReason={setReason}
            touched={touched}
            busy={busy}
            onBack={() => goTo('review')}
            onSubmit={sendReject}
          />
        )}
      </footer>
    </>
  );
}

/** The order page, on the quote for an installment, with the way back to the desk. */
function orderLink(row: TransferQueueRow, returnTo: string): string {
  const params = new URLSearchParams();
  if (row.kind === 'installment') params.set('tab', 'quote');
  params.set('returnTo', returnTo);
  return `/dashboard/orders/${encodeURIComponent(row.orderId)}?${params}`;
}

function Fact({
  label,
  value,
  tabular,
}: {
  label: string;
  value: string | null | undefined;
  tabular?: boolean;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 break-words', tabular && 'tabular-nums')}>{value || '—'}</dd>
    </>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
      {children}
    </div>
  );
}

function ConfirmStep({
  row,
  notes,
  onNotes,
  overrideNote,
  onOverrideNote,
  touched,
  busy,
  onBack,
  onSubmit,
}: {
  row: TransferQueueRow;
  notes: string;
  onNotes: (value: string) => void;
  overrideNote: string;
  onOverrideNote: (value: string) => void;
  touched: boolean;
  busy: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const { t } = useT();
  const notesId = useId();
  const overrideId = useId();
  const problem = confirmProblem({ hasProof: row.hasProof, overrideNote, notes });
  const overrideError = touched && problem === 'override' ? reasonCopy(t, reasonProblem(overrideNote)) : null;
  const body =
    row.kind === 'treatment_fee'
      ? t('pendingDesk.review.confirmBodyFee')
      : row.installmentNumber !== null
        ? t('pendingDesk.review.confirmBodyInstallment', { n: row.installmentNumber })
        : t('pendingDesk.review.confirmBodyInstallmentNoRank');

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div>
        <p className="text-sm font-semibold">{t('pendingDesk.review.confirmTitle')}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
      </div>

      {!row.hasProof && (
        <div className="space-y-1.5">
          <Label htmlFor={overrideId}>{t('pendingDesk.review.overrideLabel')}</Label>
          <Textarea
            id={overrideId}
            rows={2}
            autoFocus
            value={overrideNote}
            maxLength={REASON_MAX + 20}
            onChange={(event) => onOverrideNote(event.target.value)}
            placeholder={t('pendingDesk.review.overridePh')}
            aria-invalid={overrideError ? true : undefined}
            aria-describedby={`${overrideId}-help`}
            disabled={busy}
          />
          <FieldHelp
            id={`${overrideId}-help`}
            error={overrideError}
            help={t('pendingDesk.review.overrideHelp', { min: REASON_MIN, max: REASON_MAX })}
            count={overrideNote.trim().length}
          />
        </div>
      )}

      {row.kind === 'installment' && (
        <div className="space-y-1.5">
          <Label htmlFor={notesId}>{t('pendingDesk.review.notesLabel')}</Label>
          <Textarea
            id={notesId}
            rows={2}
            autoFocus={row.hasProof}
            value={notes}
            maxLength={REASON_MAX}
            onChange={(event) => onNotes(event.target.value)}
            placeholder={t('pendingDesk.review.notesPh')}
            aria-describedby={`${notesId}-help`}
            disabled={busy}
          />
          <p id={`${notesId}-help`} className="text-xs text-muted-foreground">
            {t('pendingDesk.review.notesHelp')}
          </p>
        </div>
      )}

      <Actions>
        <Button type="button" variant="ghost" className="pointer-coarse:h-12" disabled={busy} onClick={onBack}>
          {t('pendingDesk.review.back')}
        </Button>
        {/* Nothing to type for a fee with its receipt: the decision takes the focus. */}
        <Button
          type="submit"
          className="pointer-coarse:h-12 sm:min-w-44"
          disabled={busy}
          autoFocus={row.hasProof && row.kind === 'treatment_fee'}
        >
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
          {t('pendingDesk.review.confirmSubmit')}
        </Button>
      </Actions>
    </form>
  );
}

function RejectStep({
  reason,
  onReason,
  touched,
  busy,
  onBack,
  onSubmit,
}: {
  reason: string;
  onReason: (value: string) => void;
  touched: boolean;
  busy: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const { t } = useT();
  const id = useId();
  const problem = reasonProblem(reason);
  // Too long shows at once; too short only once the admin tried to send.
  const error = problem === 'long' || (touched && problem) ? reasonCopy(t, problem) : null;

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={id} className="text-sm font-semibold">
          {t('pendingDesk.review.rejectLabel')}
        </Label>
        <Textarea
          id={id}
          rows={3}
          autoFocus
          value={reason}
          maxLength={REASON_MAX + 20}
          onChange={(event) => onReason(event.target.value)}
          placeholder={t('pendingDesk.review.rejectPh')}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help`}
          aria-required="true"
          disabled={busy}
        />
        <FieldHelp
          id={`${id}-help`}
          error={error}
          help={t('pendingDesk.review.rejectHelp', { min: REASON_MIN, max: REASON_MAX })}
          count={reason.trim().length}
        />
      </div>
      <Actions>
        <Button type="button" variant="ghost" className="pointer-coarse:h-12" disabled={busy} onClick={onBack}>
          {t('pendingDesk.review.back')}
        </Button>
        <Button
          type="submit"
          className="bg-destructive text-white hover:bg-destructive/90 pointer-coarse:h-12 sm:min-w-44"
          disabled={busy}
        >
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <XCircle aria-hidden="true" />}
          {t('pendingDesk.review.rejectSubmit')}
        </Button>
      </Actions>
    </form>
  );
}

/** The help line of a reason field, its error in its place, and the count. */
function FieldHelp({
  id,
  error,
  help,
  count,
}: {
  id: string;
  error: string | null;
  help: string;
  count: number;
}) {
  const { t } = useT();
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <p id={id} className={cn(error ? 'text-destructive' : 'text-muted-foreground')} aria-live="polite">
        {error ?? help}
      </p>
      <span
        aria-hidden="true"
        className={cn('shrink-0 tabular-nums text-muted-foreground', count > REASON_MAX && 'text-destructive')}
      >
        {t('pendingDesk.review.counter', { count, max: REASON_MAX })}
      </span>
    </div>
  );
}

function reasonCopy(
  t: (path: string, vars?: Record<string, string | number>) => string,
  problem: ReturnType<typeof reasonProblem>,
): string | null {
  if (problem === 'long') return t('pendingDesk.review.tooLong', { max: REASON_MAX });
  if (problem === 'empty' || problem === 'short') {
    return t('pendingDesk.review.tooShort', { min: REASON_MIN });
  }
  return null;
}
