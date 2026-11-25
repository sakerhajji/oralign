'use client';

import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FlaskConical, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PhoneInput } from '@/components/ui/phone-input';
import { useCreateUser } from '@/lib/hooks/use-users';
import { useT } from '@/lib/i18n/lang-context';
import { useAuth } from '@/lib/providers/auth-provider';
import { optionalCountrySchema, optionalE164PhoneSchema } from '@/lib/schemas';
import { UserRole, type CreateUserDto } from '@/lib/types';
import { TemporaryPasswordPanel } from './temporary-password-panel';

type Translate = (path: string, vars?: Record<string, string | number>) => string;

// Messages are user-facing, so the schema is built with the translator.
// The password is required only when the server does not generate one.
const makeCreateUserSchema = (t: Translate) =>
  z
    .object({
      email: z
        .string()
        .trim()
        .toLowerCase()
        .email(t('usersDesk.create.emailInvalid')),
      fullName: z.string().trim().min(2, t('usersUi.validation.min2')).max(120, t('usersUi.validation.max120')),
      generateTemporaryPassword: z.boolean(),
      password: z.string(),
      phone: optionalE164PhoneSchema,
      country: optionalCountrySchema,
      role: z.nativeEnum(UserRole),
    })
    .superRefine((data, ctx) => {
      if (!data.generateTemporaryPassword && data.password.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['password'],
          message: t('usersUi.validation.min8'),
        });
      }
    });

type CreateUserForm = z.infer<ReturnType<typeof makeCreateUserSchema>>;

const DEFAULTS: CreateUserForm = {
  email: '',
  fullName: '',
  generateTemporaryPassword: false,
  password: '',
  phone: '',
  country: 'TN',
  role: UserRole.DENTIST,
};

const ROLE_OPTIONS = [
  UserRole.DENTIST,
  UserRole.TECHNICIAN,
  UserRole.DESIGNER,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
] as const;

/** A lab account starts on a generated password; the others on a typed one. */
const generatesByDefault = (role: UserRole) => role === UserRole.TECHNICIAN;

interface CreatedAccount {
  name: string;
  email: string;
  temporaryPassword: string;
}

/**
 * Admin "Add user" dialog. Loaded on demand by the users page
 * (next/dynamic), so the phone input and its flag sprite stay out of
 * the list's first load. The role is a controlled field with a default
 * and is always sent. Only a super admin is offered the super admin
 * role: the backend refuses it (403) for anyone else.
 *
 * With "Générer un mot de passe temporaire" (on by default for a
 * technician) the server creates the password and answers it once: the
 * dialog then turns into the hand-over panel, which only this component's
 * state holds. Closing it forgets the password for good.
 */
