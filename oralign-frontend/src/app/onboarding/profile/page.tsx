'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { ProfileForm } from '@/components/account/profile-form';
import {
  nextOnboardingPath,
  useAccountData,
  useOnboardingStatus,
} from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';

export default function OnboardingProfilePage() {
  const { t } = useT();
  const router = useRouter();
  const { user, dentistProfile, workingHours, isLoading } = useAccountData();
  const status = useOnboardingStatus(user, dentistProfile, workingHours);

  useEffect(() => {
    if (isLoading || !user) return;
    const next = nextOnboardingPath(status);

    // A completed dentist can still reach this URL from browser history or a
    // stale bookmark. Keep the onboarding routes self-healing and return the
    // user to their dashboard instead of showing a redundant profile form.
    if (next !== '/onboarding/profile') {
      router.replace(next ?? '/dashboard');
    }
  }, [isLoading, user, status, router]);

  const handleSaved = () => {
    if (status.isDentist) {
      router.push('/onboarding/clinic');
    } else {
      router.push('/onboarding/pending');
    }
  };

  return (
    <OnboardingShell
      current="profile"
      title={t('onboardingPages.profile.title')}
      description={t('onboardingPages.profile.description')}
    >
      {isLoading || !user ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ProfileForm user={user} onboarding onSaved={handleSaved} />
      )}
    </OnboardingShell>
  );
}
