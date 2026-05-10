'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { LocationPicker } from '@/components/ui/location-picker';
import { clinicSettingsSchema, type ClinicSettingsFormData } from '@/lib/schemas';
import { type DentistProfile, type UpdateDentistProfileDto } from '@/lib/types';
import { useCreateDentistProfile, useUpdateClinicProfile } from '@/lib/hooks';
import { ScheduleForm } from '@/components/account/schedule-form';
import { userKeys } from '@/lib/hooks/use-users';

const normalizeOptional = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export function ClinicForm({ profile }: { profile: DentistProfile | null }) {
  const queryClient = useQueryClient();
  const { mutateAsync: createProfile, isPending: isCreating } = useCreateDentistProfile();
  const { mutateAsync: updateProfile, isPending: isUpdating } = useUpdateClinicProfile();

  const [createdProfileId, setCreatedProfileId] = useState<string | null>(null);

  const form = useForm<ClinicSettingsFormData>({
    resolver: zodResolver(clinicSettingsSchema),
    defaultValues: {
      clinicName: '',
      clinicAddress: '',
      clinicPhone: '',
      city: '',
      country: '',
      latitude: undefined,
      longitude: undefined,
      description: '',
    },
  });

  useEffect(() => {
    if (!profile) return;
    form.reset({
      clinicName: profile.clinicName ?? '',
      clinicAddress: profile.clinicAddress ?? '',
      clinicPhone: profile.clinicPhone ?? '',
      city: profile.city ?? '',
      country: profile.country ?? '',
      latitude: profile.latitude ?? undefined,
      longitude: profile.longitude ?? undefined,
      description: profile.description ?? '',
    });
  }, [profile, form]);

  const isSubmitting = isCreating || isUpdating;
  const hasChanges = form.formState.isDirty;
  const activeProfileId = profile?.id ?? createdProfileId;

  const clinicLat = form.watch('latitude');
  const clinicLng = form.watch('longitude');
  const locationValue =
    clinicLat != null && clinicLng != null && !(clinicLat === 0 && clinicLng === 0)
      ? {
          lat: clinicLat,
          lng: clinicLng,
          address: form.watch('clinicAddress'),
          city: form.watch('city'),
          country: form.watch('country'),
        }
      : null;

  const onSubmit = form.handleSubmit(async (values) => {
    const payload: UpdateDentistProfileDto = {
      clinicName: values.clinicName,
      clinicAddress: normalizeOptional(values.clinicAddress),
      clinicPhone: normalizeOptional(values.clinicPhone),
      city: normalizeOptional(values.city),
      country: normalizeOptional(values.country),
      latitude: values.latitude,
      longitude: values.longitude,
      description: normalizeOptional(values.description),
    };

    if (!activeProfileId) {
      const created = await createProfile({
        clinicName: values.clinicName,
        clinicAddress: normalizeOptional(values.clinicAddress),
        clinicPhone: normalizeOptional(values.clinicPhone),
        city: normalizeOptional(values.city),
        country: normalizeOptional(values.country),
        latitude: values.latitude,
        longitude: values.longitude,
        description: normalizeOptional(values.description),
      });
      setCreatedProfileId(created.id);
      queryClient.invalidateQueries({ queryKey: userKeys.currentUser() });
      toast.success('Clinic profile created.');
    } else {
      await updateProfile({ id: activeProfileId, data: payload });
    }

    form.reset({
      clinicName: values.clinicName,
      clinicAddress: values.clinicAddress,
      clinicPhone: values.clinicPhone,
      city: values.city,
      country: values.country,
      latitude: values.latitude,
      longitude: values.longitude,
      description: values.description,
    });
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Clinic</h2>
          <p className="text-sm text-muted-foreground">
            Manage your clinic profile details.
          </p>
        </CardHeader>
        <CardContent>
          <Form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="clinicName">
                  Clinic name
                </label>
                <Input id="clinicName" {...form.register('clinicName')} />
                {form.formState.errors.clinicName && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.clinicName.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="clinicPhone">
                  Phone
                </label>
                <Controller
                  name="clinicPhone"
                  control={form.control}
                  render={({ field }) => (
                    <PhoneInput
                      id="clinicPhone"
                      name={field.name}
                      value={field.value}
                      country="TN"
                      defaultCountry="TN"
                      onBlur={field.onBlur}
                      onChange={(next) => {
                        field.onChange(next.phone);
                      }}
                      placeholder="+216 71 000 000"
                      isInvalid={!!form.formState.errors.clinicPhone}
                    />
                  )}
                />
                {form.formState.errors.clinicPhone && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.clinicPhone.message}
                  </p>
                )}
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="clinicAddress">
                  Address
                </label>
                <Input id="clinicAddress" {...form.register('clinicAddress')} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="city">
                  City
                </label>
                <Input id="city" {...form.register('city')} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="country">
                  Country
                </label>
                <Input id="country" {...form.register('country')} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Location</label>
                <LocationPicker
                  value={locationValue}
                  onChange={({ lat, lng, address, city, country }) => {
                    form.setValue('latitude', lat, { shouldDirty: true, shouldValidate: true });
                    form.setValue('longitude', lng, { shouldDirty: true, shouldValidate: true });
                    if (address) {
                      form.setValue('clinicAddress', address, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }
                    if (city) {
                      form.setValue('city', city, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }
                    if (country) {
                      form.setValue('country', country, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }
                  }}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="description">
                  Description
                </label>
                <Input id="description" {...form.register('description')} />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={!hasChanges || isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save clinic details'}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>

      <ScheduleForm profileId={activeProfileId} />
    </div>
  );
}
