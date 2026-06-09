'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AccountSkeleton } from '@/components/account/account-skeleton';
import { AccountOverviewCard } from '@/components/account/account-overview-card';
import { ClinicOverviewCard } from '@/components/account/clinic-overview-card';
import { useAccountData } from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';

export function AccountPageContent() {
  const { t } = useT();
  const { user, dentistProfile, workingHours, isDentist, isLoading, error } = useAccountData();

  return (
    <div className="@container/main flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-6 py-6">
        <div className="px-4 lg:px-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{t('accountHome.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('accountHome.subtitle')}
            </p>
          </div>
        </div>
        <div className="px-4 lg:px-6">
          {isLoading && <AccountSkeleton />}
          {!isLoading && error && (
            <Alert variant="destructive">
              <AlertTitle>{t('accountHome.unableToLoad')}</AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : t('accountHome.tryAgainLater')}
              </AlertDescription>
            </Alert>
          )}
          {!isLoading && !error && user && (
            <div className="space-y-6">
              <AccountOverviewCard user={user} />
              {isDentist && (
                <ClinicOverviewCard profile={dentistProfile} workingHours={workingHours} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
