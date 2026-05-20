'use client';

import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form } from '@/components/ui/form';
import { PhoneInput } from '@/components/ui/phone-input';
import { LocationPicker } from '@/components/ui/location-picker';
import { CountryCityPicker } from '@/components/ui/country-city-picker';
import {
  WorkingHoursEditor,
  buildScheduleFromHours,
  type DaySchedule,
} from '@/components/account/working-hours';
import { dentistProfileService, extractApiErrorMessage } from '@/lib/api';
import { userKeys } from '@/lib/hooks/use-users';
import { workingHoursKeys } from '@/lib/hooks/use-working-hours';
import {
  onboardingClinicSchema,
  type OnboardingClinicFormData,
} from '@/lib/schemas';
import type {
  DentistProfile,
  SetupClinicDto,
  WorkingHours,
} from '@/lib/types';

interface Props {
  profile: DentistProfile | null;
  workingHours: WorkingHours[];
  onSaved: () => void;
}

/**
 * Single form that collects every piece of clinic data and the entire
 * weekly schedule, then submits the whole thing to `POST /dentist-profile/setup`
 * in one atomic call. Replaces the previous "save clinic, then save schedule,
 * then maybe click Continue" dance that left the gate flags out of sync.
 */
export function OnboardingClinicForm({ profile, workingHours, onSaved }: Props) {
  const queryClient = useQueryClient();

  const defaultSchedule = useMemo<DaySchedule[]>(
    () => buildScheduleFromHours(workingHours ?? null),
    [workingHours],
  );

  const form = useForm<OnboardingClinicFormData>({
    resolver: zodResolver(onboardingClinicSchema),
    mode: 'onBlur',
    defaultValues: {
      clinicName: '',
      clinicAddress: '',
      clinicPhone: '',
      city: '',
      country: '',
      latitude: 0,
      longitude: 0,
      description: '',
      workingHours: defaultSchedule,
    },
  });

  // Hydrate the form once the parent has the profile / hours data.
  useEffect(() => {
    form.reset({
      clinicName: profile?.clinicName ?? '',
      clinicAddress: profile?.clinicAddress ?? '',
      clinicPhone: profile?.clinicPhone ?? '',
      city: profile?.city ?? '',
      country: profile?.country ?? '',
      latitude: profile?.latitude ?? 0,
      longitude: profile?.longitude ?? 0,
      description: profile?.description ?? '',
      workingHours: defaultSchedule,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, defaultSchedule]);

  const mutation = useMutation<DentistProfile, Error, SetupClinicDto>({
    mutationFn: dentistProfileService.setupClinic,
    onSuccess: () => {
      // The two query trees that drive `clinicComplete` / `scheduleComplete`:
      void queryClient.invalidateQueries({ queryKey: userKeys.currentUser() });
      void queryClient.invalidateQueries({ queryKey: workingHoursKeys.all });
      toast.success('Clinic setup saved.');
      onSaved();
    },
    onError: (error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    const payload: SetupClinicDto = {
      clinicName: values.clinicName.trim(),
      clinicAddress: values.clinicAddress.trim(),
      clinicPhone: values.clinicPhone.trim(),
      city: values.city.trim(),
      country: values.country.trim(),
      latitude: values.latitude,
      longitude: values.longitude,
      description: values.description?.trim() || undefined,
      workingHours: values.workingHours.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        openTime: d.openTime,
        closeTime: d.closeTime,
        isClosed: d.isClosed,
      })),
    };
    mutation.mutate(payload);
  });

  const errors = form.formState.errors;
  const lat = form.watch('latitude');
  const lng = form.watch('longitude');
  const country = form.watch('country');
  const city = form.watch('city');
  const clinicAddress = form.watch('clinicAddress');

  const locationValue =
    Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
      ? { lat: lat as number, lng: lng as number, address: clinicAddress, city, country }
      : null;

  return (
    <Form onSubmit={onSubmit} className="space-y-8">
      {/* ─── Location FIRST ──────────────────────────────────────────────
          We render the map BEFORE the address fields on purpose: the
          most natural way to set a clinic location is to drop a pin (or
          tap "Use My Location") and let reverse-geocoding fill in the
          address, city, and country. The text fields below then act as
          a verification + edit surface, not an entry surface. */}
      <section className="space-y-3">
        <header>
          <h2 className="text-base font-semibold">Map location</h2>
          <p className="text-sm text-muted-foreground">
            Drop a pin on the map (or tap "Use My Location") — we&apos;ll
            auto-fill the address, city, and country below.
          </p>
        </header>
        <LocationPicker
          value={locationValue}
          onChange={({ lat, lng, address, city: c, country: co }) => {
            form.setValue('latitude', lat, {
              shouldValidate: true,
              shouldDirty: true,
            });
            form.setValue('longitude', lng, {
              shouldValidate: true,
              shouldDirty: true,
            });
            if (address) {
              form.setValue('clinicAddress', address, {
                shouldValidate: true,
                shouldDirty: true,
              });
            }
            if (c)
              form.setValue('city', c, {
                shouldValidate: true,
                shouldDirty: true,
              });
            if (co)
              form.setValue('country', co, {
                shouldValidate: true,
                shouldDirty: true,
              });
          }}
        />
        {(errors.latitude || errors.longitude) && (
          <p className="text-sm text-destructive">
            {errors.latitude?.message ?? errors.longitude?.message}
          </p>
        )}
      </section>

      {/* ─── Clinic details (auto-filled from map, editable) ────────────── */}
      <section className="space-y-4">
        <header>
          <h2 className="text-base font-semibold">Clinic details</h2>
          <p className="text-sm text-muted-foreground">
            Information patients will see when they look up your clinic.
            Address, city, and country are pre-filled from the map above —
            edit them if anything needs to be more precise.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="clinicName">
              Clinic name
            </label>
            <Input
              id="clinicName"
              placeholder="Bright Smiles Dental Clinic"
              {...form.register('clinicName')}
              aria-invalid={!!errors.clinicName}
            />
            {errors.clinicName && (
              <p className="text-sm text-destructive">
                {errors.clinicName.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="clinicPhone">
              Clinic phone
            </label>
            <Controller
              name="clinicPhone"
              control={form.control}
              render={({ field }) => (
                <PhoneInput
                  id="clinicPhone"
                  name={field.name}
                  value={field.value}
                  defaultCountry="TN"
                  onBlur={field.onBlur}
                  onChange={(next) => field.onChange(next.phone)}
                  placeholder="+216 71 000 000"
                  isInvalid={!!errors.clinicPhone}
                />
              )}
            />
            {errors.clinicPhone && (
              <p className="text-sm text-destructive">
                {errors.clinicPhone.message}
              </p>
            )}
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium" htmlFor="clinicAddress">
              Clinic address
            </label>
            <Input
              id="clinicAddress"
              placeholder="123 Main Street, suite 4"
              {...form.register('clinicAddress')}
              aria-invalid={!!errors.clinicAddress}
            />
            {errors.clinicAddress && (
              <p className="text-sm text-destructive">
                {errors.clinicAddress.message}
              </p>
            )}
          </div>

          <div className="md:col-span-2">
            <CountryCityPicker
              value={{ country, city }}
              onChange={(next) => {
                form.setValue('country', next.country, {
                  shouldValidate: true,
                  shouldDirty: true,
                });
                form.setValue('city', next.city, {
                  shouldValidate: true,
                  shouldDirty: true,
                });
              }}
              defaultCountryCode="TN"
              invalid={{
                country: !!errors.country,
                city: !!errors.city,
              }}
            />
            {(errors.country || errors.city) && (
              <p className="mt-1 text-sm text-destructive">
                {errors.country?.message ?? errors.city?.message}
              </p>
            )}
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium" htmlFor="description">
              Short description{' '}
              <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="description"
              placeholder="A few words patients will see in your profile"
              {...form.register('description')}
            />
          </div>
        </div>
      </section>

      {/* ─── Working hours ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <header>
          <h2 className="text-base font-semibold">Working hours</h2>
          <p className="text-sm text-muted-foreground">
            Toggle each day on or off. At least one open day is required.
          </p>
        </header>
        <Controller
          name="workingHours"
          control={form.control}
          render={({ field }) => (
            <WorkingHoursEditor
              schedule={field.value}
              onChange={(next) => field.onChange(next)}
              disabled={mutation.isPending}
            />
          )}
        />
        {errors.workingHours && !Array.isArray(errors.workingHours) && (
          <p className="text-sm text-destructive">
            {errors.workingHours.message as string}
          </p>
        )}
      </section>

      {/* ─── Submit ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="submit"
          size="lg"
          disabled={mutation.isPending}
          className="gap-2"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              Save & continue
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </Form>
  );
}
