'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { OnboardingClinicForm } from '@/components/onboarding/onboarding-clinic-form';
import {
  nextOnboardingPath,
  useAccountData,
  useOnboardingStatus,
} from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';

export default function OnboardingClinicPage() {
  const { t } = useT();
  const router = useRouter();
  const { user, dentistProfile, workingHours, isLoading, isDentist } =
    useAccountData();
  const status = useOnboardingStatus(user, dentistProfile, workingHours);

  useEffect(() => {
    if (isLoading || !user) return;
    const next = nextOnboardingPath(status);

    // Keep bookmarked onboarding URLs safe: once this step no longer applies,
    // route the user to their actual next step (or the dashboard when their
    // account is fully ready) instead of reopening a completed clinic form.
    if (next !== '/onboarding/clinic') {
      router.replace(next ?? '/dashboard');
    }
  }, [isLoading, user, status, router]);

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
