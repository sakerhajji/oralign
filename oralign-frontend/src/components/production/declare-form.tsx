'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { newIdempotencyKey, readProductionError } from '@/lib/api/production.service';
import { productionKeys, useDeclareProductionEvent } from '@/lib/hooks/use-production';
import { useT } from '@/lib/i18n/lang-context';
import { useAuth } from '@/lib/providers/auth-provider';
import {
  DELIVERY_RECIPIENTS,
  PRODUCTION_ERROR,
  type DeclareProductionEventInput,
  type DeliveryRecipient,
  type ProductionArchChoice,
  type ProductionCaseSheet,
  type ProductionDeclareResult,
  type ProductionEventType,
  type ProductionWarningCode,
} from '@/lib/types/production';
import { cn } from '@/lib/utils';
import { formatCalendarDay } from '@/lib/utils/business-day';
import { NumberStepper, parseCount } from './number-stepper';
import { ProductionOverlay } from './production-overlay';
import {
  ARCHES,
  MAX_QUANTITY,
  MAX_STEP,
  MIN_STEP,
  NOTE_MAX,
  RECIPIENT_NAME_MAX,
  archesOf,
  choiceOf,
  defaultStepTo,
  isInFuture,
  isTechnicianRole,
  nextStepFor,
  plannedTotalFor,
  productionErrorText,
  stepsText,
  tunisNow,
  unreleasedParts,
  type Translate,
} from './production-format';

/** What the form needs from the case sheet (the admin's batch button loads it too). */
export type DeclareContext = Pick<
  ProductionCaseSheet,
  | 'orderId'
  | 'orderCode'
  | 'patientName'
  | 'treatedArches'
  | 'planned'
  | 'nextStepFrom'
  | 'releasedRanges'
  | 'declareWindow'
>;

/** A prefilled declaration (the "Marquer livré" button of a batch). */
export interface DeclarePreset {
  arch: ProductionArchChoice;
  stepFrom: number;
  stepTo: number;
}

/**
 * The declaration form of one act: a bottom sheet on a phone, a side
 * sheet from md up. Every opening starts a fresh form (and so a fresh
 * Idempotency-Key); the content stays while the sheet animates closed.
 */
export function ProductionDeclareSheet({
  open,
  onOpenChange,
  context,
  act,
  preset,
  onDeclared,
  loadError,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null while the case is loading. */
  context: DeclareContext | null;
  act: ProductionEventType;
  preset?: DeclarePreset;
  onDeclared?: (result: ProductionDeclareResult) => void;
  /** The case could not be loaded (shown instead of the form). */
  loadError?: string | null;
  onRetry?: () => void;
}) {
  const { t } = useT();
  // The form's own write in flight: the sheet holds until it answers.
  const busy = useIsMutating({ mutationKey: productionKeys.declareWrite() }) > 0;
  const [opening, setOpening] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpening((count) => count + 1);
  }

  return (
    <ProductionOverlay
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={t(`production.acts.${act}`)}
      description={
        context
          ? t('production.form.description', {
              code: context.orderCode,
              patient: context.patientName,
            })
          : t('production.form.loading')
      }
    >
      {context ? (
        <DeclareForm
          key={opening}
          context={context}
          act={act}
          preset={preset}
          onDone={(result) => {
            onDeclared?.(result);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      ) : loadError ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{loadError}</p>
          {onRetry && (
            <Button type="button" variant="outline" className="h-12 pointer-fine:md:h-8" onClick={onRetry}>
              {t('production.retry')}
            </Button>
          )}
        </div>
      ) : (
        <FormSkeleton />
      )}
    </ProductionOverlay>
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
      </div>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-14 w-full rounded-xl" />
    </div>
  );
}

// ─── The form ───────────────────────────────────────────────────────

type FieldErrors = Partial<Record<'from' | 'to' | 'quantity' | 'day' | 'time' | 'note', string>>;

interface Draft {
  arch: ProductionArchChoice;
  fromText: string;
  toText: string;
  /** null = derived from the steps. */
  quantityText: string | null;
  whenMode: 'now' | 'custom';
  day: string;
  time: string;
  recipient: DeliveryRecipient;
  recipientName: string;
}

function defaultSteps(
  context: DeclareContext,
  act: ProductionEventType,
  arch: ProductionArchChoice,
): { from: number; to: number } {
  const arches = archesOf(arch);
  const from = nextStepFor(context.nextStepFrom[act], arches) ?? MIN_STEP;
  return {
    from,
    to: defaultStepTo(from, context.releasedRanges, plannedTotalFor(context.planned, arches)),
  };
}

