'use client';

import { Suspense, useCallback } from 'react';
import Link from 'next/link';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRoundIcon, MailIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { AccountSkeleton } from '@/components/account/account-skeleton';
import { ProfileForm } from '@/components/account/profile-form';
import { useAccountData, useOnboardingStatus, useChangePassword, useForgotPassword } from '@/lib/hooks';
import { securitySettingsSchema, type SecuritySettingsFormData } from '@/lib/schemas';
import { useT } from '@/lib/i18n/lang-context';

// ── Security card — change password + send reset link ─────────────────────────

function SecurityCard({ email }: { email: string }) {
  const { t } = useT();
  const { mutateAsync: changePassword, isPending: isChanging } = useChangePassword();
  const { mutate: sendResetLink, isPending: isSending } = useForgotPassword();

  const form = useForm<SecuritySettingsFormData>({
    resolver: zodResolver(securitySettingsSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      form.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch {
      // error toast already shown by useChangePassword
    }
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRoundIcon className="size-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t('accountProfile.securityTitle')}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('accountProfile.securitySubtitle')}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Change password ── */}
        <Form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="currentPassword">
                {t('accountProfile.currentPassword')}
              </label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                {...form.register('currentPassword')}
              />
              {form.formState.errors.currentPassword && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.currentPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="newPassword">
                {t('accountProfile.newPassword')}
              </label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                {...form.register('newPassword')}
              />
              {form.formState.errors.newPassword && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.newPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="confirmPassword">
                {t('accountProfile.confirmPassword')}
              </label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...form.register('confirmPassword')}
              />
              {form.formState.errors.confirmPassword && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isChanging || !form.formState.isDirty}
            >
              {isChanging ? t('accountProfile.updating') : t('accountProfile.updatePassword')}
            </Button>
          </div>
        </Form>

        <Separator />

        {/* ── Send reset link ── */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">{t('accountProfile.forgotTitle')}</p>
            <p className="text-sm text-muted-foreground">
              {t('accountProfile.forgotBody', { email })}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 gap-2"
            onClick={() => sendResetLink({ email })}
            disabled={isSending}
          >
            <MailIcon className="size-4" />
            {isSending ? t('accountProfile.sending') : t('accountProfile.sendResetLink')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Inner component — uses useSearchParams, must be inside <Suspense> ─────────

function AccountProfileContent() {
  const { t } = useT();
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

    // Unverified users should never reach here — send them back
    if (!user.isEmailVerified) {
      router.replace('/auth/verify-email?onboarding=1');
      return;
    }

    // All steps already complete → skip straight to dashboard
    if (profileComplete && (!isDentist || (clinicComplete && scheduleComplete))) {
      router.replace('/dashboard');
    }

    // Do NOT auto-redirect to clinic when profileComplete is true.
    // The user must explicitly save their profile to advance.
  }, [onboarding, isLoading, user, profileComplete, clinicComplete, scheduleComplete, isDentist, router]);

  // Called by ProfileForm after a successful save (onboarding mode only)
  const handleProfileSaved = useCallback(() => {
    if (!onboarding) return;
    if (isDentist) {
      router.replace('/account/clinic?onboarding=1');
    } else {
      router.replace('/dashboard');
    }
  }, [onboarding, isDentist, router]);

  return (
    <div className="@container/main flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-6 py-6">
        <div className="px-4 lg:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold">{t('accountProfile.title')}</h1>
              <p className="text-sm text-muted-foreground">
                {t('accountProfile.subtitle')}
              </p>
            </div>
            {isDentist && !onboarding && (
              <Button asChild variant="outline">
                <Link href="/account/clinic">{t('accountProfile.clinicSettings')}</Link>
              </Button>
            )}
          </div>
        </div>

        <div className="px-4 lg:px-6 space-y-6">
          {onboarding && (
            <Alert>
              <AlertTitle>
                {profileComplete
                  ? t('accountProfile.onboardingConfirmTitle')
                  : t('accountProfile.onboardingCompleteTitle')}
              </AlertTitle>
              <AlertDescription>
                {profileComplete
                  ? t('accountProfile.onboardingConfirmBody')
                  : t('accountProfile.onboardingCompleteBody')}
              </AlertDescription>
            </Alert>
          )}

          {isLoading && <AccountSkeleton />}

          {!isLoading && error && (
            <Alert variant="destructive">
              <AlertTitle>{t('accountProfile.unableToLoad')}</AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : t('accountProfile.tryAgainLater')}
              </AlertDescription>
            </Alert>
          )}

          {!isLoading && !error && user && (
            <>
              <ProfileForm
                user={user}
                onboarding={onboarding}
                onSaved={onboarding ? handleProfileSaved : undefined}
              />

              {/* Security section — always visible, not part of onboarding steps */}
              {!onboarding && <SecurityCard email={user.email} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page export — wraps the content in a Suspense boundary ────────────────────

export default function AccountProfilePage() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <AccountProfileContent />
    </Suspense>
  );
}
