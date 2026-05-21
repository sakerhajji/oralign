'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PhoneInput } from '@/components/ui/phone-input';
import { LocationPicker } from '@/components/ui/location-picker';
import { CountryPhoneDisplay } from '@/components/ui/phone-display';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { UserRole, DayOfWeek, UpdateUserDto } from '@/lib/types';
import { useUser, useUpdateUser, userKeys } from '@/lib/hooks/use-users';
import {
  useUpdateDentistProfile,
  useCreateDentistProfileForUser,
} from '@/lib/hooks/use-dentist-profiles';
import {
  useWorkingHoursByProfile,
  useCreateWorkingHours,
  useUpdateWorkingHours,
} from '@/lib/hooks/use-working-hours';
import { usersService, extractApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/providers/auth-provider';
import { getAvatarUrl, cn } from '@/lib/utils';
import { optionalCountrySchema, optionalE164PhoneSchema } from '@/lib/schemas';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  User as UserIcon,
  Shield,
  Building2,
  Clock,
  Upload,
  Mail,
  Phone,
  Key,
  Loader2,
  PlusCircle,
  AlertCircle,
} from 'lucide-react';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  fullName: z.string().min(2, 'At least 2 characters'),
  phone: optionalE164PhoneSchema,
  country: optionalCountrySchema,
  password: z
    .string()
    .refine((v) => !v || v.length >= 8, { message: 'At least 8 characters' })
    .optional(),
});

const accountSchema = z.object({
  role: z.nativeEnum(UserRole),
  isEmailVerified: z.boolean(),
});

