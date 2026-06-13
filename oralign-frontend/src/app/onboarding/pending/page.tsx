'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Mail, RefreshCcw, ShieldAlert } from 'lucide-react';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { Button } from '@/components/ui/button';
import { userKeys } from '@/lib/hooks/use-users';
import { useAccountData, useOnboardingStatus } from '@/lib/hooks';
import { VerificationStatus } from '@/lib/types';
import { useT } from '@/lib/i18n/lang-context';

export default function OnboardingPendingPage() {
  const { t } = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, dentistProfile, workingHours, isLoading } = useAccountData();
  const status = useOnboardingStatus(user, dentistProfile, workingHours);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // Bounce back to the right step if pre-conditions aren't met.
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
    if (
      status.isDentist &&
      (!status.clinicComplete || !status.scheduleComplete)
    ) {
      router.replace('/onboarding/clinic');
      return;
    }
    if (status.adminApproved) {
      router.replace('/dashboard');
    }
  }, [
    isLoading,
    user,
    status.emailVerified,
    status.profileComplete,
    status.clinicComplete,
    status.scheduleComplete,
    status.adminApproved,
    status.isDentist,
    router,
  ]);

  // Auto-poll every 30 s so an admin approval lights up the page without
  // the user having to refresh manually.
  useEffect(() => {
    if (status.adminApproved) return;
    const id = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: userKeys.currentUser() });
      setLastChecked(new Date());
    }, 30_000);
    return () => clearInterval(id);
  }, [queryClient, status.adminApproved]);

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: userKeys.currentUser() });
    setLastChecked(new Date());
  };

  const isRejected =
    user?.verificationStatus === VerificationStatus.REJECTED;

  return (
    <OnboardingShell
      current="approval"
      title={isRejected ? t('onboardingPages.pending.titleRejected') : t('onboardingPages.pending.titleReview')}
      description={
        isRejected
          ? t('onboardingPages.pending.descRejected')
          : t('onboardingPages.pending.descReview')
      }
    >
      <div className="flex flex-col items-center gap-6 py-2 text-center">
        {/* Big status badge */}
        <div
          className={
            isRejected
              ? 'flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10 text-destructive'
              : 'flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
          }
        >
          {isRejected ? (
            <ShieldAlert className="h-10 w-10" />
          ) : (
            <CheckCircle2 className="h-10 w-10" />
          )}
        </div>

        {/* What we have on file */}
        <ul className="grid w-full max-w-md gap-2 text-left text-sm">
          <li className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t('onboardingPages.pending.emailVerified')}</p>
              <p className="truncate text-muted-foreground">{user?.email}</p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t('onboardingPages.pending.profileCompleted')}</p>
              <p className="truncate text-muted-foreground">{user?.fullName}</p>
            </div>
          </li>
          {status.isDentist && (
            <li className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t('onboardingPages.pending.clinicSaved')}</p>
                <p className="truncate text-muted-foreground">
                  {dentistProfile?.clinicName}
                </p>
              </div>
            </li>
          )}
          <li
            className={
              isRejected
                ? 'flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3'
                : 'flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3'
            }
          >
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {isRejected
                  ? t('onboardingPages.pending.approvalDenied')
                  : t('onboardingPages.pending.waitingApproval')}
              </p>
              <p className="text-muted-foreground">
                {isRejected
                  ? t('onboardingPages.pending.contactSupportNext')
                  : t('onboardingPages.pending.keepSpot')}
              </p>
            </div>
          </li>
        </ul>

        {/* Email notice — explicit and reassuring */}
        {!isRejected && (
          <div className="flex w-full max-w-md items-start gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4 text-left">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t('onboardingPages.pending.emailNoticeTitle')}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('onboardingPages.pending.emailNoticeBefore')}{' '}
                <span className="font-medium text-foreground">{user?.email}</span>
                {t('onboardingPages.pending.emailNoticeAfter')}
              </p>
            </div>
          </div>
        )}

        {/* Manual refresh */}
        {!isRejected && (
          <div className="flex flex-col items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleRefresh}
              className="gap-2"
            >
              <RefreshCcw className="h-4 w-4" />
              {t('onboardingPages.pending.checkNow')}
            </Button>
            <p className="text-xs text-muted-foreground">
              {lastChecked
                ? t('onboardingPages.pending.lastChecked', { time: lastChecked.toLocaleTimeString() })
                : t('onboardingPages.pending.autoRefresh')}
            </p>
          </div>
        )}

        <a
          href="mailto:support@oralign.com.tn"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <Mail className="h-4 w-4" />
          {t('onboardingPages.pending.contactSupport')}
        </a>
      </div>
    </OnboardingShell>
  );
}
