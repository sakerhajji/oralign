'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { OnboardingClinicForm } from '@/components/onboarding/onboarding-clinic-form';
import { useAccountData, useOnboardingStatus } from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';

export default function OnboardingClinicPage() {
  const { t } = useT();
  const router = useRouter();
  const { user, dentistProfile, workingHours, isLoading, isDentist } =
    useAccountData();
  const status = useOnboardingStatus(user, dentistProfile, workingHours);

  // Only bounce the user when the *prerequisites* aren't met. We deliberately
  // don't auto-bounce when `clinicComplete && scheduleComplete` are both
  // true here — the form submit drives the forward navigation, which keeps
  // the flow predictable.
  useEffect(() => {
    if (isLoading || !user) return;
    if (!status.emailVerified) {
      router.replace('/auth/verify-email');
      return;
    }
    if (!status.profileComplete) {
      router.replace('/onboarding/profile');
      return;
    }
    if (!isDentist) {
      router.replace('/onboarding/pending');
    }
  }, [
    isLoading,
    user,
    isDentist,
    status.emailVerified,
    status.profileComplete,
    router,
  ]);

  const handleSaved = () => router.push('/onboarding/pending');

  return (
    <OnboardingShell
      current="clinic"
      title={t('onboardingPages.clinic.title')}
      description={t('onboardingPages.clinic.description')}
    >
      {isLoading || !user ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !isDentist ? (
        <p className="text-sm text-muted-foreground">
          {t('onboardingPages.clinic.dentistOnly')}
        </p>
      ) : (
        <OnboardingClinicForm
          profile={dentistProfile}
          workingHours={workingHours}
          onSaved={handleSaved}
        />
      )}
    </OnboardingShell>
  );
}
