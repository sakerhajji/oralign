'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { accountProfileSchema, type AccountProfileFormData } from '@/lib/schemas';
import { type UpdateUserDto, type User } from '@/lib/types';
import { useUpdateProfile } from '@/lib/hooks';
import { usersService, extractApiErrorMessage } from '@/lib/api';
import { getAvatarUrl } from '@/lib/utils';
import { useAuth } from '@/lib/providers';
import { userKeys } from '@/lib/hooks/use-users';

const normalizeOptional = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

interface ProfileFormProps {
  user: User;
  /** When true the submit button reads "Save & Continue" */
  onboarding?: boolean;
  /** Called after a successful save so the parent can navigate to the next step */
  onSaved?: () => void;
}

export function ProfileForm({ user, onboarding = false, onSaved }: ProfileFormProps) {
  const queryClient = useQueryClient();
  const { login } = useAuth();
  const { mutateAsync: updateProfile, isPending } = useUpdateProfile({
    successMessage: 'Profile updated successfully.',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Avatar state — uploaded eagerly the moment the user picks a file.
  // We deliberately do NOT couple it to the rest of the form's submit
  // anymore: the previous "pick then save" UX gave users no feedback if
  // they forgot to click Save, leading to the persistent "I uploaded but
  // nothing changed" reports. With upload-on-pick the avatar is committed
  // to the backend the instant a file is chosen, the preview shows the
  // real backend URL (not a transient data: URL), and the Save button
  // only handles the text fields. `avatarFile` is no longer needed.
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const form = useForm<AccountProfileFormData>({
    resolver: zodResolver(accountProfileSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      country: '',
    },
  });

  useEffect(() => {
    form.reset({
      fullName: user.fullName,
      email: user.email,
      phone: user.phone ?? '',
      country: user.country ?? '',
    });
    setAvatarPreview(getAvatarUrl(user.avatarUrl));
  }, [user, form]);

  /**
   * File-picker handler — uploads the avatar IMMEDIATELY and updates the
   * preview to the new backend URL on success. No staging, no waiting
   * for the Save button. This is the simplest UX that's hard to get
   * wrong: pick → spinner → toast → preview updates → sidebar updates.
   *
   * Errors are surfaced via toast and leave the previous preview
   * untouched, so the user can retry without losing context.
   */
  const handleAvatarSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    // Always clear the input's value so picking the SAME file twice still
    // fires onChange (browsers suppress onChange when value is unchanged).
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Avatar must be 5MB or smaller.');
      return;
    }

    setIsUploadingAvatar(true);
    // Optimistic preview while the upload is in flight — a data: URL
    // off the picked file. Replaced by the real backend URL on success,
    // reverted to the previous user.avatarUrl on failure.
    const previousPreview = avatarPreview;
    try {
      const reader = new FileReader();
      const optimistic: string = await new Promise((resolve, reject) => {
        reader.onload = (e) => resolve((e.target?.result as string) ?? '');
        reader.onerror = () =>
          reject(new Error('Could not read the selected image.'));
        reader.readAsDataURL(file);
      });
      setAvatarPreview(optimistic);

      const updated = await usersService.uploadAvatar(user.id, file);
      // Replace the data: URL with the real backend URL (cache-busts on
      // the new uuid filename, so no need for a ?t= query string).
      setAvatarPreview(getAvatarUrl(updated.avatarUrl));
      login(updated);
      queryClient.invalidateQueries({ queryKey: userKeys.currentUser() });
      toast.success('Avatar updated.');
    } catch (err) {
      setAvatarPreview(previousPreview);
      toast.error(extractApiErrorMessage(err));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const countryValue = form.watch('country');
  const isSubmitting = isPending;
  const hasChanges = form.formState.isDirty;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const trimmedPhone = normalizeOptional(values.phone);
      const trimmedCountry = normalizeOptional(values.country);
      const updateData: UpdateUserDto = {
        fullName: values.fullName,
      };

      if (trimmedPhone) {
        updateData.phone = trimmedPhone;
      } else {
        updateData.phone = undefined;
      }
      if (trimmedCountry) {
        updateData.country = trimmedCountry;
      } else {
        updateData.country = undefined;
      }

      const hasProfileDataChanges =
        values.fullName !== user.fullName ||
        trimmedPhone !== (user.phone ?? undefined) ||
        trimmedCountry !== (user.country ?? undefined);

      let updatedUser = user;
      if (hasProfileDataChanges) {
        updatedUser = await updateProfile({ id: user.id, data: updateData });
      }

      form.reset({
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        phone: updatedUser.phone ?? '',
        country: updatedUser.country ?? '',
      });

      // Let the parent page navigate to the next onboarding step
      onSaved?.();
    } catch {
      // toast already raised by useUpdateProfile.onError
    }
  });

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="text-sm text-muted-foreground">
          Update your personal information and avatar.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative">
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
            {/* Spinner overlay while uploading — gives the user a clear
                signal that the upload is in flight. */}
            {isUploadingAvatar && (
              <div
                className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70 backdrop-blur-[1px]"
                aria-hidden
              >
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <div>
              <p className="text-sm font-medium">Profile photo</p>
              <p className="text-xs text-muted-foreground">
                Pick a square image (max 5 MB). It uploads as soon as you
                choose the file — no separate save step.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar || isSubmitting}
              >
                {isUploadingAvatar ? 'Uploading…' : 'Upload avatar'}
              </Button>
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

        <Form onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="fullName">
                Full name
              </label>
              <Input id="fullName" {...form.register('fullName')} />
              {form.formState.errors.fullName && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.fullName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">
                Email
              </label>
              <Input id="email" {...form.register('email')} disabled />
              <p className="text-xs text-muted-foreground">
                Email updates are managed by support.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="phone">
                Phone
              </label>
              <Controller
                name="phone"
                control={form.control}
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
                      form.setValue('country', next.country, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }}
                    placeholder="+216 71 000 000"
                    isInvalid={!!form.formState.errors.phone}
                  />
                )}
              />
              {(form.formState.errors.phone || form.formState.errors.country) && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.phone?.message ??
                    form.formState.errors.country?.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="country">
                Country (ISO code)
              </label>
              <Input id="country" placeholder="TN" {...form.register('country')} />
              {form.formState.errors.country && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.country.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={!hasChanges || isSubmitting}>
              {isSubmitting
                ? 'Saving...'
                : onboarding
                  ? 'Save & Continue'
                  : 'Save changes'}
            </Button>
          </div>
        </Form>
      </CardContent>
    </Card>
  );
}
