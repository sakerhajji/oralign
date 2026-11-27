'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { PhoneInput } from '@/components/ui/phone-input';
import { LocationPicker } from '@/components/ui/location-picker';
import { clinicSettingsSchema, type ClinicSettingsFormData } from '@/lib/schemas';
import { type DentistProfile } from '@/lib/types';
import type { CreateClinicProfileBody } from '@/lib/api/dentist-profile.service';
import { useCreateDentistProfile, useUpdateClinicProfile } from '@/lib/hooks';
import { ScheduleForm } from '@/components/account/schedule-form';
import { RegistrationNumberField } from '@/components/account/registration-number-field';
import { useT } from '@/lib/i18n/lang-context';
import {
  REGISTRATION_NUMBER_MAX_LENGTH,
  registrationNumberInput,
  registrationNumberPayload,
} from '@/lib/doctor/registration-number';
import { registrationNumberField } from '@/lib/doctor/registration-number-schema';
import { optionalTextPayload } from '@/lib/doctor/clinic-payload';
import { gateRequiredPhone, gateRequiredText } from '@/lib/doctor/clinic-gate-schema';

/** The clinic settings plus the private registration number (spec §6). */
type ClinicFormValues = ClinicSettingsFormData & { registrationNumber?: string };

export function ClinicForm({ profile }: { profile: DentistProfile | null }) {
  const { t } = useT();
  const { mutateAsync: createProfile, isPending: isCreating } = useCreateDentistProfile();
  const { mutateAsync: updateProfile, isPending: isUpdating } = useUpdateClinicProfile();

  const [createdProfileId, setCreatedProfileId] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      clinicSettingsSchema.extend({
        // Required by the onboarding gate: a blank here would send the
        // doctor back to /onboarding/clinic (clinic-gate-schema.ts).
        clinicAddress: gateRequiredText(t('onboardingPages.clinicForm.vClinicAddressRequired'), 2),
        clinicPhone: gateRequiredPhone(t('onboardingPages.clinicForm.vClinicPhoneFormat')),
        city: gateRequiredText(t('onboardingPages.clinicForm.vCityRequired')),
        country: gateRequiredText(t('onboardingPages.clinicForm.vCountryRequired')),
        registrationNumber: registrationNumberField(
          t('doctorIdentity.registrationNumber.tooLong', { max: REGISTRATION_NUMBER_MAX_LENGTH }),
        ),
      }),
    [t],
  );

  const form = useForm<ClinicFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clinicName: '',
      clinicAddress: '',
      clinicPhone: '',
      city: '',
      country: '',
      latitude: undefined,
      longitude: undefined,
      description: '',
      taxId: '',
      registrationNumber: '',
      specialty: '',
      isListedPublicly: true,
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
      taxId: profile.taxId ?? '',
      registrationNumber: registrationNumberInput(profile.registrationNumber),
      specialty: profile.specialty ?? '',
      isListedPublicly: profile.isListedPublicly ?? true,
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
    // A field the doctor emptied is sent as null so the server clears it;
    // a blank with nothing stored is left out (lib/doctor/clinic-payload).
    const body: CreateClinicProfileBody = {
      clinicName: values.clinicName,
      clinicAddress: optionalTextPayload(values.clinicAddress, profile?.clinicAddress),
      clinicPhone: optionalTextPayload(values.clinicPhone, profile?.clinicPhone),
      city: optionalTextPayload(values.city, profile?.city),
      country: optionalTextPayload(values.country, profile?.country),
      latitude: values.latitude,
      longitude: values.longitude,
      description: optionalTextPayload(values.description, profile?.description),
      taxId: optionalTextPayload(values.taxId, profile?.taxId),
      // null clears a number the doctor removed (undefined would keep it).
      registrationNumber: registrationNumberPayload(values.registrationNumber),
      specialty: optionalTextPayload(values.specialty, profile?.specialty),
      isListedPublicly: values.isListedPublicly,
    };

    if (!activeProfileId) {
      const created = await createProfile(body);
      // The hook refreshed the current user (and every doctor-identity query).
      setCreatedProfileId(created.id);
      toast.success(t('accountClinic.toastClinicCreated'));
    } else {
      await updateProfile({ id: activeProfileId, data: body });
    }

    form.reset(values);
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t('accountClinic.cardTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('accountClinic.cardSubtitle')}
          </p>
        </CardHeader>
        <CardContent>
          <Form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="clinicName">
                  {t('accountClinic.clinicNameLabel')}
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
                  {t('accountClinic.phoneLabel')}
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
                {form.formState.errors.clinicPhone ? (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.clinicPhone.message}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t('doctorIdentity.contact.clinicPhoneHint')}
                  </p>
                )}
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="clinicAddress">
                  {t('accountClinic.addressLabel')}
                </label>
                <Input
                  id="clinicAddress"
                  aria-invalid={!!form.formState.errors.clinicAddress}
                  {...form.register('clinicAddress')}
                />
                {form.formState.errors.clinicAddress && (
                  <p className="text-sm text-destructive">{form.formState.errors.clinicAddress.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="city">
                  {t('accountClinic.cityLabel')}
                </label>
                <Input
                  id="city"
                  aria-invalid={!!form.formState.errors.city}
                  {...form.register('city')}
                />
                {form.formState.errors.city && (
                  <p className="text-sm text-destructive">{form.formState.errors.city.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="country">
                  {t('accountClinic.countryLabel')}
                </label>
                <Input
                  id="country"
                  aria-invalid={!!form.formState.errors.country}
                  {...form.register('country')}
                />
                {form.formState.errors.country && (
                  <p className="text-sm text-destructive">{form.formState.errors.country.message}</p>
                )}
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">{t('accountClinic.locationLabel')}</label>
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
                  {t('accountClinic.descriptionLabel')}
                </label>
                <Input id="description" {...form.register('description')} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="taxId">
                  {t('accountClinic.taxIdLabel')}
                </label>
                <Input
                  id="taxId"
                  placeholder={t('accountClinic.taxIdPlaceholder')}
                  {...form.register('taxId')}
                  aria-invalid={!!form.formState.errors.taxId}
                />
                {form.formState.errors.taxId ? (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.taxId.message}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t('accountClinic.taxIdHelp')}
                  </p>
                )}
              </div>

              <RegistrationNumberField
                className="md:col-span-2"
                registration={form.register('registrationNumber')}
                error={form.formState.errors.registrationNumber?.message}
              />

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="specialty">
                  {t('accountClinic.specialtyLabel')}
                </label>
                <Input
                  id="specialty"
                  placeholder={t('accountClinic.specialtyPlaceholder')}
                  {...form.register('specialty')}
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border p-4 md:col-span-2">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium" htmlFor="isListedPublicly">
                    {t('accountClinic.publicListingLabel')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t('accountClinic.publicListingHelp')}
                  </p>
                </div>
                <Controller
                  name="isListedPublicly"
                  control={form.control}
                  render={({ field }) => (
                    <Switch
                      id="isListedPublicly"
                      checked={field.value ?? true}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                className="pointer-coarse:h-12"
                disabled={!hasChanges || isSubmitting}
              >
                {isSubmitting ? t('accountClinic.saving') : t('accountClinic.saveClinicDetails')}
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>

      <ScheduleForm profileId={activeProfileId} />
    </div>
  );
}
