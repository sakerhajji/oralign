'use client';

import { useQuery, useMutation, useQueryClient, UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dentistProfileService, extractApiErrorMessage } from '@/lib/api';
import { useT } from '@/lib/i18n/lang-context';
import {
  DentistProfile,
  CreateDentistProfileDto,
  UpdateDentistProfileDto,
  PaginatedResponse,
  PaginationParams,
  SearchByCityDto,
  SearchNearbyDto,
  MessageResponse,
} from '@/lib/types';

// Query keys
export const profileKeys = {
  all: ['dentist-profiles'] as const,
  lists: () => [...profileKeys.all, 'list'] as const,
  list: (params?: PaginationParams) => [...profileKeys.lists(), params] as const,
  details: () => [...profileKeys.all, 'detail'] as const,
  detail: (id: string) => [...profileKeys.details(), id] as const,
  searches: () => [...profileKeys.all, 'search'] as const,
  searchByCity: (params: SearchByCityDto) => [...profileKeys.searches(), 'city', params] as const,
  searchNearby: (params: SearchNearbyDto) => [...profileKeys.searches(), 'nearby', params] as const,
};

/**
 * Hook to get all dentist profiles with pagination
 */
export function useDentistProfiles(params?: PaginationParams): UseQueryResult<PaginatedResponse<DentistProfile>, Error> {
  return useQuery<PaginatedResponse<DentistProfile>, Error>({
    queryKey: profileKeys.list(params),
    queryFn: () => dentistProfileService.getAllProfiles(params),
  });
}

/**
 * Hook to get dentist profile by ID
 */
export function useDentistProfile(id: string): UseQueryResult<DentistProfile, Error> {
  return useQuery<DentistProfile, Error>({
    queryKey: profileKeys.detail(id),
    queryFn: () => dentistProfileService.getProfileById(id),
    enabled: !!id,
  });
}

/**
 * Hook to search profiles by city
 */
export function useSearchByCity(params: SearchByCityDto): UseQueryResult<PaginatedResponse<DentistProfile>, Error> {
  return useQuery<PaginatedResponse<DentistProfile>, Error>({
    queryKey: profileKeys.searchByCity(params),
    queryFn: () => dentistProfileService.searchByCity(params),
    enabled: !!params.city,
  });
}

/**
 * Hook to search nearby profiles
 */
export function useSearchNearby(params: SearchNearbyDto): UseQueryResult<PaginatedResponse<DentistProfile>, Error> {
  return useQuery<PaginatedResponse<DentistProfile>, Error>({
    queryKey: profileKeys.searchNearby(params),
    queryFn: () => dentistProfileService.searchNearby(params),
    enabled: !!(params.latitude && params.longitude),
  });
}

/**
 * Hook to create a dentist profile for a specific user (admin only)
 */
export function useCreateDentistProfileForUser(): UseMutationResult<
  DentistProfile,
  Error,
  { userId: string; data: CreateDentistProfileDto }
> {
  const queryClient = useQueryClient();

  return useMutation<DentistProfile, Error, { userId: string; data: CreateDentistProfileDto }>({
    mutationFn: ({ userId, data }) => dentistProfileService.createProfileForUser(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.lists() });
    },
  });
}

/**
 * Hook to create a dentist profile
 */
export function useCreateDentistProfile(): UseMutationResult<DentistProfile, Error, CreateDentistProfileDto> {
  const queryClient = useQueryClient();

  return useMutation<DentistProfile, Error, CreateDentistProfileDto>({
    mutationFn: dentistProfileService.createProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.lists() });
    },
  });
}

/**
 * Hook to update a dentist profile
 */
export function useUpdateDentistProfile(): UseMutationResult<
  DentistProfile,
  Error,
  { id: string; data: UpdateDentistProfileDto }
> {
  const queryClient = useQueryClient();

  return useMutation<DentistProfile, Error, { id: string; data: UpdateDentistProfileDto }>({
    mutationFn: ({ id, data }) => dentistProfileService.updateProfile(id, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: profileKeys.lists() });
    },
  });
}

/**
 * Hook to delete a dentist profile
 */
export function useDeleteDentistProfile(): UseMutationResult<MessageResponse, Error, string> {
  const queryClient = useQueryClient();
  const { t } = useT();

  return useMutation<MessageResponse, Error, string>({
    mutationFn: dentistProfileService.deleteProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.lists() });
      toast.success(t('toasts.dentistProfiles.deleted'));
    },
    onError: (error: Error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}
