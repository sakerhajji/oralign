'use client';

import { Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useBillingRuleFormat } from '@/components/billing/billing-rule-format';
import { isActivation, type BillingRuleChange } from '@/lib/billing/billing-settings-rules';
import { useT } from '@/lib/i18n/lang-context';

/**
 * Asked before a save that moves a fiscal or rollout setting (retenue,
 * stamp, TVA, inactivity rule): each change from → to, a warning when the
 * retenue or the inactivity sweep is switched on, then the save. Nothing
 * is sent until the admin confirms.
 */
export function BillingRulesConfirmDialog({
  changes,
  currency,
  pending,
  onConfirm,
  onCancel,
}: {
  /** The changes to confirm; an empty list closes the dialog. */
  changes: BillingRuleChange[];
  currency: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const { fieldLabel, valueLabel } = useBillingRuleFormat(currency);
  const open = changes.length > 0;
  const activations = changes.filter(isActivation);
  const turnsOn = (field: BillingRuleChange['field']) => activations.some((c) => c.field === field);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('withholdingRules.confirm.title')}</DialogTitle>
          <DialogDescription>{t('withholdingRules.confirm.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-3">
          <dl
            aria-label={t('withholdingRules.confirm.changesLabel')}
            className="divide-y rounded-lg border text-sm"
          >
            {changes.map((change) => (
              <div
                key={change.field}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2"
              >
                <dt className="min-w-0 text-muted-foreground">{fieldLabel(change.field)}</dt>
                <dd className="ml-auto text-right tabular-nums">
                  <span className="text-muted-foreground line-through decoration-muted-foreground/60">
                    {valueLabel(change.field, change.before)}
                  </span>
                  <span aria-hidden> → </span>
                  <span className="sr-only">, </span>
                  <span className="font-medium">{valueLabel(change.field, change.after)}</span>
                </dd>
              </div>
            ))}
          </dl>

          {turnsOn('withholdingEnabled') ? (
            <Warning>{t('withholdingRules.confirm.withholdingOn')}</Warning>
          ) : null}
          {turnsOn('inactivityRuleEnabled') ? (
            <Warning>{t('withholdingRules.confirm.inactivityOn')}</Warning>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={pending}
            className="pointer-coarse:h-12"
          >
            {t('withholdingRules.confirm.cancel')}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="gap-2 pointer-coarse:h-12"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t('withholdingRules.confirm.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Warning({ children }: { children: string }) {
  return (
    <p
      role="note"
      className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
