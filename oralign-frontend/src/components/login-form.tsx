'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { AlertCircle, Eye, EyeOff, WifiOff } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage, useBackendHealth, useSignIn } from '@/lib/hooks';
import { SignInFormData } from '@/lib/schemas';
import { useT } from '@/lib/i18n/lang-context';

// Validation messages are user-facing, so the sign-in schema is a
// factory taking the translator — instantiated inside the component via
// useMemo (keyed on `t`, which changes identity per language).
type Translate = (path: string, vars?: Record<string, string | number>) => string;

const makeSignInSchema = (t: Translate) =>
  z.object({
    email: z.string().email(t('authPages.validation.emailInvalid')).toLowerCase().trim(),
    password: z.string().min(1, t('authPages.validation.passwordRequired')),
  });

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const { t } = useT();
  const [showPassword, setShowPassword] = useState(false);
  const {
    mutate: signIn,
    isPending,
    error: signInError,
    reset: resetSignInError,
  } = useSignIn();
  const backendHealth = useBackendHealth();
  const isBackendUnavailable =
    backendHealth.isError ||
    (!backendHealth.isLoading && backendHealth.data?.status !== 'ok');

  const signInSchema = useMemo(() => makeSignInSchema(t), [t]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
  });

  const onSubmit = (data: SignInFormData) => {
    resetSignInError();
    signIn(data);
  };

  return (
    <form className={cn("flex flex-col gap-6", className)} onSubmit={handleSubmit(onSubmit)} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">{t('authPages.login.title')}</h1>
          <p className="text-sm text-balance text-muted-foreground">
            {t('authPages.login.subtitle')}
          </p>
        </div>
        {isBackendUnavailable && !backendHealth.isLoading && (
          <Alert variant="destructive">
            <WifiOff className="h-4 w-4" />
            <AlertTitle>{t('authPages.login.backendDownTitle')}</AlertTitle>
            <AlertDescription>
              {t('authPages.login.backendDownDesc')}
            </AlertDescription>
          </Alert>
        )}
        {Boolean(signInError) && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('authPages.login.failedTitle')}</AlertTitle>
            <AlertDescription>
              {getApiErrorMessage(signInError, t('authPages.login.failedFallback'))}
            </AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="email">{t('authPages.login.emailLabel')}</FieldLabel>
          <Input
            id="email"
            type="email"
            placeholder="m@example.com"
            {...register('email', { onChange: resetSignInError })}
            className="bg-background"
          />
          {errors.email && (
            <p className="text-sm text-red-500">{errors.email.message}</p>
          )}
        </Field>
        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">{t('authPages.login.passwordLabel')}</FieldLabel>
            <Link
              href="/forgot-password"
              className="ml-auto text-sm underline-offset-4 hover:underline"
            >
              {t('authPages.login.forgotLink')}
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              {...register('password', { onChange: resetSignInError })}
              className="bg-background pr-10"
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showPassword ? t('authPages.password.hide') : t('authPages.password.show')}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus:outline-none"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-sm text-red-500">{errors.password.message}</p>
          )}
        </Field>
        <Field>
          <Button type="submit" disabled={isPending || isBackendUnavailable}>
            {isPending ? t('authPages.login.submitting') : t('authPages.login.submit')}
          </Button>
        </Field>
        <div className="text-center text-sm text-muted-foreground">
          {t('authPages.login.noAccount')}{" "}
          <Link href="/signup" className="underline underline-offset-4">
            {t('authPages.login.signUpLink')}
          </Link>
        </div>
      </FieldGroup>
    </form>
  );
}
