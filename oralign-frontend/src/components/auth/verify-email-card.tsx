'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { AlertCircle, MailIcon, MailWarning, RefreshCwIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { type VerifyEmailFormData } from '@/lib/schemas';
import { useVerifyEmail, useResendVerification } from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/hooks/use-auth';
import { useAuth } from '@/lib/providers';
import { userKeys } from '@/lib/hooks/use-users';
import { useT } from '@/lib/i18n/lang-context';
import { suggestEmail } from '@/lib/email-typos';

const RESEND_COOLDOWN_SECONDS = 60;

type Translate = (path: string, vars?: Record<string, string | number>) => string;

const makeVerifyEmailSchema = (t: Translate) =>
  z.object({
    email: z.string().email(t('authPages.validation.emailInvalid')).toLowerCase().trim(),
    verificationCode: z.string().min(1, t('authPages.validation.codeRequired')),
  });

export function VerifyEmailCard() {
  const { t } = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { mutateAsync: verifyEmail, isPending: isVerifying } = useVerifyEmail();
  const { mutate: resendCode, isPending: isResending } = useResendVerification();
  const [cooldown, setCooldown] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The code is tied to an address: show the field when there is no
  // session, or when the person wants to (or must) correct the address.
  const [editingEmail, setEditingEmail] = useState(false);

  const verifyEmailSchema = useMemo(() => makeVerifyEmailSchema(t), [t]);

  const form = useForm<VerifyEmailFormData>({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: {
      email: user?.email ?? '',
      verificationCode: '',
    },
  });

  // A typo'd domain (…@gamil.com) passes validation but no account or
  // mailbox uses it: offer the corrected address.
  const emailValue = useWatch({ control: form.control, name: 'email' });
  const suggestion = suggestEmail(emailValue ?? '');
  const showEmailField = !user?.email || editingEmail;
  // Once corrected, the header names the address the code goes to.
  const shownEmail = (editingEmail ? emailValue : user?.email) || user?.email;
  const applySuggestion = () => {
    if (!suggestion) return;
    form.setValue('email', suggestion, { shouldValidate: true });
    setEditingEmail(true);
    setSubmitError(null);
  };

  // Sync email field when user context loads
  useEffect(() => {
    if (!user?.email) return;
    form.setValue('email', user.email, { shouldValidate: true });
  }, [user?.email, form]);

  // Countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(
      () => setCooldown((prev) => prev - 1),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const handleResend = () => {
    const email = form.getValues('email');
    if (!email) {
      toast.error(t('authPages.verify.emailRequiredToast'));
      return;
    }
    setSubmitError(null);
    form.setValue('verificationCode', '');
    resendCode(
      { email },
      {
        onSuccess: () => setCooldown(RESEND_COOLDOWN_SECONDS),
      },
    );
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await verifyEmail(values);
      // Auth context + tokens are updated inside useVerifyEmail onSuccess.
      await queryClient.invalidateQueries({ queryKey: userKeys.currentUser() });
      // After OTP succeeds, send the user into the dedicated onboarding flow
      // (separate layout, step indicator). The OnboardingGuard would catch
      // them anyway, but redirecting directly avoids a flash of the dashboard.
      router.replace('/onboarding/profile');
    } catch (error) {
      // No account with this address (a typo at sign-up, or a session left
      // from another account): say so and open the field to correct it.
      if (isAxiosError(error) && error.response?.status === 404) {
        setSubmitError(t('authPages.verify.notFound', { email: values.email }));
        setEditingEmail(true);
        return;
      }
      // Surface the actual backend reason in the form, not just a toast.
      // Common causes: "Invalid verification code", "Verification code has
      // expired", "No verification code found".
      setSubmitError(getApiErrorMessage(error, t('authPages.verify.verifyFailedFallback')));
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10">
            <MailIcon className="size-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">{t('authPages.verify.title')}</CardTitle>
          <CardDescription className="text-balance">
            {t('authPages.verify.descBefore')}{' '}
            {shownEmail ? (
              <span className="font-medium text-foreground">{shownEmail}</span>
            ) : (
              t('authPages.verify.descFallbackEmail')
            )}
            {t('authPages.verify.descAfter')}
          </CardDescription>
          {suggestion ? (
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm">
              <span className="font-medium text-foreground">
                {t('authPages.common.didYouMean', { email: suggestion })}
              </span>
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={applySuggestion}>
                {t('authPages.common.useSuggestion')}
              </Button>
            </div>
          ) : user?.email && !editingEmail ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="mx-auto h-auto p-0 text-muted-foreground"
              onClick={() => setEditingEmail(true)}
            >
              {t('authPages.verify.changeEmail')}
            </Button>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-5">
          {/* The code mail often lands in spam (Gmail especially): say so
              before people give up or ask for code after code. */}
          <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            <MailWarning className="size-4 !text-amber-600 dark:!text-amber-400" aria-hidden="true" />
            <AlertTitle className="leading-snug">{t('authPages.verify.spamTitle')}</AlertTitle>
            <AlertDescription className="text-amber-900/90 dark:text-amber-100/80">
              <p>{t('authPages.verify.spamBody')}</p>
            </AlertDescription>
          </Alert>

          <Form onSubmit={onSubmit} className="space-y-4">
            {/* Hidden unless there is no session or the address needs fixing */}
            {showEmailField && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="email">
                  {t('authPages.verify.emailLabel')}
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('authPages.verify.emailPlaceholder')}
                  {...form.register('email')}
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="verificationCode">
                {t('authPages.verify.codeLabel')}
              </label>
              <Input
                id="verificationCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={t('authPages.verify.codePlaceholder')}
                maxLength={6}
                className="text-center text-2xl font-bold tracking-[0.5em]"
                aria-invalid={!!submitError}
                {...form.register('verificationCode', {
                  onChange: () => submitError && setSubmitError(null),
                })}
              />
              {form.formState.errors.verificationCode && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.verificationCode.message}
                </p>
              )}
            </div>

            {submitError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">{submitError}</p>
                  <p className="mt-0.5 text-xs text-destructive/80">
                    {t('authPages.verify.errorHint')}
                  </p>
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isVerifying}
              size="lg"
            >
              {isVerifying ? t('authPages.verify.submitting') : t('authPages.verify.submit')}
            </Button>
          </Form>

          {/* Resend */}
          <div className="flex flex-col items-center gap-2 pt-1">
            <p className="text-sm text-muted-foreground">
              {t('authPages.verify.noCode')}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={handleResend}
              disabled={cooldown > 0 || isResending}
            >
              <RefreshCwIcon
                className={`size-3.5 ${isResending ? 'animate-spin' : ''}`}
              />
              {cooldown > 0
                ? t('authPages.verify.resendIn', { n: cooldown })
                : isResending
                  ? t('authPages.verify.resending')
                  : t('authPages.verify.resend')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
