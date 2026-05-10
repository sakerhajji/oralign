'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { MailIcon, RefreshCwIcon } from 'lucide-react';
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
import { verifyEmailSchema, type VerifyEmailFormData } from '@/lib/schemas';
import { useVerifyEmail, useResendVerification } from '@/lib/hooks';
import { useAuth } from '@/lib/providers';
import { userKeys } from '@/lib/hooks/use-users';

const RESEND_COOLDOWN_SECONDS = 60;

export function VerifyEmailCard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { mutateAsync: verifyEmail, isPending: isVerifying } = useVerifyEmail();
  const { mutate: resendCode, isPending: isResending } = useResendVerification();
  const [cooldown, setCooldown] = useState(0);

  const form = useForm<VerifyEmailFormData>({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: {
      email: user?.email ?? '',
      verificationCode: '',
    },
  });

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
      toast.error('Please enter your email address first.');
      return;
    }
    resendCode(
      { email },
      {
        onSuccess: () => setCooldown(RESEND_COOLDOWN_SECONDS),
      },
    );
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await verifyEmail(values);
      // Auth context + tokens are updated inside useVerifyEmail onSuccess.
      await queryClient.invalidateQueries({ queryKey: userKeys.currentUser() });
      router.replace('/account/profile?onboarding=1');
    } catch {
      // onError toast already shown by useVerifyEmail
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10">
            <MailIcon className="size-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">Check your inbox</CardTitle>
          <CardDescription className="text-balance">
            We sent a 6-digit verification code to{' '}
            {user?.email ? (
              <span className="font-medium text-foreground">{user.email}</span>
            ) : (
              'your email address'
            )}
            . Enter it below to continue.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <Form onSubmit={onSubmit} className="space-y-4">
            {/* Hidden unless the user needs to change their email */}
            {!user?.email && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="email">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
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
                Verification code
              </label>
              <Input
                id="verificationCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                className="text-center text-2xl font-bold tracking-[0.5em]"
                {...form.register('verificationCode')}
              />
              {form.formState.errors.verificationCode && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.verificationCode.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isVerifying}
              size="lg"
            >
              {isVerifying ? 'Verifying…' : 'Verify email'}
            </Button>
          </Form>

          {/* Resend */}
          <div className="flex flex-col items-center gap-2 pt-1">
            <p className="text-sm text-muted-foreground">
              Didn&apos;t receive the code?
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
                ? `Resend in ${cooldown}s`
                : isResending
                  ? 'Sending…'
                  : 'Resend code'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
