'use client';

import { useRef, useState, type ReactNode } from 'react';
import { History, Loader2, PackageCheck, Pencil, Plus, RotateCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useAlignerDeliveries,
  useRecordAlignerDelivery,
  useUpdateAlignerTotal,
} from '@/lib/hooks/use-aligner-deliveries';
import { useT } from '@/lib/i18n/lang-context';
import {
  MAX_ALIGNERS_PER_ORDER,
  type AlignerDeliverySummary,
  type AlignerRange,
} from '@/lib/types/aligner-delivery';
import {
  formatCalendarDate,
  todayCalendarDate,
} from '@/lib/utils/calendar-date';

type Translate = ReturnType<typeof useT>['t'];
type PanelDialog = 'history' | 'record' | 'total';

/** "1 → 7", "1 → 3, 8 → 10"; a single aligner reads "5". */
function formatRanges(ranges: readonly AlignerRange[]): string {
  return ranges
    .map((r) =>
      r.fromAligner === r.toAligner
        ? String(r.fromAligner)
        : `${r.fromAligner} → ${r.toAligner}`,
    )
    .join(', ');
}

/** Positive integer from a digits-only field, or null when empty. */
function toInt(value: string): number | null {
  return value === '' ? null : Number(value);
}

/**
 * Delivered-aligner tracking on the order page: what was handed to the
 * patient so far, the delivery log, and — for an admin or the owning
 * dentist — recording a new batch. Every number comes from the backend
 * summary (persisted rows); the forms only pre-check input for comfort,
 * the server stays the source of truth.
 */
export function AlignerDeliveriesPanel({ orderId }: { orderId: string }) {
  const { t } = useT();
  const { data: summary, isPending, isError, isFetching, refetch } =
    useAlignerDeliveries(orderId);
  const [dialog, setDialog] = useState<PanelDialog | null>(null);
  // Bumped on every open so each form starts from fresh defaults.
  const [formSeq, setFormSeq] = useState(0);
  // The control that opened a dialog gets focus back when it closes:
  // these dialogs are controlled, with no DialogTrigger for Radix to
  // restore focus to.
  const openerRef = useRef<HTMLElement | null>(null);

  const open = (which: PanelDialog) => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (which !== 'history') setFormSeq((n) => n + 1);
    setDialog(which);
  };
  // Functional update: a save that resolves after the user moved on to
  // another dialog must not close THAT one.
  const closeTo = (which: PanelDialog) => (isOpen: boolean) => {
    if (!isOpen) setDialog((current) => (current === which ? null : current));
  };
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    openerRef.current?.focus();
  };

  if (isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-8 w-56" />
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm text-muted-foreground">
          {t('alignerDeliveries.loadError')}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RotateCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          {t('alignerDeliveries.retry')}
        </Button>
      </div>
    );
  }

  const canWrite = summary.canRecord && summary.acceptsDeliveries;
  const total = summary.totalAligners;
  const percent = total ? (summary.deliveredCount / total) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* The whole summary opens the history — the "click the delivered
          area" entry point; the History button below is the explicit one. */}
      <button
        type="button"
        onClick={() => open('history')}
        className="grid w-full gap-4 rounded-xl border bg-muted/20 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-3"
      >
        <span className="sr-only">{t('alignerDeliveries.openHistory')}</span>
        <Stat label={t('alignerDeliveries.deliveredLabel')}>
          <span className="tabular-nums">
            {summary.deliveredRanges.length > 0
              ? formatRanges(summary.deliveredRanges)
              : t('alignerDeliveries.none')}
          </span>
        </Stat>
        <Stat label={t('alignerDeliveries.progressLabel')}>
          <span className="tabular-nums">
            {total !== null
              ? t('alignerDeliveries.progress', {
                  delivered: summary.deliveredCount,
                  total,
                })
              : t('alignerDeliveries.progressNoTotal', {
                  delivered: summary.deliveredCount,
                })}
          </span>
          {total !== null ? <Progress value={percent} className="mt-2 h-2" /> : null}
        </Stat>
        <Stat label={t('alignerDeliveries.nextLabel')}>
          {summary.isComplete ? (
            <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
              <PackageCheck className="h-3 w-3" />
              {t('alignerDeliveries.complete')}
            </Badge>
          ) : (
            <span className="tabular-nums">{summary.nextAligner ?? '—'}</span>
          )}
          {summary.remainingCount !== null && !summary.isComplete ? (
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              {t('alignerDeliveries.remaining', { count: summary.remainingCount })}
            </span>
          ) : null}
        </Stat>
      </button>

      {!summary.acceptsDeliveries ? (
        <p className="text-sm text-muted-foreground">
          {t('alignerDeliveries.notDeliverable')}
        </p>
      ) : canWrite && total === null ? (
        <p className="text-sm text-muted-foreground">
          {t('alignerDeliveries.totalUnknown')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => open('history')}
        >
          <History className="h-4 w-4" />
          {t('alignerDeliveries.viewHistory', { count: summary.deliveries.length })}
        </Button>
        {canWrite && total !== null ? (
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => open('total')}
          >
            <Pencil className="h-4 w-4" />
            {t('alignerDeliveries.editTotal')}
          </Button>
        ) : null}
        {canWrite && !summary.isComplete ? (
          <Button size="sm" className="gap-2 sm:ml-auto" onClick={() => open('record')}>
            <Plus className="h-4 w-4" />
            {t('alignerDeliveries.recordAction')}
          </Button>
        ) : null}
      </div>

      <DeliveryHistoryDialog
        open={dialog === 'history'}
        onOpenChange={closeTo('history')}
        onCloseAutoFocus={restoreFocus}
        summary={summary}
      />
      {canWrite ? (
        <RecordDeliveryDialog
          key={`record-${formSeq}`}
          open={dialog === 'record'}
          onOpenChange={closeTo('record')}
          onCloseAutoFocus={restoreFocus}
          orderId={orderId}
          summary={summary}
        />
      ) : null}
      {canWrite && total !== null ? (
        <EditTotalDialog
          key={`total-${formSeq}`}
          open={dialog === 'total'}
          onOpenChange={closeTo('total')}
          onCloseAutoFocus={restoreFocus}
          orderId={orderId}
          summary={summary}
        />
      ) : null}
    </div>
  );
}

