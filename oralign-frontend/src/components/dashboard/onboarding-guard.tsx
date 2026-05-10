'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccountData, useOnboardingStatus } from '@/lib/hooks';

/**
 * Silently enforces the onboarding flow for dentist users who access
 * /dashboard before completing all setup steps.
 *
 * Non-dentist roles (admin, super_admin, designer) are never redirected.
 * This component renders nothing — it's purely a guard.
 */
export function OnboardingGuard() {
  const router = useRouter();
  const { user, dentistProfile, workingHours, isDentist, isLoading } =
    useAccountData();
  const { profileComplete, clinicComplete, scheduleComplete } =
    useOnboardingStatus(user, dentistProfile, workingHours);

  useEffect(() => {
    if (isLoading || !user || !isDentist) return;

    if (!user.isEmailVerified) {
      router.replace('/auth/verify-email?onboarding=1');
      return;
    }

    if (!profileComplete) {
      router.replace('/account/profile?onboarding=1');
      return;
    }

    if (!clinicComplete || !scheduleComplete) {
      router.replace('/account/clinic?onboarding=1');
    }
  }, [
    isLoading,
    user,
    isDentist,
    profileComplete,
    clinicComplete,
    scheduleComplete,
    router,
  ]);

  return null;
}
