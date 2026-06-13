'use client';

import { Suspense, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useResetPassword } from '@/lib/hooks';
import { ResetPasswordFormData } from '@/lib/schemas';
import { useT } from '@/lib/i18n/lang-context';

type Translate = (path: string, vars?: Record<string, string | number>) => string;

const makeResetPasswordSchema = (t: Translate) =>
  z
    .object({
      token: z.string().min(1, t('authPages.validation.tokenRequired')),
      newPassword: z.string().min(8, t('authPages.validation.passwordMin8')),
      confirmPassword: z.string().min(8, t('authPages.validation.passwordMin8')),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t('authPages.validation.passwordsMismatch'),
      path: ['confirmPassword'],
    });

function ResetPasswordForm() {
  const { t } = useT();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') || '';

  const { mutate: resetPassword, isPending } = useResetPassword();

  const resetPasswordSchema = useMemo(() => makeResetPasswordSchema(t), [t]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  const onSubmit = (data: ResetPasswordFormData) => {
    resetPassword(data);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('authPages.reset.title')}</CardTitle>
          <CardDescription>
            {t('authPages.reset.desc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
            <FieldGroup>
              <input type="hidden" {...register('token')} />
              <Field>
                <FieldLabel htmlFor="newPassword">{t('authPages.reset.newPasswordLabel')}</FieldLabel>
                <Input
                  id="newPassword"
                  type="password"
                  {...register('newPassword')}
                  className="bg-background"
                />
                <FieldDescription>
                  {t('authPages.reset.newPasswordHelp')}
                </FieldDescription>
                {errors.newPassword && (
                  <p className="text-sm text-red-500">{errors.newPassword.message}</p>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="confirmPassword">{t('authPages.reset.confirmPasswordLabel')}</FieldLabel>
                <Input
                  id="confirmPassword"
                  type="password"
                  {...register('confirmPassword')}
                  className="bg-background"
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>
                )}
              </Field>
              <Field>
                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? t('authPages.reset.submitting') : t('authPages.reset.submit')}
                </Button>
              </Field>
              <div className="text-center text-sm text-muted-foreground">
                {t('authPages.reset.rememberPassword')}{" "}
                <Link href="/login" className="underline underline-offset-4">
                  {t('authPages.reset.loginLink')}
                </Link>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center p-4" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}