function initialDraft(
  context: DeclareContext,
  act: ProductionEventType,
  preset: DeclarePreset | undefined,
): Draft {
  // Default arch: the treated arches still to do for this act (an arch
  // already complete would only raise "already declared").
  const treated = context.treatedArches.length ? context.treatedArches : ARCHES;
  const open = treated.filter((arch) => context.nextStepFrom[act][arch] !== null);
  const arch = preset?.arch ?? choiceOf(open.length ? open : treated);
  const steps = preset ? { from: preset.stepFrom, to: preset.stepTo } : defaultSteps(context, act, arch);
  const now = tunisNow();
  return {
    arch,
    fromText: String(steps.from),
    toText: String(steps.to),
    quantityText: null,
    whenMode: 'now',
    day: now.day,
    time: now.time,
    recipient: 'practitioner',
    recipientName: '',
  };
}

function DeclareForm({
  context,
  act,
  preset,
  onDone,
  onCancel,
}: {
  context: DeclareContext;
  act: ProductionEventType;
  preset?: DeclarePreset;
  onDone: (result: ProductionDeclareResult) => void;
  onCancel: () => void;
}) {
  const { t, lang } = useT();
  const { user } = useAuth();
  const technician = isTechnicianRole(user?.role);
  const declare = useDeclareProductionEvent();
  const uid = useId();
  const ids = {
    from: `${uid}-from`,
    to: `${uid}-to`,
    quantity: `${uid}-quantity`,
    day: `${uid}-day`,
    time: `${uid}-time`,
    note: `${uid}-note`,
    noteHint: `${uid}-note-hint`,
    warnings: `${uid}-warnings`,
    name: `${uid}-name`,
    error: `${uid}-error`,
    stepsHint: `${uid}-steps-hint`,
  };

  const [draft, setDraft] = useState<Draft>(() => initialDraft(context, act, preset));
  const [stepsTouched, setStepsTouched] = useState(!!preset);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<ProductionWarningCode[]>([]);
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  // One key per declaration attempt: kept for every retry of the same
  // input (a double tap or a lost answer never writes twice), renewed as
  // soon as the input itself changes. Note and confirmations are not part
  // of a declaration's identity on the server, so they keep the key.
  const keyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const fieldRefs = useRef<Partial<Record<keyof FieldErrors, HTMLElement | null>>>({});
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  // A new warning set (a confirmed retry answered with other warnings)
  // refocuses the note too: `warnings` is a new array on every 409.
  useEffect(() => {
    if (step === 'confirm') noteRef.current?.focus();
  }, [step, warnings]);

  const isDelivery = act === 'aligner_delivered';
  const arches = archesOf(draft.arch);
  const from = parseCount(draft.fromText);
  const to = parseCount(draft.toText);
  const derivedQuantity = from !== null && to !== null && to >= from ? to - from + 1 : null;
  const quantity = draft.quantityText === null ? derivedQuantity : parseCount(draft.quantityText);
  const { earliestDay, latestDay } = context.declareWindow;

  const update = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setFormError(null);
    // A changed entry goes back to the plain form: the server checks it again.
    if (step === 'confirm') setStep('edit');
  };
  const changeArch = (arch: ProductionArchChoice) => {
    if (!arch || arch === draft.arch) return;
    if (stepsTouched) {
      update({ arch });
      return;
    }
    const steps = defaultSteps(context, act, arch);
    update({ arch, fromText: String(steps.from), toText: String(steps.to) });
  };
  const changeSteps = (patch: Pick<Partial<Draft>, 'fromText' | 'toText'>) => {
    setStepsTouched(true);
    setErrors((current) => ({ ...current, from: undefined, to: undefined }));
    update(patch);
  };

  // ── Hints (the server decides; these only say it early) ──────────
  const nextByArch = context.nextStepFrom[act];
  const archesDiffer =
    draft.arch === 'both' &&
    nextByArch.upper !== null &&
    nextByArch.lower !== null &&
    nextByArch.upper !== nextByArch.lower;
  const actComplete =
    !stepsTouched && arches.every((arch) => context.treatedArches.includes(arch) && nextByArch[arch] === null);
  const unreleased =
    isDelivery && from !== null && to !== null && to >= from
      ? unreleasedParts(from, to, context.releasedRanges)
      : [];
  // The approved plan's total is final: a technician may not go past it.
  const approvedTotals = arches.flatMap((arch) => {
    const planned = context.planned[arch];
    return planned?.source === 'approved_plan' && planned.total !== null ? [planned.total] : [];
  });
  const approvedTotal = approvedTotals.length ? Math.min(...approvedTotals) : null;

  // ── Validation ───────────────────────────────────────────────────
  const validate = (forConfirm: boolean): FieldErrors => {
    const next: FieldErrors = {};
    if (from === null || from < MIN_STEP || from > MAX_STEP) next.from = t('production.form.errors.stepRange');
    if (to === null || to < MIN_STEP || to > MAX_STEP) next.to = t('production.form.errors.stepRange');
    if (!next.from && !next.to && from !== null && to !== null && from > to) {
      next.to = t('production.form.errors.fromAfterTo');
    }
    // A technician cannot go past an approved plan (the server refuses it).
    if (!next.to && technician && approvedTotal !== null && to !== null && to > approvedTotal) {
      next.to = t('production.form.errors.beyondTotal', { total: approvedTotal });
    }
    if (draft.quantityText !== null && (quantity === null || quantity < 1 || quantity > MAX_QUANTITY)) {
      next.quantity = t('production.form.errors.quantityRange');
    }
    if (draft.whenMode === 'custom') {
      if (!draft.day) next.day = t('production.form.errors.dayRequired');
      else if (draft.day < earliestDay || draft.day > latestDay) {
        next.day = t('production.form.errors.dayOutOfWindow', {
          from: formatCalendarDay(earliestDay, lang, 'full'),
          to: formatCalendarDay(latestDay, lang, 'full'),
        });
      }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) next.time = t('production.form.errors.timeRequired');
      else if (!next.day && isInFuture(draft.day, draft.time)) next.time = t('production.form.errors.future');
    }
    if (forConfirm && !note.trim()) next.note = t('production.form.errors.noteRequired');
    return next;
  };

  const buildInput = (confirmWarnings?: ProductionWarningCode[]): DeclareProductionEventInput => ({
    orderId: context.orderId,
    type: act,
    arch: draft.arch,
    stepFrom: from as number,
    stepTo: to as number,
    ...(draft.quantityText !== null && quantity !== null ? { quantity } : {}),
    ...(draft.whenMode === 'custom' ? { performedDay: draft.day, performedTime: draft.time } : {}),
    ...(note.trim() ? { note: note.trim() } : {}),
    ...(isDelivery
      ? {
          deliveredTo: draft.recipient,
          ...(draft.recipientName.trim() ? { deliveredToName: draft.recipientName.trim() } : {}),
        }
      : {}),
    ...(confirmWarnings?.length ? { confirmWarnings } : {}),
  });

  const submit = (confirmWarnings?: ProductionWarningCode[]) => {
    if (declare.isPending) return;
    const found = validate(!!confirmWarnings);
    setErrors(found);
    const firstInvalid = (['from', 'to', 'quantity', 'day', 'time', 'note'] as const).find((key) => found[key]);
    if (firstInvalid) {
      (firstInvalid === 'note' ? noteRef.current : fieldRefs.current[firstInvalid])?.focus();
      return;
    }
    const input = buildInput(confirmWarnings);
    const fingerprint = JSON.stringify({ ...input, note: undefined, confirmWarnings: undefined });
    if (keyRef.current?.fingerprint !== fingerprint) {
      keyRef.current = { fingerprint, key: newIdempotencyKey() };
    }
    setFormError(null);
    declare.mutate(
      { input, idempotencyKey: keyRef.current.key },
      {
        onSuccess: (result) => {
          const summary = t('production.form.summary', {
            act: t(`production.acts.${act}`),
            arch: t(`production.archesShort.${draft.arch}`),
            steps: stepsText(t, input.stepFrom, input.stepTo),
          });
          if (result.replayed) toast.info(t('production.form.replayed'));
          else toast.success(t('production.form.saved', { summary }));
          onDone(result);
        },
        onError: (error) => {
          const info = readProductionError(error);
          if (info.errorCode === PRODUCTION_ERROR.PRODUCTION_CONFIRM_REQUIRED && info.warnings.length) {
            setWarnings(info.warnings);
            setStep('confirm');
            return;
          }
          if (info.errorCode === PRODUCTION_ERROR.NOTE_REQUIRED) {
            setErrors({ note: t('production.form.errors.noteRequired') });
            if (step === 'confirm') noteRef.current?.focus();
            else setFormError(t('production.errors.NOTE_REQUIRED'));
            return;
          }
          setFormError(productionErrorText(t, error, { write: true }));
        },
      },
    );
  };

  const pending = declare.isPending;
  const errorBox = formError ? (
    <p
      id={ids.error}
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {formError}
    </p>
  ) : null;

  // ── Confirmation step ────────────────────────────────────────────
  if (step === 'confirm') {
    return (
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit(warnings);
        }}
      >
        {/* Mounted with the step, so the alert is announced as it appears. */}
        <div
          id={ids.warnings}
          role="alert"
          className="rounded-xl bg-amber-50 p-4 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900"
        >
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="size-4" aria-hidden="true" />
            {t('production.form.confirmTitle')}
          </p>
          <p className="mt-1 text-sm">{t('production.form.confirmIntro')}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {warnings.map((code) => (
              <li key={code} className="text-sm">
                <span className="font-medium">{t(`production.warnings.${code}.title`)}</span>
                {' — '}
                {t(`production.warnings.${code}.detail`)}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-muted-foreground">
          {t('production.form.summary', {
            act: t(`production.acts.${act}`),
            arch: t(`production.archesShort.${draft.arch}`),
            steps: stepsText(t, from ?? 0, to ?? 0),
          })}
        </p>

        <Field
          label={t('production.form.note')}
          tag={t('production.form.noteRequired')}
          htmlFor={ids.note}
          error={errors.note}
          errorId={`${ids.note}-error`}
          hint={t('production.form.confirmNoteHint')}
          hintId={ids.noteHint}
        >
          <Textarea
            ref={noteRef}
            id={ids.note}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setErrors((current) => ({ ...current, note: undefined }));
            }}
            maxLength={NOTE_MAX}
            rows={3}
            required
            aria-required="true"
            aria-invalid={!!errors.note || undefined}
            aria-describedby={[ids.warnings, ids.noteHint, errors.note && `${ids.note}-error`]
              .filter(Boolean)
              .join(' ')}
            placeholder={t('production.form.notePh')}
            className="min-h-24 text-base md:text-sm"
          />
        </Field>

        {errorBox}

        <div className="flex flex-col gap-2 md:flex-row-reverse">
          <Button type="submit" className="h-14 text-base pointer-fine:md:h-11 md:flex-1" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {pending ? t('production.form.submitting') : t('production.form.confirmSubmit')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 pointer-fine:md:h-11"
            disabled={pending}
            onClick={() => {
              setStep('edit');
              setFormError(null);
            }}
          >
            {t('production.form.confirmBack')}
          </Button>
        </div>
      </form>
    );
  }

  // ── Plain form ───────────────────────────────────────────────────
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t('production.form.arch')}</legend>
        <ToggleGroup
          type="single"
          variant="outline"
          value={draft.arch}
          onValueChange={(value) => changeArch(value as ProductionArchChoice)}
          className="grid w-full grid-cols-3"
        >
          {(['upper', 'lower', 'both'] as const).map((choice) => {
            const untreated = archesOf(choice).some((arch) => !context.treatedArches.includes(arch));
            return (
              <ToggleGroupItem
                key={choice}
                value={choice}
                className="h-auto min-h-12 flex-col gap-0 px-1 py-1.5 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                <span>{t(choice === 'both' ? 'production.form.archBoth' : `production.arches.${choice}`)}</span>
                {untreated && (
                  <span className="text-[11px] font-normal opacity-80">
                    {t('production.form.archNotTreated')}
                  </span>
                )}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t('production.form.steps')}</legend>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.from} className="text-xs text-muted-foreground">
              {t('production.form.from')}
            </label>
            <NumberStepper
              ref={(node) => {
                fieldRefs.current.from = node;
              }}
              id={ids.from}
              label={t('production.form.from')}
              value={draft.fromText}
              onChange={(fromText) => changeSteps({ fromText })}
              min={MIN_STEP}
              max={MAX_STEP}
              invalid={!!errors.from}
              describedBy={errors.from ? `${ids.from}-error` : ids.stepsHint}
            />
            {errors.from && <FieldError id={`${ids.from}-error`}>{errors.from}</FieldError>}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.to} className="text-xs text-muted-foreground">
              {t('production.form.to')}
            </label>
            <NumberStepper
              ref={(node) => {
                fieldRefs.current.to = node;
              }}
              id={ids.to}
              label={t('production.form.to')}
              value={draft.toText}
              onChange={(toText) => changeSteps({ toText })}
              min={MIN_STEP}
              max={MAX_STEP}
              invalid={!!errors.to}
              describedBy={errors.to ? `${ids.to}-error` : ids.stepsHint}
            />
            {errors.to && <FieldError id={`${ids.to}-error`}>{errors.to}</FieldError>}
          </div>
        </div>
        <div id={ids.stepsHint} className="flex flex-col gap-1 text-xs text-muted-foreground">
          {archesDiffer && (
            <p>
              {t('production.form.nextPerArch', {
                upper: nextByArch.upper ?? '—',
                lower: nextByArch.lower ?? '—',
              })}
            </p>
          )}
          {actComplete && <p>{t('production.form.allCovered')}</p>}
          {unreleased.length > 0 && (
            <p className="text-amber-700 dark:text-amber-400">
              {t('production.form.hints.notReleased', {
                range: unreleased.map((part) => (part.from === part.to ? part.from : `${part.from}–${part.to}`)).join(', '),
              })}
            </p>
          )}
          {!technician && approvedTotal !== null && to !== null && to > approvedTotal && (
            <p className="text-amber-700 dark:text-amber-400">
              {t('production.form.hints.beyondTotal', { total: approvedTotal })}
            </p>
          )}
        </div>
      </fieldset>

      <QuantityField
        t={t}
        ids={ids}
        derived={derivedQuantity}
        perArchCount={arches.length}
        quantityText={draft.quantityText}
        error={errors.quantity}
        onChange={(quantityText) => {
          setErrors((current) => ({ ...current, quantity: undefined }));
          update({ quantityText });
        }}
        inputRef={(node) => {
          fieldRefs.current.quantity = node;
        }}
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{t('production.form.when')}</span>
          <Button
            type="button"
            variant="link"
            className="h-12 px-0 pointer-fine:md:h-8"
            onClick={() => {
              const now = tunisNow();
              setErrors((current) => ({ ...current, day: undefined, time: undefined }));
              update(
                draft.whenMode === 'now'
                  ? { whenMode: 'custom', day: now.day, time: now.time }
                  : { whenMode: 'now' },
              );
            }}
          >
            {draft.whenMode === 'now' ? t('production.form.whenEdit') : t('production.form.whenNow')}
          </Button>
        </div>
        {draft.whenMode === 'now' ? (
          <p className="text-sm text-muted-foreground">{t('production.form.now')}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor={ids.day} className="text-xs text-muted-foreground">
                  {t('production.form.day')}
                </label>
                <Input
                  ref={(node) => {
                    fieldRefs.current.day = node;
                  }}
                  id={ids.day}
                  type="date"
                  value={draft.day}
                  min={earliestDay}
                  max={latestDay}
                  onChange={(event) => {
                    setErrors((current) => ({ ...current, day: undefined, time: undefined }));
                    update({ day: event.target.value });
                  }}
                  aria-invalid={!!errors.day || undefined}
                  aria-describedby={errors.day ? `${ids.day}-error` : `${ids.day}-hint`}
                  className="h-12 text-base pointer-fine:md:h-9 md:text-sm"
                />
                {errors.day && <FieldError id={`${ids.day}-error`}>{errors.day}</FieldError>}
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={ids.time} className="text-xs text-muted-foreground">
                  {t('production.form.time')}
                </label>
                <Input
                  ref={(node) => {
                    fieldRefs.current.time = node;
                  }}
                  id={ids.time}
                  type="time"
                  step={60}
                  value={draft.time}
                  onChange={(event) => {
                    setErrors((current) => ({ ...current, time: undefined }));
                    update({ time: event.target.value });
                  }}
                  aria-invalid={!!errors.time || undefined}
                  aria-describedby={errors.time ? `${ids.time}-error` : undefined}
                  className="h-12 text-base pointer-fine:md:h-9 md:text-sm"
                />
                {errors.time && <FieldError id={`${ids.time}-error`}>{errors.time}</FieldError>}
              </div>
            </div>
            <p id={`${ids.day}-hint`} className="text-xs text-muted-foreground">
              {t('production.form.windowHint', { from: formatCalendarDay(earliestDay, lang, 'full') })}
            </p>
          </>
        )}
      </div>

      {isDelivery && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t('production.form.recipient')}</legend>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={2}
            value={draft.recipient}
            onValueChange={(value) => {
              if (value) update({ recipient: value as DeliveryRecipient });
            }}
            className="grid w-full grid-cols-3"
          >
            {DELIVERY_RECIPIENTS.map((recipient) => (
              <ToggleGroupItem
                key={recipient}
                value={recipient}
                className="h-12 rounded-full px-2 text-sm data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-foreground"
              >
                {t(`production.recipients.${recipient}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <label htmlFor={ids.name} className="mt-1 text-xs text-muted-foreground">
            {t('production.form.recipientName')}
          </label>
          <Input
            id={ids.name}
            value={draft.recipientName}
            onChange={(event) => update({ recipientName: event.target.value })}
            maxLength={RECIPIENT_NAME_MAX}
            autoComplete="off"
            placeholder={t('production.form.recipientNamePh')}
            className="h-12 text-base pointer-fine:md:h-9 md:text-sm"
          />
        </fieldset>
      )}

      <Field
        label={t('production.form.note')}
        tag={t('production.form.noteOptional')}
        htmlFor={ids.note}
        error={errors.note}
        errorId={`${ids.note}-error`}
      >
        <Textarea
          ref={noteRef}
          id={ids.note}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            setErrors((current) => ({ ...current, note: undefined }));
          }}
          maxLength={NOTE_MAX}
          rows={2}
          aria-invalid={!!errors.note || undefined}
          aria-describedby={errors.note ? `${ids.note}-error` : undefined}
          placeholder={t('production.form.notePh')}
          className="min-h-16 text-base md:text-sm"
        />
      </Field>

      {errorBox}

      {/* Pinned to the very bottom of the scrolling body (over its own
          padding), so the button never floats above a strip of content. */}
      <div className="sticky -bottom-4 -mx-1 flex flex-col gap-2 bg-popover px-1 pt-1 pb-4 md:-bottom-5 md:flex-row-reverse md:pb-5">
        <Button
          type="submit"
          className="h-14 text-base pointer-fine:md:h-11 md:flex-1"
          disabled={pending}
          aria-describedby={formError ? ids.error : undefined}
        >
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {pending ? t('production.form.submitting') : t('production.form.submit')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-12 pointer-fine:md:h-11"
          onClick={onCancel}
          disabled={pending}
        >
          {t('production.form.close')}
        </Button>
      </div>
    </form>
  );
}

function QuantityField({
  t,
  ids,
  derived,
  perArchCount,
  quantityText,
  error,
  onChange,
  inputRef,
}: {
  t: Translate;
  ids: { quantity: string };
  derived: number | null;
  perArchCount: number;
  quantityText: string | null;
  error?: string;
  onChange: (quantityText: string | null) => void;
  inputRef: (node: HTMLInputElement | null) => void;
}) {
  const shown = quantityText === null ? derived : parseCount(quantityText);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{t('production.form.quantity')}</span>
        <Button
          type="button"
          variant="link"
          className="h-12 px-0 pointer-fine:md:h-8"
          onClick={() => onChange(quantityText === null ? String(derived ?? 1) : null)}
        >
          {quantityText === null ? t('production.form.quantityEdit') : t('production.form.quantityReset')}
        </Button>
      </div>
      {quantityText === null ? (
        <p className="text-sm">
          <span className="text-lg font-semibold tabular-nums">
            {shown === null ? '—' : t('production.form.quantityPerArch', { count: shown })}
          </span>
          {perArchCount > 1 && shown !== null && (
            <span className="text-muted-foreground">
              {' · '}
              {t('production.form.quantityTotal', { count: shown * perArchCount })}
            </span>
          )}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.quantity} className="text-xs text-muted-foreground">
            {t('production.form.quantityLabel')}
          </label>
          <NumberStepper
            ref={inputRef}
            id={ids.quantity}
            label={t('production.form.quantityLabel')}
            value={quantityText}
            onChange={onChange}
            min={1}
            max={MAX_QUANTITY}
            invalid={!!error}
            describedBy={error ? `${ids.quantity}-error` : undefined}
            className="max-w-60"
          />
          {error && <FieldError id={`${ids.quantity}-error`}>{error}</FieldError>}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  tag,
  htmlFor,
  hint,
  hintId,
  error,
  errorId,
  children,
}: {
  label: string;
  tag?: string;
  htmlFor: string;
  hint?: string;
  hintId?: string;
  error?: string;
  errorId: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {tag && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({tag})</span>}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {children}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className={cn('text-xs font-medium text-destructive')} aria-live="polite">
      {children}
    </p>
  );
}