export function CreateUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useT();
  const { user: currentUser } = useAuth();
  const roleOptions =
    currentUser?.role === UserRole.SUPER_ADMIN
      ? ROLE_OPTIONS
      : ROLE_OPTIONS.filter((role) => role !== UserRole.SUPER_ADMIN);
  const { mutate: createUser, isPending, reset: forgetCreate } = useCreateUser();
  const schema = useMemo(() => makeCreateUserSchema(t), [t]);
  const [created, setCreated] = useState<CreatedAccount | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    clearErrors,
    control,
  } = useForm<CreateUserForm>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  });

  const close = (next: boolean) => {
    if (!next) {
      reset(DEFAULTS);
      setCreated(null);
      // A refused attempt keeps its variables (a typed password) in the cache too.
      forgetCreate();
    }
    onOpenChange(next);
  };

  const onSubmit = handleSubmit((data) => {
    const phone = data.phone?.trim();
    const payload: CreateUserDto = {
      email: data.email,
      fullName: data.fullName,
      role: data.role,
      phone: phone || undefined,
      country: phone ? data.country?.trim() : undefined,
    };
    // Either the server generates the password or the admin typed one;
    // never both (the API refuses the pair), never a blank one.
    if (data.generateTemporaryPassword) payload.generateTemporaryPassword = true;
    else payload.password = data.password;

    createUser(payload, {
      onSuccess: (account) => {
        if (account.temporaryPassword) {
          setCreated({
            name: account.fullName,
            email: account.email,
            temporaryPassword: account.temporaryPassword,
          });
        } else {
          close(false);
        }
        // This state is now the only copy: drop the mutation (its answer,
        // and a typed password in its variables) from the MutationCache.
        forgetCreate();
      },
    });
  });

  const country = useWatch({ control, name: 'country' });
  const role = useWatch({ control, name: 'role' });
  const generate = useWatch({ control, name: 'generateTemporaryPassword' });
  const phoneError = errors.phone?.message ?? errors.country?.message;

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && close(next)}>
      <DialogContent
        className="sm:max-w-lg"
        // While the password is on screen only an explicit close (Done or
        // the X) dismisses it: a stray click outside would lose it for good.
        onInteractOutside={(event) => {
          if (created) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (created) event.preventDefault();
        }}
      >
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('usersDesk.create.createdTitle')}</DialogTitle>
              <DialogDescription>
                {t('usersDesk.create.createdDesc', {
                  name: created.name,
                  email: created.email,
                })}
              </DialogDescription>
            </DialogHeader>
            <TemporaryPasswordPanel
              password={created.temporaryPassword}
              name={created.name}
              autoFocus
            />
            <DialogFooter>
              <Button type="button" onClick={() => close(false)}>
                {t('usersDesk.create.done')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('usersUi.createDialog.title')}</DialogTitle>
              <DialogDescription>{t('usersUi.createDialog.desc')}</DialogDescription>
            </DialogHeader>
            <form onSubmit={onSubmit} className="grid gap-4" noValidate>
              <div className="grid gap-1.5">
                <Label htmlFor="create-user-name">{t('usersUi.fullNameRequired')}</Label>
                <Input
                  id="create-user-name"
                  autoComplete="off"
                  aria-invalid={!!errors.fullName}
                  {...register('fullName')}
                />
                {errors.fullName && (
                  <p className="text-xs text-destructive">{errors.fullName.message}</p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="create-user-email">
                  {t('usersUi.createDialog.emailRequired')}
                </Label>
                <Input
                  id="create-user-email"
                  type="email"
                  autoComplete="off"
                  aria-invalid={!!errors.email}
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="create-user-role">{t('usersUi.role')}</Label>
                <Controller
                  name="role"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(next) => {
                        field.onChange(next);
                        // Each role starts on its own default.
                        setValue(
                          'generateTemporaryPassword',
                          generatesByDefault(next as UserRole),
                        );
                        clearErrors('password');
                      }}
                    >
                      <SelectTrigger id="create-user-role" className="w-full">
                        <SelectValue placeholder={t('usersUi.selectRole')} />
                      </SelectTrigger>
                      <SelectContent>
                        {roleOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {t(`usersUi.roles.${option}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {role === UserRole.TECHNICIAN && (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <FlaskConical className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                    {t('usersDesk.create.technicianNote')}
                  </p>
                )}
              </div>

              <div className="grid gap-3 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid gap-0.5">
                    <Label htmlFor="create-user-generate">
                      {t('usersDesk.create.generateLabel')}
                    </Label>
                    <p
                      id="create-user-generate-hint"
                      className="text-xs text-muted-foreground"
                    >
                      {t('usersDesk.create.generateHint')}
                    </p>
                  </div>
                  <Controller
                    name="generateTemporaryPassword"
                    control={control}
                    render={({ field }) => (
                      <Switch
                        id="create-user-generate"
                        checked={field.value}
                        onCheckedChange={(next) => {
                          field.onChange(next);
                          if (next) {
                            // A typed password would be refused with it.
                            setValue('password', '');
                            clearErrors('password');
                          }
                        }}
                        aria-describedby="create-user-generate-hint"
                        className="mt-0.5"
                      />
                    )}
                  />
                </div>
                {!generate && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="create-user-password">
                      {t('usersUi.createDialog.passwordRequired')}
                    </Label>
                    <Input
                      id="create-user-password"
                      type="password"
                      autoComplete="new-password"
                      aria-invalid={!!errors.password}
                      {...register('password')}
                    />
                    {errors.password ? (
                      <p className="text-xs text-destructive">{errors.password.message}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t('usersDesk.create.passwordHint')}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="create-user-phone">{t('usersUi.phone')}</Label>
                <Controller
                  name="phone"
                  control={control}
                  render={({ field }) => (
                    <PhoneInput
                      id="create-user-phone"
                      name={field.name}
                      value={field.value}
                      country={country}
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
                      isInvalid={!!phoneError}
                    />
                  )}
                />
                {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => close(false)}
                  disabled={isPending}
                >
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                  {isPending
                    ? t('usersUi.createDialog.creating')
                    : t('usersUi.createDialog.createBtn')}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
