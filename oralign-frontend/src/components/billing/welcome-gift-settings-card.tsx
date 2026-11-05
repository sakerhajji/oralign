'use client';

import { useId } from 'react';
import Link from 'next/link';
import { Gift, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSetWelcomeGiftEnabled } from '@/lib/hooks/use-company-billing';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';
import type { CompanyBillingSettings } from '@/lib/types';

/**
 * "Cadeau Oralign" — the master on/off of the welcome gift, at the top of
 * the billing settings. The switch saves on its own, at once (optimistic,
 * rolled back if the server refuses), independently of the form's Save
 * button: it sends only `welcomeGiftEnabled`. Per-practitioner control
 * lives in Users → practitioner profile.
 */
export function WelcomeGiftSettingsCard({
  settings,
}: {
  /** The saved settings row; null while none exists yet. */
  settings: CompanyBillingSettings | null;
}) {
  const { t } = useT();
  const setEnabled = useSetWelcomeGiftEnabled();
  const switchId = useId();
  const descriptionId = useId();

  // The cached row (patched optimistically by the mutation) is the switch's
  // only source of truth. An API without the column counts as on, like the
  // backend default.
  const enabled = settings?.welcomeGiftEnabled ?? true;
  // A toggle alone cannot create the row: that needs the company name.
  const canToggle = settings !== null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span
            aria-hidden
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-lg transition-colors',
              enabled
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-muted text-muted-foreground',
            )}
          >
            <Gift className="size-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base leading-snug font-medium">
                {t('settingsDesk.gift.title')}
              </h2>
              <Badge
                variant="outline"
                className={cn(
                  enabled
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'text-muted-foreground',
                )}
              >
                {enabled ? t('settingsDesk.gift.statusOn') : t('settingsDesk.gift.statusOff')}
              </Badge>
            </div>
            <p id={descriptionId} className="text-sm text-muted-foreground">
              {t('settingsDesk.gift.description')}
            </p>
            <p className="text-xs text-muted-foreground">{t('settingsDesk.gift.offNote')}</p>
            <p className="text-xs text-muted-foreground">
              {t('settingsDesk.gift.manageDoctors')}{' '}
              <Link
                href="/dashboard/users"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {t('settingsDesk.gift.openUsers')}
              </Link>
            </p>
            {!canToggle && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {t('settingsDesk.gift.needsSettings')}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-1 sm:items-end">
          <div className="flex items-center gap-3">
            <Label htmlFor={switchId} className="cursor-pointer">
              {t('settingsDesk.gift.switchLabel')}
            </Label>
            <Switch
              id={switchId}
              checked={enabled}
              disabled={!canToggle || setEnabled.isPending}
              onCheckedChange={(checked) => setEnabled.mutate(checked)}
              aria-describedby={descriptionId}
            />
          </div>
          <p className="flex min-h-4 items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            {setEnabled.isPending ? (
              <>
                <Loader2 className="size-3 animate-spin" aria-hidden />
                {t('settingsDesk.gift.saving')}
              </>
            ) : (
              t('settingsDesk.gift.instantHint')
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
