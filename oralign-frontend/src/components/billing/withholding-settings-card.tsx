'use client';

import { useId } from 'react';
import { Percent, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SettingsField } from '@/components/billing/settings-field';
import { previewPaymentCharge } from '@/lib/billing/tax-split';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/utils/currency';

/** The example payment when the threshold is 0 (every payment qualifies). */
const EXAMPLE_WITHOUT_THRESHOLD = 1000;

export type WithholdingDraftKey = 'withholdingRate' | 'withholdingThreshold';

/**
 * "Retenue à la source" in the billing settings (spec §4): the switch, the
 * rate and the threshold, saved with the form. It says plainly that the
 * accountant validates the rule before it is switched on, and previews a
 * payment at the threshold with the values typed.
 */
export function WithholdingSettingsCard({
  savedEnabled,
  enabled,
  onEnabledChange,
  rate,
  threshold,
  onValueChange,
  rateError,
  thresholdError,
  parsedRate,
  parsedThreshold,
  stampDuty,
  currency,
  lastChange,
}: {
  /** The switch as saved: what applies to payments right now. */
  savedEnabled: boolean;
  /** The switch as drafted. */
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  rate: string;
  threshold: string;
  onValueChange: (name: WithholdingDraftKey, value: string) => void;
  rateError?: string;
  thresholdError?: string;
  /** The drafts parsed (null when invalid), for the example. */
  parsedRate: number | null;
  parsedThreshold: number | null;
  /** The stamp drafted in the form (null when invalid). */
  stampDuty: number | null;
  currency: string;
  /** "27 nov. 2026, 14:02" + the admin, from the history; null when none. */
  lastChange: { date: string; actor: string } | null;
}) {
  const { t } = useT();
  const switchId = useId();
  const helpId = useId();
  const noticeId = useId();

  const exampleAmount =
    parsedThreshold !== null && parsedThreshold > 0 ? parsedThreshold : EXAMPLE_WITHOUT_THRESHOLD;
  const example =
    enabled && parsedRate !== null && parsedRate > 0 && parsedThreshold !== null
      ? previewPaymentCharge(exampleAmount, stampDuty ?? 0, parsedRate, true)
      : null;
  const money = (value: number) => formatPrice(value, currency);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Percent className="h-4 w-4 text-primary" aria-hidden />
          {t('withholdingRules.settings.title')}
          <Badge
            variant="outline"
            className={cn(
              savedEnabled
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'text-muted-foreground',
            )}
          >
            {savedEnabled
              ? t('withholdingRules.settings.statusOn')
              : t('withholdingRules.settings.statusOff')}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {t('withholdingRules.settings.description')}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          id={noticeId}
          role="note"
          className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium">{t('withholdingRules.settings.accountantTitle')}</p>
            <p className="text-xs leading-relaxed">
              {t('withholdingRules.settings.accountantBody')}
            </p>
          </div>
        </div>

        {/* The label is the whole row: a ≥ 48 px target on a touch screen. */}
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:p-4">
          <Label
            htmlFor={switchId}
            className="flex min-h-12 flex-1 cursor-pointer flex-col items-start justify-center gap-0.5 leading-snug pointer-fine:min-h-0"
          >
            <span className="font-medium">{t('withholdingRules.settings.switchLabel')}</span>
            <span id={helpId} className="text-xs font-normal text-muted-foreground">
              {t('withholdingRules.settings.switchHelp')}
            </span>
          </Label>
          <Switch
            id={switchId}
            checked={enabled}
            onCheckedChange={onEnabledChange}
            aria-describedby={`${helpId} ${noticeId}`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SettingsField
            name="withholdingRate"
            label={t('withholdingRules.settings.rateLabel')}
            value={rate}
            inputMode="decimal"
            onValueChange={onValueChange}
            placeholder="1"
            helper={t('withholdingRules.settings.rateHelp')}
            error={rateError}
            numeric
          />
          <SettingsField
            name="withholdingThreshold"
            label={t('withholdingRules.settings.thresholdLabel', { currency })}
            value={threshold}
            inputMode="decimal"
            onValueChange={onValueChange}
            placeholder="1000"
            helper={t('withholdingRules.settings.thresholdHelp')}
            error={thresholdError}
            numeric
          />
        </div>

        {/* Hidden while a typed value is invalid: its error says why. */}
        {!enabled || example ? (
          <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs leading-relaxed" aria-live="polite">
            <span className="font-medium">{t('withholdingRules.settings.exampleTitle')} · </span>
            <span className="text-muted-foreground tabular-nums">
              {!example
                ? t('withholdingRules.settings.exampleOff')
                : example.stamp > 0
                  ? t('withholdingRules.settings.exampleEligible', {
                      amount: money(example.due),
                      withheld: money(example.withholding),
                      cash: money(example.cash),
                      stamp: money(example.stamp),
                    })
                  : t('withholdingRules.settings.exampleEligibleNoStamp', {
                      amount: money(example.due),
                      withheld: money(example.withholding),
                      cash: money(example.cash),
                    })}
            </span>
          </p>
        ) : null}

        {lastChange ? (
          <p className="text-xs text-muted-foreground">
            {t('withholdingRules.settings.lastChange', lastChange)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
