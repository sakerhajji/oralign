'use client';

import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Truck } from 'lucide-react';
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
import { orderKeys, paymentPlanKeys, useDeliverBatch } from '@/lib/hooks';
import { productionKeys, useProductionSheet } from '@/lib/hooks/use-production';
import { quotationKeys } from '@/lib/hooks/use-quotations';
import { useT } from '@/lib/i18n/lang-context';
import type { Quotation, QuoteStepBatch } from '@/lib/types';
import type {
  PlannedTotals,
  ProductionArch,
  ProductionCaseSheet,
  ProductionEventView,
} from '@/lib/types/production';
import { cn } from '@/lib/utils';
import { ProductionDeclareSheet, type DeclarePreset } from './declare-form';
import { ARCHES, choiceOf, productionErrorText } from './production-format';

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
