'use client';

import { useQuery, useMutation, useQueryClient, UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { workingHoursService, extractApiErrorMessage } from '@/lib/api';
import { useT } from '@/lib/i18n/lang-context';
import { WorkingHours, CreateWorkingHoursDto, UpdateWorkingHoursDto, MessageResponse } from '@/lib/types';

// Query keys
export const workingHoursKeys = {
  all: ['working-hours'] as const,
  details: () => [...workingHoursKeys.all, 'detail'] as const,
  detail: (id: string) => [...workingHoursKeys.details(), id] as const,
  byProfile: (profileId: string) => [...workingHoursKeys.all, 'profile', profileId] as const,
};

/**
 * Hook to get working hours by ID
 */
export function useWorkingHours(id: string): UseQueryResult<WorkingHours, Error> {
  return useQuery<WorkingHours, Error>({
    queryKey: workingHoursKeys.detail(id),
    queryFn: () => workingHoursService.getWorkingHoursById(id),
    enabled: !!id,
  });
}

/**
 * Hook to get all working hours for a dentist profile
 */
export function useWorkingHoursByProfile(dentistProfileId: string): UseQueryResult<WorkingHours[], Error> {
  return useQuery<WorkingHours[], Error>({
    queryKey: workingHoursKeys.byProfile(dentistProfileId),
    queryFn: () => workingHoursService.getWorkingHoursByProfileId(dentistProfileId),
    enabled: !!dentistProfileId,
  });
}

/**
 * Hook to create working hours
 */
export function useCreateWorkingHours(): UseMutationResult<WorkingHours, Error, CreateWorkingHoursDto> {
  const queryClient = useQueryClient();

  return useMutation<WorkingHours, Error, CreateWorkingHoursDto>({
    mutationFn: workingHoursService.createWorkingHours,
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: workingHoursKeys.byProfile(data.dentistProfileId)
      });
    },
  });
}

/**
 * Hook to update working hours
 */
export function useUpdateWorkingHours(): UseMutationResult<
  WorkingHours,
  Error,
  { id: string; data: UpdateWorkingHoursDto }
> {
  const queryClient = useQueryClient();

  return useMutation<WorkingHours, Error, { id: string; data: UpdateWorkingHoursDto }>({
    mutationFn: ({ id, data }) => workingHoursService.updateWorkingHours(id, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: workingHoursKeys.detail(variables.id) });
      queryClient.invalidateQueries({
        queryKey: workingHoursKeys.byProfile(data.dentistProfileId)
      });
    },
  });
}

/**
 * Hook to delete working hours
 */
export function useDeleteWorkingHours(): UseMutationResult<MessageResponse, Error, { id: string; profileId: string }> {
  const queryClient = useQueryClient();
  const { t } = useT();

  return useMutation<MessageResponse, Error, { id: string; profileId: string }>({
    mutationFn: ({ id }) => workingHoursService.deleteWorkingHours(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: workingHoursKeys.byProfile(variables.profileId)
      });
      toast.success(t('toasts.workingHours.deleted'));
    },
    onError: (error: Error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}
