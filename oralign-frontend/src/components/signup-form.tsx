'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
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
    const trimmedPhone = data.phone?.trim();
    signUp({
      ...data,
      phone: trimmedPhone || undefined,
      country: trimmedPhone ? data.country?.trim() : undefined,
    });
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
          <Input
            id="password"
            type="password"
            {...register('password')}
            className="bg-background"
          />
          <FieldDescription>Must be at least 8 characters.</FieldDescription>
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </Field>

        {/* Phone (optional) */}
        <Field>
          <FieldLabel htmlFor="phone">Phone (Optional)</FieldLabel>
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
