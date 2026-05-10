'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
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
import { type UpdateDentistProfileDto, type UpdateUserDto, UserRole } from '@/lib/types';
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
import { userKeys } from '@/lib/hooks/use-users';

const TIME_REGEX = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

const normalizeOptional = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export function AccountSettingsContent() {
  const queryClient = useQueryClient();
  const { login } = useAuth();
  const { user, dentistProfile, workingHours, isDentist, isLoading, error, refetchWorkingHours } = useAccountData();
  const profileMutation = useUpdateProfile({ successMessage: 'Profile updated successfully.' });
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

  const clinicForm = useForm<ClinicSettingsFormData>({
    resolver: zodResolver(clinicSettingsSchema),
    defaultValues: {
      clinicName: '',
      clinicAddress: '',
      clinicPhone: '',
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
      toast.error('Please select an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Avatar must be 5MB or smaller.');
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
        queryClient.invalidateQueries({ queryKey: userKeys.currentUser() });
      }

      const trimmedPhone = normalizeOptional(values.phone);
      const updateData: UpdateUserDto = {
        fullName: values.fullName,
      };

      if (trimmedPhone) {
        updateData.phone = trimmedPhone;
        updateData.country = normalizeOptional(values.country);
      } else {
        updateData.phone = undefined;
        updateData.country = undefined;
      }

      const hasProfileDataChanges =
        values.fullName !== user.fullName ||
        trimmedPhone !== (user.phone ?? undefined) ||
        (trimmedPhone ? normalizeOptional(values.country) !== user.country : !!user.phone);

      if (hasProfileDataChanges) {
        updatedUser = await profileMutation.mutateAsync({ id: user.id, data: updateData });
      } else if (avatarFile) {
        toast.success('Profile updated successfully.');
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
          toast.error('Please provide valid working hours (HH:mm).');
          return false;
        }
        if (day.openTime >= day.closeTime) {
          toast.error('Opening time must be before closing time.');
          return false;
        }
      }
    }
    return true;
  }, [schedule]);

  const handleClinicSubmit = clinicForm.handleSubmit(async (values) => {
    if (!user || user.role !== UserRole.DENTIST) return;
    if (!validateSchedule()) return;

    setIsSavingSchedule(true);
    try {
      let profileId = dentistProfile?.id;
      const clinicPayload: UpdateDentistProfileDto = {
        clinicName: values.clinicName,
        clinicAddress: normalizeOptional(values.clinicAddress),
        clinicPhone: normalizeOptional(values.clinicPhone),
      };

      if (!profileId) {
        const createdProfile = await createProfile({
          clinicName: values.clinicName,
          clinicAddress: normalizeOptional(values.clinicAddress),
          clinicPhone: normalizeOptional(values.clinicPhone),
        });
        profileId = createdProfile.id;
        toast.success('Clinic profile created.');
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
        toast.success('Working hours saved.');
      }

      clinicForm.reset({
        clinicName: values.clinicName,
        clinicAddress: values.clinicAddress,
        clinicPhone: values.clinicPhone,
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
      { key: 'profile', label: 'Profile' },
      ...(isDentist ? [{ key: 'clinic', label: 'Clinic' }] : []),
      { key: 'security', label: 'Security' },
    ],
    [isDentist],
  );

  return (
    <div className="@container/main flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-6 py-6">
        <div className="px-4 lg:px-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Account settings</h1>
            <p className="text-sm text-muted-foreground">
              Update your profile, clinic details, and security preferences.
            </p>
          </div>
        </div>

        <div className="px-4 lg:px-6">
          {isLoading && <AccountSkeleton />}
          {!isLoading && error && (
            <Alert variant="destructive">
              <AlertTitle>Unable to load settings</AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : 'Please try again later.'}
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
                    <h3 className="text-base font-semibold">Profile details</h3>
                    <p className="text-sm text-muted-foreground">
                      Keep your personal information up to date.
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
                          <p className="text-sm font-medium">Profile photo</p>
                          <p className="text-xs text-muted-foreground">
                            Upload a square image for best results.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isProfileSubmitting}
                          >
                            Upload avatar
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
                              Reset
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
                            Full name
                          </label>
                          <Input id="fullName" {...profileForm.register('fullName')} />
                          {profileForm.formState.errors.fullName && (
                            <p className="text-sm text-destructive">
                              {profileForm.formState.errors.fullName.message}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium" htmlFor="email">
                            Email
                          </label>
                          <Input id="email" {...profileForm.register('email')} disabled />
                          <p className="text-xs text-muted-foreground">
                            Email updates are managed by support.
                          </p>
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <label className="text-sm font-medium" htmlFor="phone">
                            Phone
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
                          {(profileForm.formState.errors.phone || profileForm.formState.errors.country) && (
                            <p className="text-sm text-destructive">
                              {profileForm.formState.errors.phone?.message ??
                                profileForm.formState.errors.country?.message}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button type="submit" disabled={isProfileSubmitting || !profileHasChanges}>
                          {isProfileSubmitting ? 'Saving...' : 'Save changes'}
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
                      <h3 className="text-base font-semibold">Clinic settings</h3>
                      <p className="text-sm text-muted-foreground">
                        Manage your clinic profile and availability.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <Form onSubmit={handleClinicSubmit} className="space-y-6">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-medium" htmlFor="clinicName">
                              Clinic name
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
                              Clinic phone
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
                            {clinicForm.formState.errors.clinicPhone && (
                              <p className="text-sm text-destructive">
                                {clinicForm.formState.errors.clinicPhone.message}
                              </p>
                            )}
                          </div>

                          <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium" htmlFor="clinicAddress">
                              Address
                            </label>
                            <Input id="clinicAddress" {...clinicForm.register('clinicAddress')} />
                          </div>
                        </div>

                        <Separator />

                        <div className="space-y-3">
                          <div>
                            <p className="text-sm font-medium">Working hours</p>
                            <p className="text-xs text-muted-foreground">
                              Set your weekly availability.
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
                            disabled={isClinicSubmitting || !clinicHasChanges}
                          >
                            {isClinicSubmitting ? 'Saving...' : 'Save clinic settings'}
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
                    <h3 className="text-base font-semibold">Change password</h3>
                    <p className="text-sm text-muted-foreground">
                      Enter your current password to set a new one.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <Form onSubmit={handlePasswordSubmit}>
                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="currentPassword">
                          Current password
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
                          New password
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
                          Confirm new password
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
                        <Button type="submit" disabled={isPasswordSubmitting || !passwordHasChanges}>
                          {isPasswordSubmitting ? 'Updating...' : 'Update password'}
                        </Button>
                      </div>
                    </Form>
                  </CardContent>
                </Card>

                {/* Forgot current password — send reset link */}
                <Card>
                  <CardHeader>
                    <h3 className="text-base font-semibold">Forgot your password?</h3>
                    <p className="text-sm text-muted-foreground">
                      We&apos;ll send a password-reset link to{' '}
                      <span className="font-medium text-foreground">{user?.email}</span>.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSendResetLink}
                      disabled={isSendingReset}
                    >
                      {isSendingReset ? 'Sending…' : 'Send reset link'}
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
