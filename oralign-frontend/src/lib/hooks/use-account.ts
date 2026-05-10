'use client';

import { useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/lib/providers';
import { extractApiErrorMessage, usersService, dentistProfileService } from '@/lib/api';
import { userKeys } from '@/lib/hooks/use-users';
import { profileKeys } from '@/lib/hooks/use-dentist-profiles';
import { useCurrentUser } from '@/lib/hooks/use-users';
import { useWorkingHoursByProfile } from '@/lib/hooks/use-working-hours';
import { UpdateUserDto, UpdateDentistProfileDto, DentistProfile, User, UserRole } from '@/lib/types';

export function useAccountData() {
  const { login } = useAuth();
  const userQuery = useCurrentUser();
  const profileId = userQuery.data?.dentistProfile?.id ?? '';
  const workingHoursQuery = useWorkingHoursByProfile(profileId);

  useEffect(() => {
    if (userQuery.data) {
      login(userQuery.data);
    }
  }, [userQuery.data, login]);

  const isDentist = userQuery.data?.role === UserRole.DENTIST;
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

  return useMutation<User, Error, { id: string; data: UpdateUserDto }>({
    mutationFn: ({ id, data }) => usersService.updateUser(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: userKeys.currentUser() });
      login(data);
      toast.success(options?.successMessage ?? 'Profile updated successfully.');
    },
    onError: (error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}

export function useUpdateClinicProfile() {
  const queryClient = useQueryClient();

  return useMutation<DentistProfile, Error, { id: string; data: UpdateDentistProfileDto }>({
    mutationFn: ({ id, data }) => dentistProfileService.updateProfile(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: userKeys.currentUser() });
      toast.success('Clinic details updated.');
    },
    onError: (error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}
