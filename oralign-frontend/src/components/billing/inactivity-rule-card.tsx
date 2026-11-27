'use client';

import { useId } from 'react';
import { CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SettingsField } from '@/components/billing/settings-field';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';

/**
 * "Inactivité des praticiens" in the billing settings (spec §5): the
 * rollout switch of the daily sweep and the period in calendar months,
 * saved with the form. It spells out what a deactivation does and does not
 * do, and that the first run only warns. The sweep itself lives in the
 * backend's users/activity module.
 */
export function InactivityRuleCard({
  savedEnabled,
  enabled,
  onEnabledChange,
  months,
  onMonthsChange,
  monthsError,
}: {
  /** The switch as saved: whether the sweep runs right now. */
  savedEnabled: boolean;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  months: string;
  onMonthsChange: (name: 'inactivityMonths', value: string) => void;
  monthsError?: string;
}) {
  const { t } = useT();
  const switchId = useId();
  const helpId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
          {t('settingsDesk.inactivity.title')}
          <Badge
            variant="outline"
            className={cn(
              savedEnabled
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'text-muted-foreground',
            )}
          >
            {savedEnabled
              ? t('settingsDesk.inactivity.statusOn')
              : t('settingsDesk.inactivity.statusOff')}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t('settingsDesk.inactivity.description')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('settingsDesk.inactivity.effects')}
        </p>

        <div className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:p-4">
          <Label
            htmlFor={switchId}
            className="flex min-h-12 flex-1 cursor-pointer flex-col items-start justify-center gap-0.5 leading-snug pointer-fine:min-h-0"
          >
            <span className="font-medium">{t('settingsDesk.inactivity.switchLabel')}</span>
            <span id={helpId} className="text-xs font-normal text-muted-foreground">
              {t('settingsDesk.inactivity.firstRunNote')}
            </span>
          </Label>
          <Switch
            id={switchId}
            checked={enabled}
            onCheckedChange={onEnabledChange}
            aria-describedby={helpId}
          />
        </div>

        <SettingsField
          name="inactivityMonths"
          label={t('settingsDesk.inactivity.monthsLabel')}
          value={months}
          inputMode="numeric"
          onValueChange={onMonthsChange}
          placeholder="6"
          helper={t('settingsDesk.inactivity.monthsHelp')}
          error={monthsError}
          numeric
          className="sm:max-w-xs"
        />
      </CardContent>
    </Card>
  );
}