const clinicSchema = z.object({
  clinicName: z.string().min(1, 'Clinic name is required'),
  clinicAddress: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  clinicPhone: z.string().optional(),
  clinicEmail: z.string().optional(),
  description: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;
type AccountForm = z.infer<typeof accountSchema>;
type ClinicForm  = z.infer<typeof clinicSchema>;

// ─── Working-hours helpers ───────────────────────────────────────────────────

interface DaySchedule {
  dayOfWeek: DayOfWeek;
  isClosed: boolean;
  openTime: string;
  closeTime: string;
  existingId?: string;
}

const DAYS: { key: DayOfWeek; label: string; short: string; isWeekend: boolean }[] = [
  { key: DayOfWeek.MONDAY,    label: 'Monday',    short: 'Mon', isWeekend: false },
  { key: DayOfWeek.TUESDAY,   label: 'Tuesday',   short: 'Tue', isWeekend: false },
  { key: DayOfWeek.WEDNESDAY, label: 'Wednesday', short: 'Wed', isWeekend: false },
  { key: DayOfWeek.THURSDAY,  label: 'Thursday',  short: 'Thu', isWeekend: false },
  { key: DayOfWeek.FRIDAY,    label: 'Friday',    short: 'Fri', isWeekend: false },
  { key: DayOfWeek.SATURDAY,  label: 'Saturday',  short: 'Sat', isWeekend: true  },
  { key: DayOfWeek.SUNDAY,    label: 'Sunday',    short: 'Sun', isWeekend: true  },
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface UserDetailSheetProps {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function UserDetailSheet({
  userId,
  open,
  onOpenChange,
  initialTab = 'profile',
}: UserDetailSheetProps) {
  const queryClient = useQueryClient();
  // Surface the auth context so we can refresh the sidebar / header
  // avatar instantly when an admin opens their own row and uploads a
  // new picture — otherwise the new avatar only appears after the
  // next /users/me refetch.
  const { user: currentUser, login } = useAuth();
  const { data: user, isLoading: isLoadingUser } = useUser(userId);

  const [activeTab, setActiveTab] = useState(initialTab);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profileError, setProfileError]   = useState<string | null>(null);
  const [accountError, setAccountError]   = useState<string | null>(null);
  const [clinicError,  setClinicError]    = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const profileErrorRef  = useRef<HTMLDivElement>(null);
  const accountErrorRef  = useRef<HTMLDivElement>(null);
  const clinicErrorRef   = useRef<HTMLDivElement>(null);
  const scheduleErrorRef = useRef<HTMLDivElement>(null);

  const { mutateAsync: updateUser,           isPending: isUpdatingUser    } = useUpdateUser();
  const { mutateAsync: updateProfile,        isPending: isUpdatingProfile } = useUpdateDentistProfile();
  const { mutateAsync: createProfileForUser, isPending: isCreatingProfile } = useCreateDentistProfileForUser();
  const { mutateAsync: createWorkingHours } = useCreateWorkingHours();
  const { mutateAsync: updateWorkingHours } = useUpdateWorkingHours();

  const profileId = user?.dentistProfile?.id;
  const { data: workingHours } = useWorkingHoursByProfile(profileId ?? '');

  // ── Forms ──────────────────────────────────────────────────────────────────

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: '', phone: '', country: 'TN', password: '' },
  });

  const accountForm = useForm<AccountForm>({
    resolver: zodResolver(accountSchema),
    defaultValues: { role: UserRole.DENTIST, isEmailVerified: false },
  });

  const clinicForm = useForm<ClinicForm>({
    resolver: zodResolver(clinicSchema),
    defaultValues: {
      clinicName: '', clinicAddress: '', city: '', country: '',
      clinicPhone: '', clinicEmail: '', description: '',
      latitude: undefined, longitude: undefined,
    },
  });

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => { setActiveTab(initialTab); }, [initialTab, userId]);

  useEffect(() => {
    setProfileError(null);
    setAccountError(null);
    setClinicError(null);
    setScheduleError(null);
  }, [activeTab]);

  useEffect(() => {
    if (!user) return;
    profileForm.reset({
      fullName: user.fullName,
      phone:    user.phone    ?? '',
      country:  user.country  ?? 'TN',
      password: '',
    });
    accountForm.reset({ role: user.role, isEmailVerified: user.isEmailVerified });
    const dp = user.dentistProfile;
    clinicForm.reset({
      clinicName:    dp?.clinicName    ?? '',
      clinicAddress: dp?.clinicAddress ?? '',
      city:          dp?.city          ?? '',
      country:       dp?.country       ?? '',
      clinicPhone:   dp?.clinicPhone   ?? '',
      clinicEmail:   dp?.clinicEmail   ?? '',
      description:   dp?.description   ?? '',
      latitude:      dp?.latitude      ?? undefined,
      longitude:     dp?.longitude     ?? undefined,
    });
    setAvatarPreview(getAvatarUrl(user.avatarUrl));
    setAvatarFile(null);
  }, [user]);

  useEffect(() => {
    setSchedule(
      DAYS.map(({ key }) => {
        const wh = workingHours?.find((w) => w.dayOfWeek === key);
        return {
          dayOfWeek:  key,
          isClosed:   wh?.isClosed  ?? true,
          openTime:   wh?.openTime  ?? '09:00',
          closeTime:  wh?.closeTime ?? '17:00',
          existingId: wh?.id,
        };
      }),
    );
  }, [workingHours]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const scrollToError = (ref: React.RefObject<HTMLDivElement | null>) => {
    setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  };

  // ── Avatar ─────────────────────────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Images only');
    if (file.size > 5 * 1024 * 1024) return toast.error('Max 5 MB');
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // ── Save handlers ──────────────────────────────────────────────────────────

  const saveProfile = profileForm.handleSubmit(async (data) => {
    setProfileError(null);
    setIsUploadingAvatar(true);
    try {
      if (avatarFile) {
        const updatedUser = await usersService.uploadAvatar(userId, avatarFile);
        setAvatarPreview(getAvatarUrl(updatedUser.avatarUrl) || avatarPreview);
        setAvatarFile(null);
        queryClient.setQueryData(userKeys.detail(userId), updatedUser);
        queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });
        queryClient.invalidateQueries({ queryKey: userKeys.lists() });
        // Admin editing themselves → refresh auth context so the
        // sidebar avatar updates without waiting for /users/me to
        // refetch on next tick.
        if (currentUser?.id === userId) {
          queryClient.setQueryData(userKeys.currentUser(), updatedUser);
          login(updatedUser);
        }
      }
      const trimmedPhone = data.phone?.trim();
      const payload: Record<string, unknown> = { fullName: data.fullName };
      if (trimmedPhone) {
        payload.phone   = trimmedPhone;
        payload.country = data.country?.trim();
      }
      if (data.password?.trim()) payload.password = data.password;
      await updateUser({ id: userId, data: payload as UpdateUserDto });
      toast.success('Profile saved successfully.');
    } catch (err) {
      const msg = extractApiErrorMessage(err);
      setProfileError(msg);
      scrollToError(profileErrorRef);
    } finally {
      setIsUploadingAvatar(false);
    }
  });

  const saveAccount = accountForm.handleSubmit(async (data) => {
    setAccountError(null);
    try {
      await updateUser({ id: userId, data });
      toast.success('Account settings saved.');
    } catch (err) {
      const msg = extractApiErrorMessage(err);
      setAccountError(msg);
      scrollToError(accountErrorRef);
    }
  });

  const saveClinic = clinicForm.handleSubmit(async (data) => {
    setClinicError(null);
    const payload = {
      clinicName:    data.clinicName,
      clinicAddress: data.clinicAddress || undefined,
      city:          data.city          || undefined,
      country:       data.country       || undefined,
      clinicPhone:   data.clinicPhone   || undefined,
      clinicEmail:   data.clinicEmail   || undefined,
      description:   data.description  || undefined,
      latitude:      data.latitude,
      longitude:     data.longitude,
    };
    try {
      if (user?.dentistProfile?.id) {
        await updateProfile({ id: user.dentistProfile.id, data: payload });
        toast.success('Clinic info saved.');
      } else {
        await createProfileForUser({ userId, data: payload });
        queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });
        toast.success('Clinic profile created.');
      }
    } catch (err) {
      const msg = extractApiErrorMessage(err);
      setClinicError(msg);
      scrollToError(clinicErrorRef);
    }
  });

  const saveSchedule = async () => {
    if (!profileId) return;
    setScheduleError(null);
    setIsSavingSchedule(true);
    try {
      await Promise.all(
        schedule.map((day) => {
          const payload = {
            isClosed:  day.isClosed,
            openTime:  day.openTime,
            closeTime: day.closeTime,
          };
          return day.existingId
            ? updateWorkingHours({ id: day.existingId, data: payload })
            : createWorkingHours({
                dentistProfileId: profileId,
                dayOfWeek: day.dayOfWeek,
                ...payload,
              });
        }),
      );
      toast.success('Schedule saved successfully.');
    } catch (err) {
      const msg = extractApiErrorMessage(err);
      setScheduleError(msg);
      scrollToError(scheduleErrorRef);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const updateDay = (key: DayOfWeek, patch: Partial<DaySchedule>) =>
    setSchedule((prev) => prev.map((d) => (d.dayOfWeek === key ? { ...d, ...patch } : d)));

  // ── Derived ────────────────────────────────────────────────────────────────

  const initials = (user?.fullName ?? '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const isSavingProfile = isUpdatingUser || isUploadingAvatar;
  const hasClinic        = !!user?.dentistProfile;
  const isDentist        = user?.role === UserRole.DENTIST;
  const profileCountry   = profileForm.watch('country');
  const isSavingClinic   = isUpdatingProfile || isCreatingProfile;

  const clinicLat = clinicForm.watch('latitude');
  const clinicLng = clinicForm.watch('longitude');
  const locationValue =
    clinicLat != null && clinicLng != null && !(clinicLat === 0 && clinicLng === 0)
      ? {
          lat: clinicLat,
          lng: clinicLng,
          address: clinicForm.watch('clinicAddress'),
          city: clinicForm.watch('city'),
          country: clinicForm.watch('country'),
        }
      : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/*
        Right-side panel.
        w-[95%]             → nearly full width on mobile
        sm:max-w-[1100px]   → wide enough on desktop for the 4-col schedule grid
                              (overrides the component's default sm:max-w-2xl)
      */}
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 w-[95%] sm:max-w-[1100px]"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b px-6 py-4 pr-14">
          <SheetTitle className="sr-only">Edit User</SheetTitle>
          <SheetDescription className="sr-only">
            Edit user profile, account settings, clinic info and schedule
          </SheetDescription>

          {isLoadingUser ? (
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-muted animate-pulse shrink-0" />
              <div className="space-y-2">
                <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                <div className="h-3 w-56 bg-muted animate-pulse rounded" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12 border-2 border-muted shrink-0">
                <AvatarImage src={avatarPreview} alt={user?.fullName} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-semibold truncate">{user?.fullName}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-sm text-muted-foreground truncate">{user?.email}</span>
                  <Badge
                    variant={user?.isActive ? 'default' : 'destructive'}
                    className="text-xs h-4 px-1.5 shrink-0"
                  >
                    {user?.isActive ? 'Active' : 'Blocked'}
                  </Badge>
                  <Badge variant="outline" className="text-xs h-4 px-1.5 shrink-0">
                    {user?.role}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  <CountryPhoneDisplay phone={user?.phone} country={user?.country} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-col flex-1 min-h-0 gap-0"
        >
          <TabsList className="shrink-0 mx-6 mt-3 mb-0 w-auto justify-start rounded-lg bg-muted/60 h-9">
            <TabsTrigger value="profile" className="flex items-center gap-1.5 text-xs h-7">
              <UserIcon className="h-3.5 w-3.5" /> Profile
            </TabsTrigger>
            <TabsTrigger value="account" className="flex items-center gap-1.5 text-xs h-7">
              <Shield className="h-3.5 w-3.5" /> Account
            </TabsTrigger>
            {(isDentist || hasClinic) && (
              <TabsTrigger value="clinic" className="flex items-center gap-1.5 text-xs h-7">
                <Building2 className="h-3.5 w-3.5" />
                Clinic
                {!hasClinic && isDentist && (
                  <span className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-400" />
                )}
              </TabsTrigger>
            )}
            {hasClinic && (
              <TabsTrigger value="schedule" className="flex items-center gap-1.5 text-xs h-7">
                <Clock className="h-3.5 w-3.5" /> Schedule
              </TabsTrigger>
            )}
          </TabsList>

          {/* ── Profile tab ─────────────────────────────────────────────── */}
          <TabsContent value="profile" className="flex-1 min-h-0 mt-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-6 py-5 space-y-6 max-w-2xl">
                {/* Avatar */}
                <section>
                  <SectionTitle>Profile Picture</SectionTitle>
                  <div className="flex items-center gap-5">
                    <Avatar className="h-20 w-20 border-2 border-muted shrink-0">
                      <AvatarImage src={avatarPreview} alt={user?.fullName} />
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xl font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">JPG, PNG or GIF · max 5 MB</p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload
                        </Button>
                        {avatarFile && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setAvatarFile(null);
                              setAvatarPreview(getAvatarUrl(user?.avatarUrl));
                            }}
                          >
                            Reset
                          </Button>
                        )}
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Identity */}
                <section>
                  <SectionTitle>Identity</SectionTitle>
                  <div className="space-y-3">
                    <Field
                      label="Full Name *"
                      error={profileForm.formState.errors.fullName?.message}
                    >
                      <Input {...profileForm.register('fullName')} placeholder="Full name" />
                    </Field>
                    <Field
                      label="Phone"
                      icon={<Phone className="h-3.5 w-3.5" />}
                      error={
                        profileForm.formState.errors.phone?.message ??
                        profileForm.formState.errors.country?.message
                      }
                    >
                      <Controller
                        name="phone"
                        control={profileForm.control}
                        render={({ field }) => (
                          <PhoneInput
                            id="profile-phone"
                            name={field.name}
                            value={field.value}
                            country={profileCountry}
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
                            isInvalid={
                              !!profileForm.formState.errors.phone ||
                              !!profileForm.formState.errors.country
                            }
                          />
                        )}
                      />
                      <input type="hidden" {...profileForm.register('country')} />
                    </Field>
                  </div>
                </section>

                <Separator />

                {/* Security */}
                <section>
                  <SectionTitle>Security</SectionTitle>
                  <Field
                    label="New Password"
                    icon={<Key className="h-3.5 w-3.5" />}
                    hint="Leave blank to keep current password"
                    error={profileForm.formState.errors.password?.message}
                  >
                    <Input
                      {...profileForm.register('password')}
                      type="password"
                      placeholder="••••••••"
                    />
                  </Field>
                </section>

                {profileError && (
                  <div ref={profileErrorRef}>
                    <InlineError message={profileError} onDismiss={() => setProfileError(null)} />
                  </div>
                )}
              </div>
            </div>
            <TabFooter>
              <Button onClick={saveProfile} disabled={isSavingProfile}>
                {isSavingProfile && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isSavingProfile ? 'Saving…' : 'Save Profile'}
              </Button>
            </TabFooter>
          </TabsContent>

          {/* ── Account tab ─────────────────────────────────────────────── */}
          <TabsContent value="account" className="flex-1 min-h-0 mt-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-6 py-5 space-y-6 max-w-2xl">
                <section>
                  <SectionTitle>Permissions</SectionTitle>
                  <div className="space-y-3">
                    <Field label="Role">
                      <Controller
                        name="role"
                        control={accountForm.control}
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={UserRole.DENTIST}>Dentist</SelectItem>
                              <SelectItem value={UserRole.ADMIN}>Administrator</SelectItem>
                              <SelectItem value={UserRole.DESIGNER}>Designer</SelectItem>
                              <SelectItem value={UserRole.SUPER_ADMIN}>Super Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </Field>

                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <Label className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5" /> Email Verified
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Grant access to email-verified features
                        </p>
                      </div>
                      <Controller
                        name="isEmailVerified"
                        control={accountForm.control}
                        render={({ field }) => (
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        )}
                      />
                    </div>
                  </div>
                </section>

                <Separator />

                <section>
                  <SectionTitle>Current Status</SectionTitle>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        label: 'Account',
                        value: (
                          <Badge variant={user?.isActive ? 'default' : 'destructive'}>
                            {user?.isActive ? 'Active' : 'Blocked'}
                          </Badge>
                        ),
                      },
                      {
                        label: 'Verification',
                        value: <Badge variant="outline">{user?.verificationStatus}</Badge>,
                      },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-lg bg-muted/40 px-3 py-2.5 space-y-1">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        {value}
                      </div>
                    ))}
                  </div>
                </section>

                <Separator />

                <section>
                  <SectionTitle>Timeline</SectionTitle>
                  <div className="space-y-0">
                    {[
                      {
                        label: 'Member since',
                        value: user?.createdAt
                          ? format(new Date(user.createdAt), 'MMM d, yyyy · HH:mm')
                          : '—',
                      },
                      {
                        label: 'Last updated',
                        value: user?.updatedAt
                          ? format(new Date(user.updatedAt), 'MMM d, yyyy · HH:mm')
                          : '—',
                      },
                      {
                        label: 'Last login',
                        value: user?.lastLoginAt
                          ? format(new Date(user.lastLoginAt), 'MMM d, yyyy · HH:mm')
                          : 'Never',
                      },
                      { label: 'User ID', value: user?.id ?? '—', mono: true },
                    ].map(({ label, value, mono }) => (
                      <div
                        key={label}
                        className="flex items-start justify-between border-b last:border-0 py-2.5"
                      >
                        <span className="text-sm text-muted-foreground shrink-0">{label}</span>
                        <span
                          className={cn(
                            'text-sm font-medium text-right ml-4 break-all',
                            mono && 'font-mono text-xs text-muted-foreground',
                          )}
                        >
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                {accountError && (
                  <div ref={accountErrorRef}>
                    <InlineError message={accountError} onDismiss={() => setAccountError(null)} />
                  </div>
                )}
              </div>
            </div>
            <TabFooter>
              <Button onClick={saveAccount} disabled={isUpdatingUser}>
                {isUpdatingUser && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isUpdatingUser ? 'Saving…' : 'Save Account Settings'}
              </Button>
            </TabFooter>
          </TabsContent>

          {/* ── Clinic tab ──────────────────────────────────────────────── */}
          {(isDentist || hasClinic) && (
            <TabsContent value="clinic" className="flex-1 min-h-0 mt-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="px-6 py-5 space-y-6">

                  {!hasClinic && (
                    <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-300">
                      <PlusCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-medium">No clinic profile yet</p>
                        <p className="text-xs mt-0.5 opacity-80">
                          Fill in the form below to create a clinic profile for this dentist.
                        </p>
                      </div>
                    </div>
                  )}

                  <section>
                    <SectionTitle>Clinic Information</SectionTitle>
                    <div className="space-y-3">
                      <Field
                        label="Clinic Name *"
                        error={clinicForm.formState.errors.clinicName?.message}
                      >
                        <Input
                          {...clinicForm.register('clinicName')}
                          placeholder="Smile Dental Clinic"
                        />
                      </Field>
                      <Field label="Address">
                        <Input
                          {...clinicForm.register('clinicAddress')}
                          placeholder="123 Main Street"
                        />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="City">
                          <Input {...clinicForm.register('city')} placeholder="Tunis" />
                        </Field>
                        <Field label="Country">
                          <Input {...clinicForm.register('country')} placeholder="Tunisia" />
                        </Field>
                      </div>
                    </div>
                  </section>

                  <Separator />

                  <section>
                    <SectionTitle>Contact</SectionTitle>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Phone" icon={<Phone className="h-3.5 w-3.5" />}>
                        <Controller
                          name="clinicPhone"
                          control={clinicForm.control}
                          render={({ field }) => (
                            <PhoneInput
                              id="clinic-phone"
                              name={field.name}
                              value={field.value ?? ''}
                              defaultCountry="TN"
                              onBlur={field.onBlur}
                              onChange={(next) => field.onChange(next.phone)}
                              placeholder="+216 71 000 000"
                            />
                          )}
                        />
                      </Field>
                      <Field
                        label="Email"
                        icon={<Mail className="h-3.5 w-3.5" />}
                        error={clinicForm.formState.errors.clinicEmail?.message}
                      >
                        <Input
                          {...clinicForm.register('clinicEmail')}
                          type="email"
                          placeholder="clinic@example.com"
                        />
                      </Field>
                    </div>
                  </section>

                  <Separator />

                  <section>
                    <SectionTitle>About</SectionTitle>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Description</Label>
                      <textarea
                        {...clinicForm.register('description')}
                        rows={4}
                        placeholder="Describe the clinic, specialties, services…"
                        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>
                  </section>

                  <Separator />

                  <section>
                    <SectionTitle>Location</SectionTitle>
                    <p className="text-xs text-muted-foreground mb-3">
                      Click &ldquo;Pick Location&rdquo; to open the map and select the clinic&apos;s
                      exact GPS coordinates.
                    </p>
                    <LocationPicker
                      value={locationValue}
                      onChange={({ lat, lng, address, city, country }) => {
                        clinicForm.setValue('latitude',  lat, { shouldDirty: true });
                        clinicForm.setValue('longitude', lng, { shouldDirty: true });
                        if (address) {
                          clinicForm.setValue('clinicAddress', address, {
                            shouldDirty: true,
                          });
                        }
                        if (city) {
                          clinicForm.setValue('city', city, { shouldDirty: true });
                        }
                        if (country) {
                          clinicForm.setValue('country', country, {
                            shouldDirty: true,
                          });
                        }
                      }}
                    />
                  </section>

                  {clinicError && (
                    <div ref={clinicErrorRef}>
                      <InlineError message={clinicError} onDismiss={() => setClinicError(null)} />
                    </div>
                  )}
                </div>
              </div>
              <TabFooter>
                <Button onClick={saveClinic} disabled={isSavingClinic}>
                  {isSavingClinic && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {isSavingClinic ? 'Saving…' : hasClinic ? 'Save Clinic Info' : 'Create Clinic'}
                </Button>
              </TabFooter>
            </TabsContent>
          )}

          {/* ── Schedule tab ────────────────────────────────────────────── */}
          {hasClinic && (
            <TabsContent value="schedule" className="flex-1 min-h-0 mt-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="px-6 py-5">
                  <SectionTitle>Working Hours</SectionTitle>
                  <p className="text-xs text-muted-foreground mb-5">
                    Set open &amp; close times for each day. Toggle the switch off to mark a day as
                    closed.
                  </p>

                  {/*
                    4-column grid — fixed Day col + two flexible time cols + fixed toggle col.
                    At 1100px panel width with px-6 padding (48px total) the content area is
                    ~1052px. Day=190px, Toggle=52px, gap×3=~12px → 2 time cols share ≈808px
                    (~404px each). Plenty of space for HH:MM + the browser clock icon.
                  */}

                  {/* Header row */}
                  <div className="grid grid-cols-[190px_1fr_1fr_52px] gap-x-3 px-4 pb-2 mb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Day
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Opens
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Closes
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">
                      Open
                    </span>
                  </div>

                  {/* Day rows */}
                  <div className="space-y-2">
                    {schedule.map((day) => {
                      const meta   = DAYS.find((d) => d.key === day.dayOfWeek)!;
                      const isOpen = !day.isClosed;

                      return (
                        <div
                          key={day.dayOfWeek}
                          className={cn(
                            'grid grid-cols-[190px_1fr_1fr_52px] gap-x-3 items-center',
                            'rounded-xl border px-4 py-3 transition-all duration-150',
                            isOpen
                              ? 'bg-background border-border'
                              : 'bg-muted/20 border-border/40',
                          )}
                        >
                          {/* Col 1 — day badge + name */}
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={cn(
                                'inline-flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-lg',
                                'text-[11px] font-bold',
                                meta.isWeekend
                                  ? isOpen
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                    : 'bg-muted text-muted-foreground/50'
                                  : isOpen
                                  ? 'bg-primary/10 text-primary'
                                  : 'bg-muted text-muted-foreground/50',
                              )}
                            >
                              {meta.short.slice(0, 2)}
                            </span>
                            <div className="min-w-0">
                              <span
                                className={cn(
                                  'block text-sm font-medium truncate',
                                  isOpen ? 'text-foreground' : 'text-muted-foreground/60',
                                )}
                              >
                                {meta.label}
                              </span>
                              {meta.isWeekend && (
                                <span className="text-[10px] text-muted-foreground/40">
                                  weekend
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Col 2 + 3 — time inputs OR "Rest day" spanning both */}
                          {isOpen ? (
                            <>
                              <input
                                type="time"
                                value={day.openTime}
                                onChange={(e) =>
                                  updateDay(day.dayOfWeek, { openTime: e.target.value })
                                }
                                className={cn(
                                  'w-full min-w-0 rounded-lg border border-input bg-background',
                                  'px-3 py-2 text-sm font-mono text-foreground',
                                  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                                  'hover:border-ring/50 transition-colors cursor-pointer',
                                )}
                              />
                              <input
                                type="time"
                                value={day.closeTime}
                                onChange={(e) =>
                                  updateDay(day.dayOfWeek, { closeTime: e.target.value })
                                }
                                className={cn(
                                  'w-full min-w-0 rounded-lg border border-input bg-background',
                                  'px-3 py-2 text-sm font-mono text-foreground',
                                  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                                  'hover:border-ring/50 transition-colors cursor-pointer',
                                )}
                              />
                            </>
                          ) : (
                            <div className="col-span-2 flex items-center pl-1">
                              <span className="text-sm text-muted-foreground/50 font-medium italic">
                                Rest day — closed
                              </span>
                            </div>
                          )}

                          {/* Col 4 — toggle */}
                          <div className="flex items-center justify-center">
                            <Switch
                              checked={isOpen}
                              onCheckedChange={(v) =>
                                updateDay(day.dayOfWeek, { isClosed: !v })
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {scheduleError && (
                    <div ref={scheduleErrorRef} className="mt-4">
                      <InlineError
                        message={scheduleError}
                        onDismiss={() => setScheduleError(null)}
                      />
                    </div>
                  )}
                </div>
              </div>

              <TabFooter>
                <Button onClick={saveSchedule} disabled={isSavingSchedule}>
                  {isSavingSchedule && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {isSavingSchedule ? 'Saving…' : 'Save Schedule'}
                </Button>
              </TabFooter>
            </TabsContent>
          )}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function Field({
  label,
  icon,
  hint,
  error,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-sm">
        {icon}
        {label}
      </Label>
      {children}
      {hint  && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function TabFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 border-t bg-muted/30 px-6 py-3 flex justify-end">
      {children}
    </div>
  );
}

function InlineError({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <Alert variant="destructive" className="py-3">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between gap-3">
        <span>{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs underline underline-offset-2 opacity-70 hover:opacity-100"
        >
          Dismiss
        </button>
      </AlertDescription>
    </Alert>
  );
}
