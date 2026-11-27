'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, LockOpen, Truck } from 'lucide-react';
import { toast } from '@/lib/toast';
import { classifyApiError } from '@/lib/api/error';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  orderKeys,
  paymentPlanKeys,
  useDeliverBatch,
  useStepBatches,
  useUnlockBatch,
} from '@/lib/hooks';
import { productionKeys, useProductionSheet } from '@/lib/hooks/use-production';
import { quotationKeys, useQuotationForOrder } from '@/lib/hooks/use-quotations';
import { useT } from '@/lib/i18n/lang-context';
import { useAuth } from '@/lib/providers/auth-provider';
import { BATCH_UNLOCK_ERROR, BatchStatus, type Quotation, type QuoteStepBatch } from '@/lib/types';
import type {
  PlannedTotals,
  ProductionArch,
  ProductionCaseSheet,
  ProductionEventView,
  ReleasedRange,
} from '@/lib/types/production';
import { cn } from '@/lib/utils';
import { ProductionDeclareSheet, type DeclarePreset } from './declare-form';
import { ProductionOverlay } from './production-overlay';
import { unlockedByAnotherAct } from './release-format';
import {
  ARCHES,
  REASON_MAX,
  REASON_MIN,
  choiceOf,
  productionErrorText,
  stepsText,
  type Translate,
} from './production-format';

type BatchRef = Pick<QuoteStepBatch, 'id' | 'batchNumber' | 'fromStep' | 'toStep'>;

interface StepSpan {
  from: number;
  to: number;
}

/**
 * The admin's "Marquer livré" on an unlocked batch.
 *   • Limited pack: it opens the production delivery form, so a batch is
 *     delivered through the SAME declaration path as the lab's (owner D2:
 *     one source of truth, one notice), prefilled with what the batch
 *     still needs. The case sheet the form needs loads when it opens.
 *   • Unlimited-step pack: its batches are payment placeholders ([1,1],
 *     [2,2]…), not aligner ranges, so nothing is declared to the lab: a
 *     confirmation, then the legacy endpoint flips the batch and tells the
 *     practitioner (CONC-01). The quote already says which pack it is.
 */
export function BatchDeliveryButton({
  quote,
  batch,
  label,
  className,
}: {
  quote: Pick<Quotation, 'id' | 'orderId' | 'isUnlimitedSteps'>;
  batch: BatchRef;
  label: string;
  className?: string;
}) {
  return quote.isUnlimitedSteps ? (
    <PlaceholderBatchDelivery quote={quote} batch={batch} label={label} className={className} />
  ) : (
    <ProductionBatchDelivery quote={quote} batch={batch} label={label} className={className} />
  );
}

interface DeliveryProps {
  quote: Pick<Quotation, 'id' | 'orderId'>;
  batch: BatchRef;
  label: string;
  className?: string;
}

function ProductionBatchDelivery({ quote, batch, label, className }: DeliveryProps) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Each declaration of a chain gets a fresh form (and Idempotency-Key).
  const [round, setRound] = useState(0);
  const chainNext = useRef(false);
  const sheet = useProductionSheet(quote.orderId, { enabled: open });

  const preset = useMemo<DeclarePreset | undefined>(
    () => (sheet.data ? nextDeliveryPreset(sheet.data, batch) : undefined),
    [sheet.data, batch],
  );

  // The declaration flipped the batch (and maybe started the coverage or
  // finished the case): refresh everything the quote panel shows.
  const refreshPanel = () => {
    void queryClient.invalidateQueries({ queryKey: paymentPlanKeys.batches(quote.id) });
    void queryClient.invalidateQueries({ queryKey: paymentPlanKeys.installments(quote.id) });
    void queryClient.invalidateQueries({ queryKey: quotationKeys.detail(quote.id) });
    void queryClient.invalidateQueries({ queryKey: quotationKeys.byOrder(quote.orderId) });
    void queryClient.invalidateQueries({ queryKey: orderKeys.detail(quote.orderId) });
    void queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
  };

  const onDeclared = () => {
    refreshPanel();
    // The write already landed in the cached sheet: when the batch still
    // needs steps (the other arch, on a plan whose arches differ), the
    // next form follows instead of closing.
    const fresh = queryClient.getQueryData<ProductionCaseSheet>(productionKeys.sheet(quote.orderId));
    chainNext.current = !!fresh && nextDeliveryPreset(fresh, batch) !== undefined;
  };

  const onOpenChange = (next: boolean) => {
    if (!next && chainNext.current) {
      chainNext.current = false;
      setRound((value) => value + 1);
      return;
    }
    chainNext.current = false;
    setOpen(next);
  };

  return (
    <>
      <Button size="sm" className={cn(className)} onClick={() => setOpen(true)}>
        <Truck className="mr-1 h-3 w-3" aria-hidden="true" />
        {label}
      </Button>
      <ProductionDeclareSheet
        key={round}
        open={open}
        onOpenChange={onOpenChange}
        context={sheet.data ?? null}
        act="aligner_delivered"
        preset={preset}
        onDeclared={onDeclared}
        loadError={sheet.isError && !sheet.data ? productionErrorText(t, sheet.error) : null}
        onRetry={() => sheet.refetch()}
      />
    </>
  );
}

