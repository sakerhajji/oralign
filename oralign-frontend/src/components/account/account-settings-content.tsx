'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from '@/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PhoneInput } from '@/components/ui/phone-input';
import { AccountSkeleton } from '@/components/account/account-skeleton';
import { WorkingHoursEditor, buildScheduleFromHours, DaySchedule } from '@/components/account/working-hours';
import {
  accountProfileSchema,
  clinicSettingsSchema,
  securitySettingsSchema,
  type AccountProfileFormData,
  type ClinicSettingsFormData,
  type SecuritySettingsFormData,
} from '@/lib/schemas';
import { type UpdateUserDto, UserRole } from '@/lib/types';
import type { UpdateClinicProfileBody } from '@/lib/api/dentist-profile.service';
import { RegistrationNumberField } from '@/components/account/registration-number-field';
import {
  REGISTRATION_NUMBER_MAX_LENGTH,
  registrationNumberInput,
  registrationNumberPayload,
} from '@/lib/doctor/registration-number';
import { registrationNumberField } from '@/lib/doctor/registration-number-schema';
import { gateRequiredPhone, gateRequiredText } from '@/lib/doctor/clinic-gate-schema';
import { optionalTextChanged, optionalTextPayload } from '@/lib/doctor/clinic-payload';
import {
  useAccountData,
  useChangePassword,
  useCreateDentistProfile,
  useCreateWorkingHours,
  useForgotPassword,
  useUpdateClinicProfile,
  useUpdateProfile,
  useUpdateWorkingHours,
} from '@/lib/hooks';
import { usersService } from '@/lib/api';
import { getAvatarUrl } from '@/lib/utils';
import { useAuth } from '@/lib/providers';
import { invalidateDoctorIdentityQueries } from '@/lib/hooks/use-dentist-profiles';
import { useT } from '@/lib/i18n/lang-context';

const TIME_REGEX = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

const normalizeOptional = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/** The clinic tab: the clinic settings plus the private registration number (spec §6). */
type ClinicTabValues = ClinicSettingsFormData & { registrationNumber?: string };

