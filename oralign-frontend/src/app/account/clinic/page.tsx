'use client';

import { Suspense } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AccountSkeleton } from '@/components/account/account-skeleton';
import { ClinicForm } from '@/components/account/clinic-form';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAccountData, useOnboardingStatus } from '@/lib/hooks';

// ── Inner component — uses useSearchParams, must be inside <Suspense> ─────────

function AccountClinicContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const onboarding = searchParams.get('onboarding') === '1';
  const { user, dentistProfile, workingHours, isDentist, isLoading, error } = useAccountData();
  const { profileComplete, clinicComplete, scheduleComplete } = useOnboardingStatus(
    user,
    dentistProfile,
    workingHours,
  );

  useEffect(() => {
    if (!onboarding || isLoading || !user) return;
    if (!profileComplete) {
      router.replace('/account/profile?onboarding=1');
      return;
    }
    if (clinicComplete && scheduleComplete) {
      router.replace('/dashboard');
    }
  }, [onboarding, isLoading, user, profileComplete, clinicComplete, scheduleComplete, router]);

  return (
    <div className="@container/main flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-6 py-6">
        <div className="px-4 lg:px-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Clinic</h1>
            <p className="text-sm text-muted-foreground">
              Manage your clinic profile and availability.
            </p>
          </div>
        </div>

        <div className="px-4 lg:px-6">
          {onboarding && isDentist && (!clinicComplete || !scheduleComplete) && (
            <Alert className="mb-4">
              <AlertTitle>Finish clinic setup</AlertTitle>
              <AlertDescription>
                Add clinic details and working hours to complete onboarding.
              </AlertDescription>
            </Alert>
          )}
          {isLoading && <AccountSkeleton />}
          {!isLoading && error && (
            <Alert variant="destructive">
              <AlertTitle>Unable to load clinic</AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : 'Please try again later.'}
              </AlertDescription>
            </Alert>
          )}
          {!isLoading && !error && user && !isDentist && (
            <Alert>
              <AlertTitle>Clinic access unavailable</AlertTitle>
              <AlertDescription>
                Clinic settings are only available for dentist accounts.
              </AlertDescription>
            </Alert>
          )}
          {!isLoading && !error && user && isDentist && (
            <ClinicForm profile={dentistProfile} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page export — wraps the content in a Suspense boundary ────────────────────

export default function AccountClinicPage() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <AccountClinicContent />
    </Suspense>
  );
}