function PlaceholderBatchDelivery({ quote, batch, label, className }: DeliveryProps) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const deliver = useDeliverBatch();
  const [confirming, setConfirming] = useState(false);

  const confirm = () =>
    deliver.mutate(
      { quotationId: quote.id, orderId: quote.orderId, batchId: batch.id },
      {
        onSuccess: () => {
          // The hook refreshes the quote and the order; a finished case
          // also leaves the lab queue.
          void queryClient.invalidateQueries({ queryKey: productionKeys.sheet(quote.orderId) });
          void queryClient.invalidateQueries({ queryKey: productionKeys.queues() });
          setConfirming(false);
        },
      },
    );

  return (
    <>
      <Button
        size="sm"
        className={cn(className)}
        disabled={deliver.isPending}
        onClick={() => setConfirming(true)}
      >
        <Truck className="mr-1 h-3 w-3" aria-hidden="true" />
        {label}
      </Button>
      <AlertDialog
        open={confirming}
        onOpenChange={(next) => {
          if (!deliver.isPending) setConfirming(next);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('quoteUi.adminPlan.deliverUnlimited.title', { n: batch.batchNumber })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('quoteUi.adminPlan.deliverUnlimited.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deliver.isPending}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deliver.isPending}
              aria-busy={deliver.isPending}
              onClick={(event) => {
                // Keep the dialog open until the server confirms (the hook toasts either way).
                event.preventDefault();
                confirm();
              }}
            >
              {deliver.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Truck className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── « Débloquer la tranche » (admin, spec §3) ──────────────────────

type UnlockBatchRef = Pick<QuoteStepBatch, 'id' | 'batchNumber' | 'fromStep' | 'toStep'>;

/**
 * The admin's manual unlock of a LOCKED batch: a confirmation with a
 * required reason (3-500 characters), then POST …/unlock. The lab may
 * work on the steps at once; the installment stays due and the
 * practitioner is not told (the dialog says so). For the quote panel's
 * locked rows (canOfferBatchUnlock) and the production case sheet's
 * locked chips; render it for admins only (the server refuses anyone
 * else with 403).
 *
 * `span` is the range shown where the button sits (the case sheet trims
 * batches to the approved plan); it defaults to the batch's own steps.
 * On an unlimited-step pack the dialog says that every step of the plan
 * is released (its batches are placeholders, not aligner ranges).
 */
export function BatchUnlockButton({
  quote,
  batch,
  span,
  variant = 'default',
  className,
}: {
  quote: Pick<Quotation, 'id' | 'orderId'> & Partial<Pick<Quotation, 'isUnlimitedSteps'>>;
  batch: UnlockBatchRef;
  span?: { from: number; to: number };
  /** default: a small outline button; chip: the compact one inside a range chip. */
  variant?: 'default' | 'chip';
  className?: string;
}) {
  const { t } = useT();
  const { user } = useAuth();
  const unlock = useUnlockBatch();
  const [open, setOpen] = useState(false);
  // Every opening starts a fresh form (reason, errors).
  const [round, setRound] = useState(0);
  const everyStep = quote.isUnlimitedSteps === true;
  const shown = span ?? { from: batch.fromStep, to: batch.toStep };
  const steps = everyStep ? t('production.batchUnlock.everyStep') : stepsText(t, shown.from, shown.to);

  const openDialog = () => {
    setRound((value) => value + 1);
    setOpen(true);
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(
          // 48 px targets on touch screens (DECISIONS: pointer-coarse).
          variant === 'chip'
            ? 'h-6 rounded-full px-2 text-[11px] pointer-coarse:h-12 pointer-coarse:px-4 pointer-coarse:text-sm'
            : 'pointer-coarse:h-12 pointer-coarse:px-4',
          className,
        )}
        aria-label={t('production.batchUnlock.buttonAria', { n: batch.batchNumber, steps })}
        onClick={openDialog}
      >
        <LockOpen className="mr-1 size-3" aria-hidden="true" />
        {variant === 'chip' ? t('production.batchUnlock.short') : t('production.batchUnlock.button')}
      </Button>
      <ProductionOverlay
        open={open}
        onOpenChange={setOpen}
        busy={unlock.isPending}
        desktop="dialog"
        title={t('production.batchUnlock.title', { n: batch.batchNumber })}
        description={
          everyStep
            ? t('production.batchUnlock.descriptionAll')
            : t('production.batchUnlock.description', {
                steps: shown.from === shown.to ? shown.from : `${shown.from}–${shown.to}`,
              })
        }
      >
        <UnlockForm
          key={round}
          t={t}
          everyStep={everyStep}
          pending={unlock.isPending}
          onCancel={() => setOpen(false)}
          onSubmit={(reason, report) =>
            unlock.mutate(
              { quotationId: quote.id, orderId: quote.orderId, batchId: batch.id, reason },
              {
                onSuccess: (row) => {
                  // A 200 on a batch something else released first (a
                  // payment, a quote edit, a colleague) is the idempotent
                  // answer: say so rather than claim this unlock.
                  if (unlockedByAnotherAct(row, user?.id)) {
                    toast.info(t('production.batchUnlock.already'));
                  } else {
                    toast.success(t('production.batchUnlock.done', { n: batch.batchNumber, steps }));
                  }
                  setOpen(false);
                },
                onError: (error) => report(unlockErrorOf(t, error)),
              },
            )
          }
        />
      </ProductionOverlay>
    </>
  );
}

/**
 * 409 of the payment-plan service (PAYMENT_PLAN_ERROR.QUOTE_NOT_UNLOCKABLE):
 * the quote is neither sent nor accepted, so nothing may be released.
 */
const QUOTE_NOT_UNLOCKABLE = 'BATCH_UNLOCK_QUOTE_NOT_LIVE';

/** A refusal of the unlock: on the reason field, or for the whole form. */
interface UnlockError {
  field: boolean;
  message: string;
}

function unlockErrorOf(t: Translate, error: unknown): UnlockError {
  const classified = classifyApiError(error);
  if (classified.errorCode === BATCH_UNLOCK_ERROR.UNLOCK_REASON_REQUIRED) {
    return { field: true, message: t('production.batchUnlock.errors.UNLOCK_REASON_REQUIRED') };
  }
  if (classified.errorCode === BATCH_UNLOCK_ERROR.BATCH_NOT_FOUND) {
    return { field: false, message: t('production.batchUnlock.errors.BATCH_NOT_FOUND') };
  }
  if (classified.errorCode === QUOTE_NOT_UNLOCKABLE) {
    return { field: false, message: t('production.batchUnlock.errors.BATCH_UNLOCK_QUOTE_NOT_LIVE') };
  }
  // Connection, permission and throttling cases keep the shared copy.
  const generic = classified.kind === 'unknown' || classified.kind === 'server';
  return { field: false, message: generic ? t('production.batchUnlock.errors.generic') : classified.message };
}

function UnlockForm({
  t,
  everyStep,
  pending,
  onCancel,
  onSubmit,
}: {
  t: Translate;
  /** An unlimited-step pack: the unlock releases every step of the plan. */
  everyStep: boolean;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (reason: string, report: (error: UnlockError) => void) => void;
}) {
  const uid = useId();
  const reasonId = `${uid}-reason`;
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    if (pending) return;
    const trimmed = reason.trim();
    if (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX) {
      setReasonError(
        t(trimmed.length < REASON_MIN ? 'production.batchUnlock.errors.reasonShort' : 'production.batchUnlock.errors.reasonLong'),
      );
      reasonRef.current?.focus();
      return;
    }
    setFormError(null);
    onSubmit(trimmed, (error) => {
      if (error.field) {
        setReasonError(error.message);
        reasonRef.current?.focus();
      } else {
        setFormError(error.message);
      }
    });
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
        {t(everyStep ? 'production.batchUnlock.bodyAll' : 'production.batchUnlock.body')}
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={reasonId} className="text-sm font-medium">
          {t('production.batchUnlock.reason')}
        </label>
        <Textarea
          ref={reasonRef}
          id={reasonId}
          value={reason}
          autoFocus
          onChange={(event) => {
            setReason(event.target.value);
            setReasonError(null);
          }}
          maxLength={REASON_MAX}
          rows={3}
          required
          aria-required="true"
          aria-invalid={!!reasonError || undefined}
          aria-describedby={`${reasonId}-hint${reasonError ? ` ${reasonId}-error` : ''}`}
          placeholder={t('production.batchUnlock.reasonPh')}
          className="min-h-24 text-base md:text-sm"
        />
        <p id={`${reasonId}-hint`} className="text-xs text-muted-foreground">
          {t('production.batchUnlock.reasonHint')}
        </p>
        {reasonError && (
          <p id={`${reasonId}-error`} role="alert" className="text-xs font-medium text-destructive">
            {reasonError}
          </p>
        )}
      </div>

      {formError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-2 md:flex-row-reverse">
        <Button
          type="submit"
          className="h-14 text-base pointer-fine:md:h-10 md:flex-1 md:text-sm"
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LockOpen aria-hidden="true" />}
          {pending ? t('production.batchUnlock.submitting') : t('production.batchUnlock.submit')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12 pointer-fine:md:h-10"
          onClick={onCancel}
          disabled={pending}
        >
          {t('production.batchUnlock.keep')}
        </Button>
      </div>
    </form>
  );
}

/**
 * The case sheet's « Débloquer » on a locked chip (admins only: the
 * caller renders it for them). The sheet carries no batch id (leak guard),
 * so the admin's own quote reads name the batch: the chip's first step is
 * the batch's (trimming only cuts the end). Nothing shows while they load
 * or when the batch is gone (the 30 s sheet poll catches up).
 */
export function SheetBatchUnlock({ orderId, range }: { orderId: string; range: ReleasedRange }) {
  const quote = useQuotationForOrder(orderId);
  const quotationId = quote.data?.id ?? '';
  const batches = useStepBatches(quotationId, !!quotationId);
  const batch = batches.data?.find(
    (row) => row.fromStep === range.from && row.status === BatchStatus.LOCKED,
  );
  if (!quote.data || !batch) return null;
  return (
    <BatchUnlockButton
      quote={{ id: quote.data.id, orderId }}
      batch={batch}
      span={{ from: range.from, to: range.to }}
      variant="chip"
    />
  );
}

// ─── What a batch still needs (mirrors the server's batch-coverage.ts) ──

/**
 * Per treated arch, the batch range up to that arch's APPROVED total: the
 * steps past it do not exist (a technician cannot declare them), so the
 * form never proposes them. Provisional totals do not clip.
 */
function batchNeeds(
  batch: Pick<BatchRef, 'fromStep' | 'toStep'>,
  arches: readonly ProductionArch[],
  planned: PlannedTotals,
): { arch: ProductionArch; span: StepSpan }[] {
  return arches.flatMap((arch) => {
    const total = planned[arch];
    const to =
      total?.source === 'approved_plan' && total.total !== null
        ? Math.min(batch.toStep, total.total)
        : batch.toStep;
    return to >= batch.fromStep ? [{ arch, span: { from: batch.fromStep, to } }] : [];
  });
}

/** The parts of `span` no live delivery of `arch` covers, ascending. */
function undelivered(
  span: StepSpan,
  arch: ProductionArch,
  history: readonly ProductionEventView[],
): StepSpan[] {
  const delivered = history
    .filter((row) => row.type === 'aligner_delivered' && row.arch === arch && row.cancelledAt === null)
    .map((row) => ({ from: row.stepFrom, to: row.stepTo }))
    .sort((a, b) => a.from - b.from);
  const gaps: StepSpan[] = [];
  let cursor = span.from;
  for (const range of delivered) {
    if (range.to < cursor) continue;
    if (range.from > span.to) break;
    if (range.from > cursor) gaps.push({ from: cursor, to: range.from - 1 });
    cursor = Math.max(cursor, range.to + 1);
    if (cursor > span.to) break;
  }
  if (cursor <= span.to) gaps.push({ from: cursor, to: span.to });
  return gaps;
}

/**
 * The next declaration the form prefills: the first steps the batch still
 * needs, on both arches when they need exactly the same ones (one
 * declaration, one notice), else on the first arch that needs some.
 * undefined when nothing is left: the form proposes its own next steps,
 * and the server delivers a batch wholly beyond the plan with the case's
 * first delivery.
 */
function nextDeliveryPreset(
  sheet: Pick<ProductionCaseSheet, 'treatedArches' | 'planned' | 'history'>,
  batch: Pick<BatchRef, 'fromStep' | 'toStep'>,
): DeclarePreset | undefined {
  const arches = sheet.treatedArches.length ? sheet.treatedArches : ARCHES;
  const firstGaps = batchNeeds(batch, arches, sheet.planned).flatMap(({ arch, span }) => {
    const [gap] = undelivered(span, arch, sheet.history);
    return gap ? [{ arch, gap }] : [];
  });
  const [first] = firstGaps;
  if (!first) return undefined;
  const together = firstGaps.filter(
    ({ gap }) => gap.from === first.gap.from && gap.to === first.gap.to,
  );
  return {
    arch: choiceOf(together.map(({ arch }) => arch)),
    stepFrom: first.gap.from,
    stepTo: first.gap.to,
  };
}
