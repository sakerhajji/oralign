'use client';

import { useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
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
import { UserRole } from '@/lib/types';

type Translate = (path: string, vars?: Record<string, string | number>) => string;

// Messages are user-facing, so the schema is built with the translator.
const makeCreateUserSchema = (t: Translate) =>
  z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email(t('usersDesk.create.emailInvalid')),
    fullName: z.string().trim().min(2, t('usersUi.validation.min2')),
    password: z.string().min(8, t('usersUi.validation.min8')),
    phone: optionalE164PhoneSchema,
    country: optionalCountrySchema,
    role: z.nativeEnum(UserRole),
  });

type CreateUserForm = z.infer<ReturnType<typeof makeCreateUserSchema>>;

const DEFAULTS: CreateUserForm = {
  email: '',
  fullName: '',
  password: '',
  phone: '',
  country: 'TN',
  role: UserRole.DENTIST,
};

const ROLE_OPTIONS = [
  UserRole.DENTIST,
  UserRole.DESIGNER,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
] as const;

/**
 * Admin "Add user" dialog. Loaded on demand by the users page
 * (next/dynamic), so the phone input and its flag sprite stay out of
 * the list's first load. The role is a controlled field with a default
 * and is always sent. Only a super admin is offered the super admin
 * role: the backend refuses it (403) for anyone else.
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
  const { mutate: createUser, isPending } = useCreateUser();
  const schema = useMemo(() => makeCreateUserSchema(t), [t]);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    control,
  } = useForm<CreateUserForm>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  });

  const close = (next: boolean) => {
    if (!next) reset(DEFAULTS);
    onOpenChange(next);
  };

  const onSubmit = handleSubmit((data) => {
    const phone = data.phone?.trim();
    createUser(
      {
        email: data.email,
        fullName: data.fullName,
        password: data.password,
        role: data.role,
        phone: phone || undefined,
        country: phone ? data.country?.trim() : undefined,
      },
      { onSuccess: () => close(false) },
    );
  });

  const country = useWatch({ control, name: 'country' });
  const phoneError = errors.phone?.message ?? errors.country?.message;

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && close(next)}>
      <DialogContent className="sm:max-w-lg">
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-1.5">
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
            <div className="grid content-start gap-1.5">
              <Label htmlFor="create-user-role">{t('usersUi.role')}</Label>
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="create-user-role" className="w-full">
                      <SelectValue placeholder={t('usersUi.selectRole')} />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((role) => (
                        <SelectItem key={role} value={role}>
                          {t(`usersUi.roles.${role}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
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
      </DialogContent>
    </Dialog>
  );
}
