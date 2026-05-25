'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { useSignUp } from '@/lib/hooks';
import { signUpSchema, SignUpFormData } from '@/lib/schemas';

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<'form'>) {
  const { mutate: signUp, isPending } = useSignUp();
  const [showPassword, setShowPassword] = useState(false);

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
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Oralign is for dental professionals.{' '}
            <span className="font-medium text-foreground">
              Dentists only.
            </span>
          </p>
        </div>

        {/* Full Name */}
        <Field>
          <FieldLabel htmlFor="fullName">Full Name</FieldLabel>
          <Input
            id="fullName"
            type="text"
            placeholder="Dr. Jane Smith"
            {...register('fullName')}
            className="bg-background"
          />
          <FieldDescription>
            &ldquo;Dr.&rdquo; will be added automatically if not included.
          </FieldDescription>
          {errors.fullName && (
            <p className="text-sm text-destructive">{errors.fullName.message}</p>
          )}
        </Field>

        {/* Email */}
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            placeholder="jane@clinic.com"
            {...register('email')}
            className="bg-background"
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </Field>

        {/* Password */}
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
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
              aria-label={showPassword ? 'Hide password' : 'Show password'}
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
          <FieldDescription>Must be at least 8 characters.</FieldDescription>
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </Field>

        {/* Phone (required) */}
        <Field>
          <FieldLabel htmlFor="phone">Phone</FieldLabel>
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
            {isPending ? 'Creating account…' : 'Create account'}
          </Button>
        </Field>

        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="underline underline-offset-4">
            Sign in
          </Link>
        </div>
      </FieldGroup>
    </form>
  );
}
