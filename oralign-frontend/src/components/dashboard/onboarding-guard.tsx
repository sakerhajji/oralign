'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  TECHNICIAN_HOME,
  isTechnicianRoute,
  nextOnboardingPath,
  useAccountData,
  useOnboardingStatus,
} from '@/lib/hooks';
import { UserRole } from '@/lib/types';
import { useT } from '@/lib/i18n/lang-context';

/**
 * The dashboard's routing guard, around every dashboard page.
 *
 * Flow:
 *   0. Temporary password  → /onboarding/password
 *   1. Email not verified  → /auth/verify-email
 *   2. Profile incomplete  → /onboarding/profile
 *   3. (Dentists) clinic / schedule incomplete → /onboarding/clinic
 *   4. Admin not approved → /onboarding/pending
 *   5. Technician outside the production screens → the production queue
 *      (the API refuses her everything else with a 403)
 *   6. Otherwise          → stay on the page
 *
 * While a redirect is pending the page is not mounted: it would only fire
 * requests the API refuses and flash a screen the user is leaving.
 */
export function OnboardingGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useT();
  const { user, dentistProfile, workingHours, isLoading } = useAccountData();
  const status = useOnboardingStatus(user, dentistProfile, workingHours);

  const redirect =
    isLoading || !user
      ? null
      : (nextOnboardingPath(status) ??
        (user.role === UserRole.TECHNICIAN && !isTechnicianRoute(pathname)
          ? TECHNICIAN_HOME
          : null));

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  if (!redirect) return <>{children}</>;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-1 items-center justify-center gap-2 p-6 text-sm text-muted-foreground"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {t('common.loading')}
    </div>
  );
}
