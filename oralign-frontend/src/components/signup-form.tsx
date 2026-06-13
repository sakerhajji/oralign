'use client';

import { useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { useSignUp } from '@/lib/hooks';
import { SignUpFormData } from '@/lib/schemas';
import { useT } from '@/lib/i18n/lang-context';

const E164_PHONE_REGEX = /^\+[1-9]\d{1,14}$/;
const ISO_COUNTRY_REGEX = /^[A-Z]{2}$/;

/**
 * Normalises a dentist's full name: trims, strips any leading "Dr"/"Dr."
 * token (any casing), Title-Cases the rest, then prepends the canonical
 * "Dr. " prefix. Mirrors the helper in `@/lib/schemas` (kept local here
 * so the validation messages can be translated via the factory).
 */
function normalizeDoctorName(value: string): string {
  const words = value.trim().split(/\s+/);
  const nameWords =
    words.length > 0 && /^dr\.?$/i.test(words[0]) ? words.slice(1) : words;
  const titleCased = nameWords
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  return `Dr. ${titleCased}`;
}

// Validation messages are user-facing, so the sign-up schema is a
// factory taking the translator — instantiated inside the component via
// useMemo (keyed on `t`, which changes identity per language).
type Translate = (path: string, vars?: Record<string, string | number>) => string;

const makeSignUpSchema = (t: Translate) =>
  z.object({
    email: z.string().email(t('authPages.validation.emailInvalid')).toLowerCase().trim(),
    fullName: z
      .string()
      .min(2, t('authPages.validation.fullNameMin2'))
      .transform((val) => normalizeDoctorName(val)),
    password: z.string().min(8, t('authPages.validation.passwordMin8')),
    phone: z.preprocess(
      (val) => (typeof val === 'string' ? val.trim() : val),
      z
        .string()
        .min(1, t('authPages.validation.phoneRequired'))
        .regex(E164_PHONE_REGEX, t('authPages.validation.phoneFormat')),
    ),
    country: z.preprocess(
      (val) => (typeof val === 'string' ? val.trim().toUpperCase() : val),
      z
        .string()
        .min(1, t('authPages.validation.countryRequired'))
        .regex(ISO_COUNTRY_REGEX, t('authPages.validation.countryFormat')),
    ),
  });

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<'form'>) {
  const { t } = useT();
  const { mutate: signUp, isPending } = useSignUp();
  const [showPassword, setShowPassword] = useState(false);

  const signUpSchema = useMemo(() => makeSignUpSchema(t), [t]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    setValue,
    watch,
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      phone: '',
      country: 'TN',
    },
  });

  const onSubmit = (data: SignUpFormData) => {
    // fullName is already normalised by Zod (Title Case + "Dr." prefix).
    // phone + country are required, so no need to strip them.
    signUp(data);
  };

  const countryValue = watch('country');

  return (
    <form
      className={cn('flex flex-col gap-6', className)}
      onSubmit={handleSubmit(onSubmit)}
      {...props}
    >
      <FieldGroup>
        {/* Header */}
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">{t('authPages.signup.title')}</h1>
          <p className="text-sm text-balance text-muted-foreground">
            {t('authPages.signup.subtitleBefore')}{' '}
            <span className="font-medium text-foreground">
              {t('authPages.signup.subtitleEmphasis')}
            </span>
          </p>
        </div>

        {/* Full Name */}
        <Field>
          <FieldLabel htmlFor="fullName">{t('authPages.signup.fullNameLabel')}</FieldLabel>
          <Input
            id="fullName"
            type="text"
            placeholder={t('authPages.signup.fullNamePlaceholder')}
            {...register('fullName')}
            className="bg-background"
          />
          <FieldDescription>
            {t('authPages.signup.fullNameHelp')}
          </FieldDescription>
          {errors.fullName && (
            <p className="text-sm text-destructive">{errors.fullName.message}</p>
          )}
        </Field>

        {/* Email */}
        <Field>
          <FieldLabel htmlFor="email">{t('authPages.signup.emailLabel')}</FieldLabel>
          <Input
            id="email"
            type="email"
            placeholder={t('authPages.signup.emailPlaceholder')}
            {...register('email')}
            className="bg-background"
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </Field>

        {/* Password */}
        <Field>
          <FieldLabel htmlFor="password">{t('authPages.signup.passwordLabel')}</FieldLabel>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              {...register('password')}
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
          <FieldDescription>{t('authPages.signup.passwordHelp')}</FieldDescription>
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </Field>

        {/* Phone (required) */}
        <Field>
          <FieldLabel htmlFor="phone">{t('authPages.signup.phoneLabel')}</FieldLabel>
          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <PhoneInput
                id="phone"
                name={field.name}
                value={field.value}
                country={countryValue}
                defaultCountry="TN"
                onBlur={field.onBlur}
                onChange={(next) => {
                  field.onChange(next.phone);
                  setValue('country', next.country, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }}
                placeholder="+216 71 000 000"
                isInvalid={!!errors.phone || !!errors.country}
              />
            )}
          />
          <input type="hidden" {...register('country')} />
          {(errors.phone || errors.country) && (
            <p className="text-sm text-destructive">
              {errors.phone?.message ?? errors.country?.message}
            </p>
          )}
        </Field>

        {/* Submit */}
        <Field>
          <Button type="submit" className="w-full" disabled={isPending} size="lg">
            {isPending ? t('authPages.signup.submitting') : t('authPages.signup.submit')}
          </Button>
        </Field>

        <div className="text-center text-sm text-muted-foreground">
          {t('authPages.signup.hasAccount')}{' '}
          <Link href="/login" className="underline underline-offset-4">
            {t('authPages.signup.signInLink')}
          </Link>
        </div>
      </FieldGroup>
    </form>
  );
}