/** Label/value pair styled like the order page's own Info fields. */
function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="block">
      <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="mt-1 block text-sm font-medium text-foreground">{children}</span>
    </span>
  );
}

// ── History ──────────────────────────────────────────────────────────

function DeliveryHistoryDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  summary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
  summary: AlignerDeliverySummary;
}) {
  const { t, lang } = useT();
  const { deliveries, deliveredCount, totalAligners } = summary;
  const deliveredTotal =
    totalAligners !== null ? `${deliveredCount} / ${totalAligners}` : String(deliveredCount);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {t('alignerDeliveries.history.title')}
          </DialogTitle>
          <DialogDescription>{t('alignerDeliveries.history.description')}</DialogDescription>
        </DialogHeader>

        {deliveries.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t('alignerDeliveries.history.empty')}
          </p>
        ) : (
          <>
            <div className="hidden max-h-[60vh] overflow-auto rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('alignerDeliveries.history.date')}</TableHead>
                    <TableHead className="text-right">{t('alignerDeliveries.history.from')}</TableHead>
                    <TableHead className="text-right">{t('alignerDeliveries.history.to')}</TableHead>
                    <TableHead className="text-right">{t('alignerDeliveries.history.quantity')}</TableHead>
                    <TableHead>{t('alignerDeliveries.history.recordedBy')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>{formatCalendarDate(d.deliveredAt, lang)}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.fromAligner}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.toAligner}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.quantity}</TableCell>
                      <TableCell className="text-muted-foreground">{d.createdByName ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="font-medium">
                      {t('alignerDeliveries.history.total')}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {deliveredTotal}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            <ul className="grid gap-2 md:hidden">
              {deliveries.map((d) => (
                <li key={d.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium tabular-nums">
                      {d.fromAligner} → {d.toAligner}
                    </span>
                    <Badge variant="secondary" className="tabular-nums">
                      {t('alignerDeliveries.history.quantity')} {d.quantity}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatCalendarDate(d.deliveredAt, lang)}
                    {d.createdByName ? ` · ${d.createdByName}` : ''}
                  </p>
                </li>
              ))}
              <li className="flex items-center justify-between rounded-lg bg-muted/40 p-3 text-sm font-medium">
                <span>{t('alignerDeliveries.history.total')}</span>
                <span className="tabular-nums">{deliveredTotal}</span>
              </li>
            </ul>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('alignerDeliveries.history.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Record a delivery ────────────────────────────────────────────────

type DeliveryField = 'date' | 'from' | 'to' | 'total';

/**
 * Comfort pre-check mirroring the backend rules (aligner-delivery.rules.ts)
 * so the user sees a problem before submitting. The server re-validates
 * everything under a lock; this never replaces it.
 */
function validateDelivery(
  input: { date: string; from: string; to: string; total: string },
  summary: AlignerDeliverySummary,
  today: string,
  t: Translate,
  lang: 'en' | 'fr',
): Partial<Record<DeliveryField, string>> {
  const errors: Partial<Record<DeliveryField, string>> = {};
  const from = toInt(input.from);
  const to = toInt(input.to);
  const needsTotal = summary.totalAligners === null;
  const total = needsTotal ? toInt(input.total) : summary.totalAligners;

  const earliest = summary.earliestDeliveryDate;
  if (!input.date) errors.date = t('alignerDeliveries.validation.required');
  // 'YYYY-MM-DD' strings compare chronologically.
  else if (input.date > today) errors.date = t('alignerDeliveries.validation.future');
  else if (earliest && input.date < earliest) {
    errors.date = t('alignerDeliveries.validation.beforeOrder', {
      date: formatCalendarDate(earliest, lang),
    });
  }

  if (from === null) errors.from = t('alignerDeliveries.validation.required');
  else if (from < 1) errors.from = t('alignerDeliveries.validation.min');
  if (to === null) errors.to = t('alignerDeliveries.validation.required');
  else if (to < 1) errors.to = t('alignerDeliveries.validation.min');

  if (needsTotal && (total === null || total < 1 || total > MAX_ALIGNERS_PER_ORDER)) {
    errors.total = t('alignerDeliveries.validation.total', { max: MAX_ALIGNERS_PER_ORDER });
  }

  if (from !== null && to !== null && from >= 1 && to >= 1) {
    if (from > to) {
      errors.to = t('alignerDeliveries.validation.order');
    } else if (total !== null && total >= 1 && to > total) {
      errors.to = t('alignerDeliveries.validation.beyondTotal', { total });
    } else {
      const clash = summary.deliveries.find(
        (d) => from <= d.toAligner && to >= d.fromAligner,
      );
      if (clash) {
        errors.from = t('alignerDeliveries.validation.overlap', {
          from: clash.fromAligner,
          to: clash.toAligner,
          date: formatCalendarDate(clash.deliveredAt, lang),
        });
      }
    }
  }
  return errors;
}

function RecordDeliveryDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  orderId,
  summary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
  orderId: string;
  summary: AlignerDeliverySummary;
}) {
  const { t, lang } = useT();
  const record = useRecordAlignerDelivery(orderId);
  const today = todayCalendarDate();
  const needsTotal = summary.totalAligners === null;

  const [date, setDate] = useState(today);
  const [from, setFrom] = useState(summary.nextAligner ? String(summary.nextAligner) : '');
  const [to, setTo] = useState('');
  const [total, setTotal] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const errors = validateDelivery({ date, from, to, total }, summary, today, t, lang);
  const hasErrors = Object.keys(errors).length > 0;
  // "Required" only after a submit attempt; value-based problems
  // (overlap, beyond the series, from > to) show as soon as they exist.
  const shown = (field: DeliveryField): string | undefined => {
    const message = errors[field];
    if (!message) return undefined;
    const isRequired = message === t('alignerDeliveries.validation.required');
    return isRequired && !submitted ? undefined : message;
  };

  const fromN = toInt(from);
  const toN = toInt(to);
  const quantity = fromN !== null && toN !== null && toN >= fromN ? toN - fromN + 1 : null;

  const handleSubmit = () => {
    setSubmitted(true);
    if (hasErrors || fromN === null || toN === null) return;
    record.mutate(
      {
        fromAligner: fromN,
        toAligner: toN,
        deliveredAt: date,
        ...(needsTotal ? { totalAligners: toInt(total) ?? undefined } : {}),
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" />
            {t('alignerDeliveries.form.title')}
          </DialogTitle>
          <DialogDescription>{t('alignerDeliveries.form.description')}</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <Field id="delivery-date" label={t('alignerDeliveries.form.date')} error={shown('date')}>
            <Input
              id="delivery-date"
              type="date"
              value={date}
              min={summary.earliestDeliveryDate ?? undefined}
              max={today}
              onChange={(event) => setDate(event.target.value)}
              aria-invalid={!!shown('date')}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="delivery-from" label={t('alignerDeliveries.form.from')} error={shown('from')}>
              <IntegerInput id="delivery-from" value={from} onChange={setFrom} invalid={!!shown('from')} />
            </Field>
            <Field id="delivery-to" label={t('alignerDeliveries.form.to')} error={shown('to')}>
              <IntegerInput id="delivery-to" value={to} onChange={setTo} invalid={!!shown('to')} autoFocus />
            </Field>
          </div>

          {needsTotal ? (
            <Field
              id="delivery-total"
              label={t('alignerDeliveries.form.total')}
              hint={t('alignerDeliveries.form.totalHint')}
              error={shown('total')}
            >
              <IntegerInput id="delivery-total" value={total} onChange={setTotal} invalid={!!shown('total')} />
            </Field>
          ) : null}

          {quantity !== null ? (
            <p className="text-sm text-muted-foreground tabular-nums">
              {t('alignerDeliveries.form.quantity', { count: quantity })}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('alignerDeliveries.form.cancel')}
            </Button>
            <Button
              type="submit"
              className="gap-2"
              disabled={record.isPending || (submitted && hasErrors)}
            >
              {record.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t('alignerDeliveries.form.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Correct the series size ──────────────────────────────────────────

function EditTotalDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  orderId,
  summary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
  orderId: string;
  summary: AlignerDeliverySummary;
}) {
  const { t } = useT();
  const update = useUpdateAlignerTotal(orderId);
  const [value, setValue] = useState(summary.totalAligners ? String(summary.totalAligners) : '');
  const highest = summary.deliveries.reduce((max, d) => Math.max(max, d.toAligner), 0);

  const total = toInt(value);
  const error =
    total === null || total < 1 || total > MAX_ALIGNERS_PER_ORDER
      ? t('alignerDeliveries.validation.total', { max: MAX_ALIGNERS_PER_ORDER })
      : total < highest
        ? t('alignerDeliveries.validation.totalBelow', { min: highest })
        : undefined;
  const unchanged = total === summary.totalAligners;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            {t('alignerDeliveries.totalForm.title')}
          </DialogTitle>
          <DialogDescription>{t('alignerDeliveries.totalForm.description')}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (error || unchanged || total === null) return;
            update.mutate(total, { onSuccess: () => onOpenChange(false) });
          }}
        >
          <Field id="aligner-total" label={t('alignerDeliveries.totalForm.label')} error={value ? error : undefined}>
            <IntegerInput id="aligner-total" value={value} onChange={setValue} invalid={!!(value && error)} autoFocus />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('alignerDeliveries.form.cancel')}
            </Button>
            <Button type="submit" className="gap-2" disabled={update.isPending || !!error || unchanged}>
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('alignerDeliveries.totalForm.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Form primitives ──────────────────────────────────────────────────

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Aligner numbers: a plain text field that only takes digits (no spinner). */
function IntegerInput({
  id,
  value,
  onChange,
  invalid,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={3}
      value={value}
      autoFocus={autoFocus}
      aria-invalid={invalid}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
    />
  );
}