export function AccountSettingsContent() {
  const { t } = useT();
  const queryClient = useQueryClient();
  const { login } = useAuth();
  const { user, dentistProfile, workingHours, isDentist, isLoading, error, refetchWorkingHours } = useAccountData();
  const profileMutation = useUpdateProfile({ successMessage: t('accountSettings.toastProfileUpdated') });
  const { mutateAsync: changePassword, isPending: isChangingPassword } = useChangePassword();
  const { mutate: sendResetLink, isPending: isSendingReset } = useForgotPassword();
  const clinicMutation = useUpdateClinicProfile();
  const { mutateAsync: createProfile, isPending: isCreatingProfile } = useCreateDentistProfile();
  const { mutateAsync: createWorkingHours } = useCreateWorkingHours();
  const { mutateAsync: updateWorkingHours } = useUpdateWorkingHours();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [baselineSchedule, setBaselineSchedule] = useState<DaySchedule[]>([]);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  const profileForm = useForm<AccountProfileFormData>({
    resolver: zodResolver(accountProfileSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      country: 'TN',
    },
  });

  const clinicSchema = useMemo(
    () =>
      clinicSettingsSchema.extend({
        // Required by the onboarding gate: a blank here would send the
        // doctor back to /onboarding/clinic (clinic-gate-schema.ts).
        clinicAddress: gateRequiredText(t('onboardingPages.clinicForm.vClinicAddressRequired'), 2),
        clinicPhone: gateRequiredPhone(t('onboardingPages.clinicForm.vClinicPhoneFormat')),
        registrationNumber: registrationNumberField(
          t('doctorIdentity.registrationNumber.tooLong', { max: REGISTRATION_NUMBER_MAX_LENGTH }),
        ),
      }),
    [t],
  );

  const clinicForm = useForm<ClinicTabValues>({
    resolver: zodResolver(clinicSchema),
    defaultValues: {
      clinicName: '',
      clinicAddress: '',
      clinicPhone: '',
      registrationNumber: '',
    },
  });

  const securityForm = useForm<SecuritySettingsFormData>({
    resolver: zodResolver(securitySettingsSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    if (!user) return;
    profileForm.reset({
      fullName: user.fullName,
      email: user.email,
      phone: user.phone ?? '',
      country: user.country ?? 'TN',
    });
    setAvatarPreview(getAvatarUrl(user.avatarUrl));
    setAvatarFile(null);
  }, [user, profileForm]);

  useEffect(() => {
    if (!dentistProfile) return;
    clinicForm.reset({
      clinicName: dentistProfile.clinicName ?? '',
      clinicAddress: dentistProfile.clinicAddress ?? '',
      clinicPhone: dentistProfile.clinicPhone ?? '',
      registrationNumber: registrationNumberInput(dentistProfile.registrationNumber),
    });
  }, [dentistProfile, clinicForm]);

  useEffect(() => {
    const nextSchedule = buildScheduleFromHours(workingHours);
    setSchedule(nextSchedule);
    setBaselineSchedule(nextSchedule);
  }, [workingHours]);

  const isProfileSubmitting = profileMutation.isPending || isUploadingAvatar;
  const isClinicSubmitting =
    clinicMutation.isPending || isCreatingProfile || isSavingSchedule;
  const isPasswordSubmitting = isChangingPassword;

  const profileCountryValue = profileForm.watch('country');

  const profileHasChanges = profileForm.formState.isDirty || !!avatarFile;
  const scheduleDirty = useMemo(() => {
    if (schedule.length !== baselineSchedule.length) return true;
    return schedule.some((day, index) => {
      const baseline = baselineSchedule[index];
      return (
        day.dayOfWeek !== baseline?.dayOfWeek ||
        day.openTime !== baseline.openTime ||
        day.closeTime !== baseline.closeTime ||
        day.isClosed !== baseline.isClosed
      );
    });
  }, [schedule, baselineSchedule]);

  const clinicHasChanges = clinicForm.formState.isDirty || scheduleDirty;
  const passwordHasChanges = securityForm.formState.isDirty;

  const handleAvatarSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('accountSettings.toastSelectImage'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('accountSettings.toastAvatarTooLarge'));
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setAvatarPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleProfileSubmit = profileForm.handleSubmit(async (values) => {
    if (!user) return;
    setIsUploadingAvatar(true);
    try {
      let updatedUser = user;
      if (avatarFile) {
        updatedUser = await usersService.uploadAvatar(user.id, avatarFile);
        login(updatedUser);
        // The photo shows wherever the doctor does (spec §6).
        void invalidateDoctorIdentityQueries(queryClient);
      }

      // An emptied stored number is sent as null (the server clears it;
      // undefined would keep it). The country here is the phone field's
      // own (its dial-code picker): it goes with a number only.
      const phone = optionalTextPayload(values.phone, user.phone);
      const country = phone ? normalizeOptional(values.country) : undefined;
      const updateData: UpdateUserDto = {
        fullName: values.fullName,
        phone,
        country,
      };

      const hasProfileDataChanges =
        values.fullName !== user.fullName ||
        optionalTextChanged(phone, user.phone) ||
        (!!phone && country !== (user.country ?? undefined));

      if (hasProfileDataChanges) {
        updatedUser = await profileMutation.mutateAsync({ id: user.id, data: updateData });
      } else if (avatarFile) {
        toast.success(t('accountSettings.toastProfileUpdated'));
      }

      profileForm.reset({
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        phone: updatedUser.phone ?? '',
        country: updatedUser.country ?? 'TN',
      });
      setAvatarFile(null);
      setAvatarPreview(getAvatarUrl(updatedUser.avatarUrl));
    } finally {
      setIsUploadingAvatar(false);
    }
  });

  const validateSchedule = useCallback(() => {
    for (const day of schedule) {
      if (!day.isClosed) {
        if (!TIME_REGEX.test(day.openTime) || !TIME_REGEX.test(day.closeTime)) {
          toast.error(t('accountSettings.toastInvalidHours'));
          return false;
        }
        if (day.openTime >= day.closeTime) {
          toast.error(t('accountSettings.toastOpeningBeforeClosing'));
          return false;
        }
      }
    }
    return true;
  }, [schedule, t]);

  const handleClinicSubmit = clinicForm.handleSubmit(async (values) => {
    if (!user || user.role !== UserRole.DENTIST) return;
    if (!validateSchedule()) return;

    setIsSavingSchedule(true);
    try {
      let profileId = dentistProfile?.id;
      const clinicPayload = {
        clinicName: values.clinicName,
        // Address and practice phone are required by the schema (the
        // onboarding gate needs them, clinic-gate-schema.ts), so they are
        // never blank here; optionalTextPayload trims them and keeps the
        // shared rule (a blank on create stays out of the body).
        clinicAddress: optionalTextPayload(values.clinicAddress, dentistProfile?.clinicAddress),
        clinicPhone: optionalTextPayload(values.clinicPhone, dentistProfile?.clinicPhone),
        // null clears a number the doctor removed (undefined would keep it).
        registrationNumber: registrationNumberPayload(values.registrationNumber),
      } satisfies UpdateClinicProfileBody;

      if (!profileId) {
        const createdProfile = await createProfile(clinicPayload);
        profileId = createdProfile.id;
        toast.success(t('accountSettings.toastClinicCreated'));
      } else {
        await clinicMutation.mutateAsync({ id: profileId, data: clinicPayload });
      }

      if (profileId) {
        await Promise.all(
          schedule.map((day) =>
            day.existingId
              ? updateWorkingHours({
                  id: day.existingId,
                  data: {
                    openTime: day.openTime,
                    closeTime: day.closeTime,
                    isClosed: day.isClosed,
                  },
                })
              : createWorkingHours({
                  dentistProfileId: profileId,
                  dayOfWeek: day.dayOfWeek,
                  openTime: day.openTime,
                  closeTime: day.closeTime,
                  isClosed: day.isClosed,
                }),
          ),
        );
        await refetchWorkingHours();
        toast.success(t('accountSettings.toastWorkingHoursSaved'));
      }

      clinicForm.reset({
        clinicName: values.clinicName,
        clinicAddress: values.clinicAddress,
        clinicPhone: values.clinicPhone,
        registrationNumber: values.registrationNumber,
      });
    } finally {
      setIsSavingSchedule(false);
    }
  });

  const handlePasswordSubmit = securityForm.handleSubmit(async (values) => {
    if (!user) return;
    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      securityForm.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch {
      // Error toast already shown by useChangePassword
    }
  });

  const handleSendResetLink = () => {
    if (!user) return;
    sendResetLink({ email: user.email });
  };

  const tabItems = useMemo(
    () => [
      { key: 'profile', label: t('accountSettings.tabProfile') },
      ...(isDentist ? [{ key: 'clinic', label: t('accountSettings.tabClinic') }] : []),
      { key: 'security', label: t('accountSettings.tabSecurity') },
    ],
    [isDentist, t],
  );

  return (
    <div className="@container/main flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-6 py-6">
        <div className="px-4 lg:px-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{t('accountSettings.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('accountSettings.subtitle')}
            </p>
          </div>
        </div>

        <div className="px-4 lg:px-6">
          {isLoading && <AccountSkeleton />}
          {!isLoading && error && (
            <Alert variant="destructive">
              <AlertTitle>{t('accountSettings.unableToLoad')}</AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : t('accountSettings.tryAgainLater')}
              </AlertDescription>
            </Alert>
          )}

          {!isLoading && !error && user && (
            <Tabs defaultValue="profile" className="space-y-6">
              <TabsList className="flex flex-wrap gap-2">
                {tabItems.map((tab) => (
                  <TabsTrigger key={tab.key} value={tab.key}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="profile" className="space-y-6">
                <Card>
                  <CardHeader>
                    <h3 className="text-base font-semibold">{t('accountSettings.profileDetailsTitle')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('accountSettings.profileDetailsBody')}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <Avatar className="h-16 w-16">
                        <AvatarImage src={avatarPreview} alt={user.fullName} />
                        <AvatarFallback>
                          {user.fullName
                            .split(' ')
                            .map((part) => part[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-1 flex-col gap-2">
                        <div>
                          <p className="text-sm font-medium">{t('accountSettings.profilePhotoLabel')}</p>
                          <p className="text-xs text-muted-foreground">
                            {t('accountSettings.profilePhotoHint')}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isProfileSubmitting}
                          >
                            {t('accountSettings.uploadAvatar')}
                          </Button>
                          {avatarFile && (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                setAvatarFile(null);
                                setAvatarPreview(getAvatarUrl(user.avatarUrl));
                              }}
                              disabled={isProfileSubmitting}
                            >
                              {t('accountSettings.reset')}
                            </Button>
                          )}
                        </div>
                        <input
                          type="file"
                          ref={fileInputRef}
                          accept="image/*"
                          onChange={handleAvatarSelect}
                          className="hidden"
                        />
                      </div>
                    </div>

                    <Separator />

                    <Form onSubmit={handleProfileSubmit}>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium" htmlFor="fullName">
                            {t('accountSettings.fullNameLabel')}
                          </label>
                          <Input id="fullName" maxLength={120} {...profileForm.register('fullName')} />
                          {profileForm.formState.errors.fullName && (
                            <p className="text-sm text-destructive">
                              {profileForm.formState.errors.fullName.message}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium" htmlFor="email">
                            {t('accountSettings.emailLabel')}
                          </label>
                          <Input id="email" {...profileForm.register('email')} disabled />
                          <p className="text-xs text-muted-foreground">
                            {t('accountSettings.emailManagedHint')}
                          </p>
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <label className="text-sm font-medium" htmlFor="phone">
                            {t('accountSettings.phoneLabel')}
                          </label>
                          <Controller
                            name="phone"
                            control={profileForm.control}
                            render={({ field }) => (
                              <PhoneInput
                                id="phone"
                                name={field.name}
                                value={field.value}
                                country={profileCountryValue}
                                defaultCountry="TN"
                                onBlur={field.onBlur}
                                onChange={(next) => {
                                  field.onChange(next.phone);
                                  profileForm.setValue('country', next.country, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  });
                                }}
                                placeholder="+216 71 000 000"
                                isInvalid={!!profileForm.formState.errors.phone}
                              />
                            )}
                          />
                          <input type="hidden" {...profileForm.register('country')} />
                          {profileForm.formState.errors.phone || profileForm.formState.errors.country ? (
                            <p className="text-sm text-destructive">
                              {profileForm.formState.errors.phone?.message ??
                                profileForm.formState.errors.country?.message}
                            </p>
                          ) : (
                            isDentist && (
                              <p className="text-xs text-muted-foreground">
                                {t('doctorIdentity.contact.accountPhoneHint')}
                              </p>
                            )
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          className="pointer-coarse:h-12"
                          disabled={isProfileSubmitting || !profileHasChanges}
                        >
                          {isProfileSubmitting
                            ? t('accountSettings.saving')
                            : t('accountSettings.saveChanges')}
                        </Button>
                      </div>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>

              {isDentist && (
                <TabsContent value="clinic" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <h3 className="text-base font-semibold">{t('accountSettings.clinicSettingsTitle')}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t('accountSettings.clinicSettingsBody')}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <Form onSubmit={handleClinicSubmit} className="space-y-6">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-medium" htmlFor="clinicName">
                              {t('accountSettings.clinicNameLabel')}
                            </label>
                            <Input id="clinicName" {...clinicForm.register('clinicName')} />
                            {clinicForm.formState.errors.clinicName && (
                              <p className="text-sm text-destructive">
                                {clinicForm.formState.errors.clinicName.message}
                              </p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium" htmlFor="clinicPhone">
                              {t('accountSettings.clinicPhoneLabel')}
                            </label>
                            <Controller
                              name="clinicPhone"
                              control={clinicForm.control}
                              render={({ field }) => (
                                <PhoneInput
                                  id="clinicPhone"
                                  name={field.name}
                                  value={field.value}
                                  country={profileCountryValue}
                                  defaultCountry="TN"
                                  onBlur={field.onBlur}
                                  onChange={(next) => {
                                    field.onChange(next.phone);
                                  }}
                                  placeholder="+216 71 000 000"
                                  isInvalid={!!clinicForm.formState.errors.clinicPhone}
                                />
                              )}
                            />
                            {clinicForm.formState.errors.clinicPhone ? (
                              <p className="text-sm text-destructive">
                                {clinicForm.formState.errors.clinicPhone.message}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                {t('doctorIdentity.contact.clinicPhoneHint')}
                              </p>
                            )}
                          </div>

                          <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium" htmlFor="clinicAddress">
                              {t('accountSettings.addressLabel')}
                            </label>
                            <Input
                              id="clinicAddress"
                              aria-invalid={!!clinicForm.formState.errors.clinicAddress}
                              {...clinicForm.register('clinicAddress')}
                            />
                            {clinicForm.formState.errors.clinicAddress && (
                              <p className="text-sm text-destructive">
                                {clinicForm.formState.errors.clinicAddress.message}
                              </p>
                            )}
                          </div>

                          <RegistrationNumberField
                            className="md:col-span-2"
                            registration={clinicForm.register('registrationNumber')}
                            error={clinicForm.formState.errors.registrationNumber?.message}
                          />
                        </div>

                        <Separator />

                        <div className="space-y-3">
                          <div>
                            <p className="text-sm font-medium">{t('accountSettings.workingHoursLabel')}</p>
                            <p className="text-xs text-muted-foreground">
                              {t('accountSettings.workingHoursHint')}
                            </p>
                          </div>
                          <WorkingHoursEditor
                            schedule={schedule}
                            onChange={setSchedule}
                            disabled={isClinicSubmitting}
                          />
                        </div>

                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            className="pointer-coarse:h-12"
                            disabled={isClinicSubmitting || !clinicHasChanges}
                          >
                            {isClinicSubmitting
                              ? t('accountSettings.saving')
                              : t('accountSettings.saveClinic')}
                          </Button>
                        </div>
                      </Form>
                    </CardContent>
                  </Card>
                </TabsContent>
              )}

              <TabsContent value="security" className="space-y-6">
                {/* Change password with current password */}
                <Card>
                  <CardHeader>
                    <h3 className="text-base font-semibold">{t('accountSettings.changePasswordTitle')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('accountSettings.changePasswordBody')}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <Form onSubmit={handlePasswordSubmit}>
                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="currentPassword">
                          {t('accountSettings.currentPassword')}
                        </label>
                        <Input
                          id="currentPassword"
                          type="password"
                          autoComplete="current-password"
                          {...securityForm.register('currentPassword')}
                        />
                        {securityForm.formState.errors.currentPassword && (
                          <p className="text-sm text-destructive">
                            {securityForm.formState.errors.currentPassword.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="newPassword">
                          {t('accountSettings.newPassword')}
                        </label>
                        <Input
                          id="newPassword"
                          type="password"
                          autoComplete="new-password"
                          {...securityForm.register('newPassword')}
                        />
                        {securityForm.formState.errors.newPassword && (
                          <p className="text-sm text-destructive">
                            {securityForm.formState.errors.newPassword.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="confirmPassword">
                          {t('accountSettings.confirmPassword')}
                        </label>
                        <Input
                          id="confirmPassword"
                          type="password"
                          autoComplete="new-password"
                          {...securityForm.register('confirmPassword')}
                        />
                        {securityForm.formState.errors.confirmPassword && (
                          <p className="text-sm text-destructive">
                            {securityForm.formState.errors.confirmPassword.message}
                          </p>
                        )}
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          className="pointer-coarse:h-12"
                          disabled={isPasswordSubmitting || !passwordHasChanges}
                        >
                          {isPasswordSubmitting
                            ? t('accountSettings.updating')
                            : t('accountSettings.updatePassword')}
                        </Button>
                      </div>
                    </Form>
                  </CardContent>
                </Card>

                {/* Forgot current password — send reset link */}
                <Card>
                  <CardHeader>
                    <h3 className="text-base font-semibold">{t('accountSettings.forgotTitle')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('accountSettings.forgotBody', { email: user?.email ?? '' })}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSendResetLink}
                      disabled={isSendingReset}
                    >
                      {isSendingReset
                        ? t('accountSettings.sending')
                        : t('accountSettings.sendResetLink')}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
