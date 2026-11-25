'use client';

import { useId, useRef, useState } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { productionKeys, useCancelProductionEvent } from '@/lib/hooks/use-production';
import { useT } from '@/lib/i18n/lang-context';
import type { ProductionArch, ProductionEventView } from '@/lib/types/production';
import { ProductionOverlay } from './production-overlay';
import {
  REASON_MAX,
  REASON_MIN,
  groupArchChoice,
  productionErrorText,
  stepsText,
  type DeclarationGroup,
} from './production-format';

/**
 * Cancel one declaration (or one of its arches) with a reason. The rows
 * offered are the live ones the server lets this user cancel now
 * (`canCancel`: her own, under 24 h; any row for an admin).
 */
export function ProductionCancelDialog({
  group,
  onOpenChange,
  onCloseAutoFocus,
}: {
  /** The declaration to cancel; null = closed. */
  group: DeclarationGroup | null;
  onOpenChange: (open: boolean) => void;
  /**
   * Where focus lands once closed: after a cancel the row's "Annuler" is
   * gone, and with no trigger to return to, focus would fall to the page.
   */
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const { t } = useT();
  // The cancel in flight: the dialog holds until it answers.
  const busy = useIsMutating({ mutationKey: productionKeys.cancelWrite() }) > 0;
  // Keep the last declaration while the dialog animates closed.
  const [shown, setShown] = useState(group);
  if (group && group !== shown) setShown(group);

  return (
    <ProductionOverlay
      open={!!group}
      onOpenChange={onOpenChange}
      busy={busy}
      onCloseAutoFocus={onCloseAutoFocus}
      desktop="dialog"
      title={t('production.cancel.title')}
      description={
        shown
          ? t('production.form.summary', {
              act: t(`production.acts.${shown.lead.type}`),
              arch: t(`production.archesShort.${groupArchChoice(shown.rows)}`),
              steps: stepsText(t, shown.lead.stepFrom, shown.lead.stepTo),
            })
          : undefined
      }
    >
      {shown && (
        <CancelForm
          key={shown.declarationId}
          group={shown}
          onDone={() => onOpenChange(false)}
          onKeep={() => onOpenChange(false)}
        />
      )}
    </ProductionOverlay>
  );
}

function CancelForm({
  group,
  onDone,
  onKeep,
}: {
  group: DeclarationGroup;
  onDone: () => void;
  onKeep: () => void;
}) {
  const { t } = useT();
  const cancel = useCancelProductionEvent();
  const uid = useId();
  const cancellable = group.rows.filter((row) => !row.cancelledAt && row.canCancel);
  const [selected, setSelected] = useState<Set<ProductionArch>>(
    () => new Set(cancellable.map((row) => row.arch)),
  );
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [archError, setArchError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const firstArchRef = useRef<HTMLButtonElement>(null);

  const toggle = (arch: ProductionArch, on: boolean) => {
    setArchError(null);
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(arch);
      else next.delete(arch);
      return next;
    });
  };

  const submit = () => {
    if (cancel.isPending) return;
    const trimmed = reason.trim();
    const chosen: ProductionEventView[] = cancellable.filter((row) => selected.has(row.arch));
    const reasonInvalid = trimmed.length < REASON_MIN || trimmed.length > REASON_MAX;
    if (reasonInvalid) {
      setReasonError(
        t(trimmed.length < REASON_MIN ? 'production.cancel.errors.reasonShort' : 'production.cancel.errors.reasonLong'),
      );
    }
    if (chosen.length === 0) setArchError(t('production.cancel.errors.noArch'));
    if (reasonInvalid || chosen.length === 0) {
      // Focus the first field to fix, in the form's order (arches, then reason).
      ((chosen.length === 0 ? firstArchRef.current : null) ?? reasonRef.current)?.focus();
      return;
    }
    const [target, sibling] = chosen;
    setFormError(null);
    cancel.mutate(
      {
        eventId: target.id,
        orderId: target.orderId,
        input: { reason: trimmed, ...(sibling ? { alsoSibling: true } : {}) },
      },
      {
        onSuccess: () => {
          toast.success(t('production.cancel.done'));
          onDone();
        },
        onError: (error) => setFormError(productionErrorText(t, error, { write: true })),
      },
    );
  };

  const reasonId = `${uid}-reason`;
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <p className="text-sm text-muted-foreground">{t('production.cancel.intro')}</p>

      {cancellable.length > 1 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">{t('production.cancel.arches')}</legend>
          {cancellable.map((row, index) => {
            const id = `${uid}-${row.arch}`;
            return (
              <label
                key={row.id}
                htmlFor={id}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted/60"
              >
                <Checkbox
                  ref={index === 0 ? firstArchRef : undefined}
                  id={id}
                  checked={selected.has(row.arch)}
                  onCheckedChange={(checked) => toggle(row.arch, checked === true)}
                  aria-describedby={archError ? `${uid}-arch-error` : undefined}
                  className="size-5"
                />
                <span className="text-sm">{t(`production.arches.${row.arch}`)}</span>
              </label>
            );
          })}
          {archError && (
            <p id={`${uid}-arch-error`} role="alert" className="text-xs font-medium text-destructive">
              {archError}
            </p>
          )}
        </fieldset>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={reasonId} className="text-sm font-medium">
          {t('production.cancel.reason')}
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
          placeholder={t('production.cancel.reasonPh')}
          className="min-h-24 text-base md:text-sm"
        />
        <p id={`${reasonId}-hint`} className="text-xs text-muted-foreground">
          {t('production.cancel.reasonHint')}
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
          variant="destructive"
          className="h-14 text-base pointer-fine:md:h-10 md:flex-1 md:text-sm"
          disabled={cancel.isPending}
        >
          {cancel.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {cancel.isPending ? t('production.cancel.submitting') : t('production.cancel.submit')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12 pointer-fine:md:h-10"
          onClick={onKeep}
          disabled={cancel.isPending}
        >
          {t('production.cancel.keep')}
        </Button>
      </div>
    </form>
  );
}
