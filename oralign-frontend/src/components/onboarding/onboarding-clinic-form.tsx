'use client';

import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { type OnboardingClinicFormData } from '@/lib/schemas';
import { DayOfWeek } from '@/lib/types';
import { useT } from '@/lib/i18n/lang-context';
import type {
  DentistProfile,
  SetupClinicDto,
  WorkingHours,
} from '@/lib/types';

const HHMM = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

// Validation messages are user-facing, so the onboarding clinic schema
// is a factory taking the translator — instantiated inside the
// component via useMemo (keyed on `t`, which changes per language).
type Translate = (path: string, vars?: Record<string, string | number>) => string;

const makeOnboardingClinicSchema = (t: Translate) =>
  z
    .object({
      clinicName: z.string().min(2, t('onboardingPages.clinicForm.vClinicNameRequired')),
      clinicAddress: z.string().min(2, t('onboardingPages.clinicForm.vClinicAddressRequired')),
      clinicPhone: z
        .string()
        .regex(/^\+[1-9]\d{6,14}$/, t('onboardingPages.clinicForm.vClinicPhoneFormat')),
      city: z.string().min(1, t('onboardingPages.clinicForm.vCityRequired')),
      country: z.string().min(1, t('onboardingPages.clinicForm.vCountryRequired')),
      latitude: z
        .number({ message: t('onboardingPages.clinicForm.vPickLocation') })
        .gt(-90, t('onboardingPages.clinicForm.vPickLocation'))
        .lt(90, t('onboardingPages.clinicForm.vPickLocation'))
        .refine((v) => v !== 0, t('onboardingPages.clinicForm.vPickLocation')),
      longitude: z
        .number({ message: t('onboardingPages.clinicForm.vPickLocation') })
        .gt(-180, t('onboardingPages.clinicForm.vPickLocation'))
        .lt(180, t('onboardingPages.clinicForm.vPickLocation'))
        .refine((v) => v !== 0, t('onboardingPages.clinicForm.vPickLocation')),
      description: z.string().optional(),
      workingHours: z
        .array(
          z.object({
            dayOfWeek: z.nativeEnum(DayOfWeek),
            openTime: z.string().regex(HHMM, t('onboardingPages.clinicForm.vTimeFormat')),
            closeTime: z.string().regex(HHMM, t('onboardingPages.clinicForm.vTimeFormat')),
            isClosed: z.boolean(),
          }),
        )
        .min(1, t('onboardingPages.clinicForm.vSetAtLeastOneDay')),
    })
    .refine((data) => data.workingHours.some((d) => !d.isClosed), {
      message: t('onboardingPages.clinicForm.vOneOpenDay'),
      path: ['workingHours'],
    })
    .refine(
      (data) =>
        data.workingHours.every((d) => d.isClosed || d.openTime < d.closeTime),
      {
        message: t('onboardingPages.clinicForm.vOpenBeforeClose'),
        path: ['workingHours'],
      },
    );

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
  const { t } = useT();
  const queryClient = useQueryClient();

  const defaultSchedule = useMemo<DaySchedule[]>(
    () => buildScheduleFromHours(workingHours ?? null),
    [workingHours],
  );

  const onboardingClinicSchema = useMemo(
    () => makeOnboardingClinicSchema(t),
    [t],
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
      toast.success(t('onboardingPages.clinicForm.savedToast'));
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
          <h2 className="text-base font-semibold">{t('onboardingPages.clinicForm.mapSectionTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('onboardingPages.clinicForm.mapSectionDesc')}
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
          <h2 className="text-base font-semibold">{t('onboardingPages.clinicForm.detailsSectionTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('onboardingPages.clinicForm.detailsSectionDesc')}
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="clinicName">
              {t('onboardingPages.clinicForm.clinicNameLabel')}
            </label>
            <Input
              id="clinicName"
              placeholder={t('onboardingPages.clinicForm.clinicNamePlaceholder')}
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
              {t('onboardingPages.clinicForm.clinicPhoneLabel')}
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
              {t('onboardingPages.clinicForm.clinicAddressLabel')}
            </label>
            <Input
              id="clinicAddress"
              placeholder={t('onboardingPages.clinicForm.clinicAddressPlaceholder')}
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
              {t('onboardingPages.clinicForm.descriptionLabel')}{' '}
              <span className="text-muted-foreground">{t('onboardingPages.clinicForm.descriptionOptional')}</span>
            </label>
            <Input
              id="description"
              placeholder={t('onboardingPages.clinicForm.descriptionPlaceholder')}
              {...form.register('description')}
            />
          </div>
        </div>
      </section>

      {/* ─── Working hours ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <header>
          <h2 className="text-base font-semibold">{t('onboardingPages.clinicForm.hoursSectionTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('onboardingPages.clinicForm.hoursSectionDesc')}
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
              {t('onboardingPages.clinicForm.submitting')}
            </>
          ) : (
            <>
              {t('onboardingPages.clinicForm.submit')}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </Form>
  );
}
