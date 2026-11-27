'use client';

import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { useAuth } from '@/lib/providers';
import { useT } from '@/lib/i18n/lang-context';
import { extractApiErrorMessage, usersService, dentistProfileService } from '@/lib/api';
import type { UpdateClinicProfileBody } from '@/lib/api/dentist-profile.service';
import { invalidateDoctorIdentityQueries } from '@/lib/hooks/use-dentist-profiles';
import { useCurrentUser } from '@/lib/hooks/use-users';
import { useWorkingHoursByProfile } from '@/lib/hooks/use-working-hours';
import { UpdateUserDto, DentistProfile, User, UserRole } from '@/lib/types';

export function useAccountData() {
  // Same React Query entry AuthProvider reads (`userKeys.currentUser()`),
  // so no sync-back into the provider is needed: one cache, one user.
  const userQuery = useCurrentUser();
  const profileId = userQuery.data?.dentistProfile?.id ?? '';
  const isDentist = userQuery.data?.role === UserRole.DENTIST;
  // Working-hours reads are dentist/admin only: an account whose role changed
  // away from dentist keeps its profile, and must not hit a 403 here.
  const workingHoursQuery = useWorkingHoursByProfile(isDentist ? profileId : '');

  const isLoading = userQuery.isLoading || (isDentist && workingHoursQuery.isLoading);
  const error = userQuery.error ?? workingHoursQuery.error ?? null;

  return useMemo(
    () => ({
      user: userQuery.data,
      dentistProfile: userQuery.data?.dentistProfile ?? null,
      workingHours: workingHoursQuery.data ?? [],
      isDentist,
      isLoading,
      error,
      refetchUser: userQuery.refetch,
      refetchWorkingHours: workingHoursQuery.refetch,
    }),
    [
      userQuery.data,
      userQuery.refetch,
      workingHoursQuery.data,
      workingHoursQuery.refetch,
      isDentist,
      isLoading,
      error,
    ],
  );
}

export function useUpdateProfile(options?: { successMessage?: string }) {
  const queryClient = useQueryClient();
  const { login } = useAuth();
  const { t } = useT();

  return useMutation<User, Error, { id: string; data: UpdateUserDto }>({
    mutationFn: ({ id, data }) => usersService.updateUser(id, data),
    onSuccess: (data) => {
      login(data);
      // The name, phone and photo show on orders, patients, payments,
      // quotes, dashboards…: refresh every one of them, the current user
      // included (spec §6, no stale copy for the staleTime).
      void invalidateDoctorIdentityQueries(queryClient);
      toast.success(options?.successMessage ?? t('toasts.account.profileUpdated'));
    },
    onError: (error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}

export function useUpdateClinicProfile() {
  const queryClient = useQueryClient();
  const { t } = useT();

  return useMutation<DentistProfile, Error, { id: string; data: UpdateClinicProfileBody }>({
    mutationFn: ({ id, data }) => dentistProfileService.updateProfile(id, data),
    onSuccess: () => {
      // The clinic name, address and phone show wherever the doctor does:
      // the profile and the current user are among the refreshed roots.
      void invalidateDoctorIdentityQueries(queryClient);
      toast.success(t('toasts.account.clinicUpdated'));
    },
    onError: (error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}
