'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { accountProfileSchema, type AccountProfileFormData } from '@/lib/schemas';
import { type UpdateUserDto, type User } from '@/lib/types';
import { useUpdateProfile } from '@/lib/hooks';
import { usersService } from '@/lib/api';
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

  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
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
    setAvatarFile(null);
  }, [user, form]);

  const handleAvatarSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
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
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setAvatarPreview(e.target?.result as string);
    };
    reader.onerror = () => {
      toast.error('Could not read the selected image.');
    };
    reader.readAsDataURL(file);
  };

  const countryValue = form.watch('country');
  const isSubmitting = isPending || isUploadingAvatar;
  const hasChanges = form.formState.isDirty || !!avatarFile;

  const onSubmit = form.handleSubmit(async (values) => {
    setIsUploadingAvatar(true);
    try {
      let updatedUser = user;

      // Upload the avatar first if one is staged. We do this BEFORE the
      // profile-data update so a failed upload aborts before the form
      // shows a misleading "Profile updated" toast for the text fields.
      // Errors are re-thrown so the outer try/finally still resets the
      // submitting flag.
      if (avatarFile) {
        try {
          updatedUser = await usersService.uploadAvatar(user.id, avatarFile);
          login(updatedUser);
          queryClient.invalidateQueries({ queryKey: userKeys.currentUser() });
        } catch (err) {
          const message =
            err instanceof Error && err.message
              ? err.message
              : 'Failed to upload avatar.';
          toast.error(message);
          throw err;
        }
      }

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

      if (hasProfileDataChanges) {
        updatedUser = await updateProfile({ id: user.id, data: updateData });
      } else if (avatarFile) {
        toast.success('Avatar updated.');
      }

      form.reset({
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        phone: updatedUser.phone ?? '',
        country: updatedUser.country ?? '',
      });
      setAvatarFile(null);
      setAvatarPreview(getAvatarUrl(updatedUser.avatarUrl));

      // Let the parent page navigate to the next onboarding step
      onSaved?.();
    } catch {
      // Toast already surfaced inside the inner catch / by the mutation
      // hook's onError. We swallow here so the user can fix whichever
      // step failed and retry without a second uncaught-error toast.
    } finally {
      setIsUploadingAvatar(false);
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
                disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
