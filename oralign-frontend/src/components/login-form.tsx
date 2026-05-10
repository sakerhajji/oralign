'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { AlertCircle, WifiOff } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage, useBackendHealth, useSignIn } from '@/lib/hooks';
import { signInSchema, SignInFormData } from '@/lib/schemas';

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
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
          <h1 className="text-2xl font-bold">Login to your account</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Enter your email below to login to your account
          </p>
        </div>
        {isBackendUnavailable && !backendHealth.isLoading && (
          <Alert variant="destructive">
            <WifiOff className="h-4 w-4" />
            <AlertTitle>Backend is not connected</AlertTitle>
            <AlertDescription>
              The app cannot reach the API server right now. Please make sure
              the backend container is running, then try again.
            </AlertDescription>
          </Alert>
        )}
        {Boolean(signInError) && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Login failed</AlertTitle>
            <AlertDescription>
              {getApiErrorMessage(signInError, 'Email or password is incorrect.')}
            </AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
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
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Link
              href="/forgot-password"
              className="ml-auto text-sm underline-offset-4 hover:underline"
            >
              Forgot your password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            {...register('password', { onChange: resetSignInError })}
            className="bg-background"
          />
          {errors.password && (
            <p className="text-sm text-red-500">{errors.password.message}</p>
          )}
        </Field>
        <Field>
          <Button type="submit" disabled={isPending || isBackendUnavailable}>
            {isPending ? 'Logging in...' : 'Login'}
          </Button>
        </Field>
        <div className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="underline underline-offset-4">
            Sign up
          </Link>
        </div>
      </FieldGroup>
    </form>
  );
}
