'use client';

import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useForgotPassword } from '@/lib/hooks';
import { ForgotPasswordFormData } from '@/lib/schemas';
import { useT } from '@/lib/i18n/lang-context';

type Translate = (path: string, vars?: Record<string, string | number>) => string;

const makeForgotPasswordSchema = (t: Translate) =>
  z.object({
    email: z.string().email(t('authPages.validation.emailInvalid')).toLowerCase().trim(),
  });

export default function ForgotPasswordPage() {
  const { t } = useT();
  const { mutate: forgotPassword, isPending, isSuccess } = useForgotPassword();

  const forgotPasswordSchema = useMemo(() => makeForgotPasswordSchema(t), [t]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = (data: ForgotPasswordFormData) => {
    forgotPassword(data);
  };

  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t('authPages.forgot.successTitle')}</CardTitle>
            <CardDescription>
              {t('authPages.forgot.successDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button className="w-full">{t('authPages.forgot.backToLogin')}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('authPages.forgot.title')}</CardTitle>
          <CardDescription>
            {t('authPages.forgot.desc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">{t('authPages.forgot.emailLabel')}</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  {...register('email')}
                  className="bg-background"
                />
                {errors.email && (
                  <p className="text-sm text-red-500">{errors.email.message}</p>
                )}
              </Field>
              <Field>
                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? t('authPages.forgot.submitting') : t('authPages.forgot.submit')}
                </Button>
              </Field>
              <div className="text-center text-sm text-muted-foreground">
                {t('authPages.forgot.rememberPassword')}{" "}
                <Link href="/login" className="underline underline-offset-4">
                  {t('authPages.forgot.loginLink')}
                </Link>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
