'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, KeyRound, Loader2 } from 'lucide-react';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getApiErrorMessage,
  landingPathFor,
  useChangePassword,
  useCurrentUser,
} from '@/lib/hooks';
import { extractApiError, getAccessToken, getRefreshToken } from '@/lib/api';
import { useAuth } from '@/lib/providers';
import { useT } from '@/lib/i18n/lang-context';

type Translate = (path: string, vars?: Record<string, string | number>) => string;

const K = 'onboardingPages.password';

// Same rules as the account page's change-password form (8 characters,
// both copies equal); the server also refuses the temporary one again.
const makeSchema = (t: Translate) =>
  z
    .object({
      currentPassword: z.string().min(1, t(`${K}.errors.currentRequired`)),
      newPassword: z.string().min(8, t(`${K}.errors.min8`)),
      confirmPassword: z.string(),
    })
    .superRefine((values, ctx) => {
      if (values.newPassword.length >= 8 && values.newPassword === values.currentPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['newPassword'],
          message: t(`${K}.errors.sameAsCurrent`),
        });
      }
      if (values.confirmPassword !== values.newPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['confirmPassword'],
          message: t(`${K}.errors.mismatch`),
        });
      }
    });

type PasswordForm = z.infer<ReturnType<typeof makeSchema>>;

/**
 * First sign-in on a temporary password (a technician's account, or any
 * account an admin opened with a generated password). Until it changes the
 * API refuses everything but GET /users/me and POST /auth/change-password,
 * so this page calls nothing else. The change hands back a fresh token
 * pair (stored by authService) and clears the cached flag; the user then
 * lands where their role starts.
 */
export default function OnboardingPasswordPage() {
  const { t } = useT();
  const router = useRouter();
  const { logout } = useAuth();
  const userQuery = useCurrentUser();
  const user = userQuery.data;

  // No session at all: the proxy lets a stale cookie through, nothing else.
  useEffect(() => {
    if (!getAccessToken() && !getRefreshToken()) router.replace('/login');
  }, [router]);

  // Nothing (or nothing more) to change: go where the role starts. This is
  // also the exit after a successful change, once the flag is cleared.
  const done = !!user && user.mustChangePassword !== true;
  useEffect(() => {
    if (done) router.replace(landingPathFor(user?.role));
  }, [done, user?.role, router]);

  return (
    <OnboardingShell
      hideStepper
      narrow
      icon={<KeyRound className="size-5" aria-hidden="true" />}
      title={t(`${K}.title`)}
      description={t(`${K}.desc`)}
    >
      {userQuery.isError && !user ? (
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertDescription>{t(`${K}.loadError`)}</AlertDescription>
          </Alert>
          <Button type="button" className="h-12 w-full" onClick={() => logout()}>
            {t(`${K}.signInAgain`)}
          </Button>
        </div>
      ) : !user || done ? (
        <PasswordFormSkeleton label={t(`${K}.loading`)} />
      ) : (
        <PasswordChangeForm email={user.email} />
      )}
    </OnboardingShell>
  );
}

function PasswordChangeForm({ email }: { email: string }) {
  const { t } = useT();
  const ids = useId();
  const schema = useMemo(() => makeSchema(t), [t]);
  const [visible, setVisible] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // The field a server error names, focused once the fields are enabled
  // again. A new object per error; the ref remembers the one already done.
  const [focusRequest, setFocusRequest] = useState<{ field: keyof PasswordForm } | null>(null);
  const focusDone = useRef<{ field: keyof PasswordForm } | null>(null);
  // Errors are shown next to the fields here, not as a toast.
  const changePassword = useChangePassword({ toastErrors: false });

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<PasswordForm>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const pending = changePassword.isPending;

  // The rejection reaches the catch below before React re-renders with
  // isPending false, so the inputs are still disabled there and focus()
  // would do nothing: focus after that render instead.
  useEffect(() => {
    if (pending || !focusRequest || focusDone.current === focusRequest) return;
    focusDone.current = focusRequest;
    setFocus(focusRequest.field);
  }, [pending, focusRequest, setFocus]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await changePassword.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      // The page leaves on its own once the cached flag is cleared.
    } catch (error) {
      const { errorCode } = extractApiError(error);
      if (errorCode === 'INVALID_CURRENT_PASSWORD') {
        setError('currentPassword', { message: t(`${K}.errors.wrongCurrent`) });
        setFocusRequest({ field: 'currentPassword' });
      } else if (errorCode === 'SAME_PASSWORD') {
        setError('newPassword', { message: t(`${K}.errors.sameAsCurrent`) });
        setFocusRequest({ field: 'newPassword' });
      } else {
        setServerError(getApiErrorMessage(error, t(`${K}.failedFallback`)));
      }
    }
  });

  const type = visible ? 'text' : 'password';
  const fields = [
    {
      name: 'currentPassword' as const,
      label: t(`${K}.currentLabel`),
      hint: t(`${K}.currentHint`),
      autoComplete: 'current-password',
    },
    {
      name: 'newPassword' as const,
      label: t(`${K}.newLabel`),
      hint: t(`${K}.newHint`),
      autoComplete: 'new-password',
    },
    {
      name: 'confirmPassword' as const,
      label: t(`${K}.confirmLabel`),
      hint: undefined,
      autoComplete: 'new-password',
    },
  ];

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" aria-busy={pending}>
      <p className="truncate text-sm text-muted-foreground">
        {t(`${K}.account`, { email })}
      </p>
      {/* Lets a password manager file the new password under the right
          account: it looks for a username next to a new-password field. */}
      <input
        type="email"
        name="username"
        autoComplete="username"
        value={email}
        readOnly
        hidden
      />

      {serverError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle>{t(`${K}.failedTitle`)}</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      {fields.map((field) => {
        const id = `${ids}-${field.name}`;
        const error = errors[field.name]?.message;
        const describedBy = [field.hint && `${id}-hint`, error && `${id}-error`]
          .filter(Boolean)
          .join(' ');
        return (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={id}>{field.label}</Label>
            <Input
              id={id}
              type={type}
              autoComplete={field.autoComplete}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={!!error}
              aria-describedby={describedBy || undefined}
              disabled={pending}
              className="h-12 text-base md:text-base"
              {...register(field.name, { onChange: () => setServerError(null) })}
            />
            {error ? (
              <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : field.hint ? (
              <p id={`${id}-hint`} className="text-sm text-muted-foreground">
                {field.hint}
              </p>
            ) : null}
          </div>
        );
      })}

      {/* The whole row is the label, so a finger anywhere on its 48 px
          toggles the 20 px box. */}
      <Label
        htmlFor={`${ids}-show`}
        className="flex min-h-12 cursor-pointer items-center gap-3 font-normal"
      >
        <Checkbox
          id={`${ids}-show`}
          checked={visible}
          onCheckedChange={(next) => setVisible(next === true)}
          className="size-5"
        />
        {t(`${K}.showPasswords`)}
      </Label>

      <Button type="submit" className="h-12 w-full text-base" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {pending ? t(`${K}.submitting`) : t(`${K}.submit`)}
      </Button>
    </form>
  );
}

function PasswordFormSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-5">
      <Skeleton className="h-4 w-48" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-12 w-full" />
        </div>
      ))}
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
