'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  nextOnboardingPath,
  useAccountData,
  useOnboardingStatus,
} from '@/lib/hooks';

/**
 * Silently enforces the onboarding flow for users who reach the dashboard
 * before completing all setup steps. Renders nothing — it's a side-effect
 * component that lives inside the dashboard layout.
 *
 * Flow:
 *   1. Email not verified  → /auth/verify-email
 *   2. Profile incomplete  → /onboarding/profile
 *   3. (Dentists) clinic / schedule incomplete → /onboarding/clinic
 *   4. Admin not approved → /onboarding/pending
 *   5. Fully onboarded     → stay on dashboard
 */
export function OnboardingGuard() {
  const router = useRouter();
  const { user, dentistProfile, workingHours, isLoading } = useAccountData();
  const status = useOnboardingStatus(user, dentistProfile, workingHours);

  useEffect(() => {
    if (isLoading || !user) return;
    const next = nextOnboardingPath(status);
    if (next) router.replace(next);
  }, [isLoading, user, status, router]);

  return null;
}
