'use client';

import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
  UseQueryResult,
  UseMutationResult,
} from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { dentistProfileService, extractApiErrorMessage } from '@/lib/api';
import type {
  CreateClinicProfileBody,
  UpdateClinicProfileBody,
} from '@/lib/api/dentist-profile.service';
import { useT } from '@/lib/i18n/lang-context';
import { showsDoctorIdentity } from '@/lib/doctor/identity-queries';
import { userKeys } from './use-users';
import { orderKeys } from './use-orders';
import { patientKeys } from './use-patients';
import { paymentKeys, treatmentFeeKeys } from './payment-keys';
import { quotationKeys } from './use-quotations';
import { supplementalOrderKeys } from './use-supplemental-orders';
import { treatmentPlanKeys } from './use-treatment-plans';
import { dashboardKeys } from './use-dashboard';
import { productionKeys } from './use-production';
import { productionAdminKeys } from './use-production-admin';
import { supportKeys } from './use-support';
import { invoiceKeys } from './use-admin-invoices';
import {
  DentistProfile,
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
 * Every query tree that shows a doctor's LIVE identity (spec §6): the
 * account and the users desk, the clinic profile, orders (and their
 * aligner-delivery log), patients, payments and fees, quotes,
 * supplemental requests, plans (live message senders), dashboards,
 * production, support, and the invoice client picker. Stored invoices
 * are snapshots and stay out; rendered PDFs are skipped by
 * showsDoctorIdentity.
 */
export const DOCTOR_IDENTITY_QUERY_ROOTS: readonly (readonly unknown[])[] = [
  userKeys.all,
  profileKeys.all,
  orderKeys.all,
  patientKeys.all,
  paymentKeys.all,
  treatmentFeeKeys.all,
  quotationKeys.all,
  supplementalOrderKeys.all,
  treatmentPlanKeys.all,
  dashboardKeys.all,
  productionKeys.all,
  productionAdminKeys.all,
  supportKeys.all,
  [...invoiceKeys.all, 'clients'],
];

/**
 * After a profile, avatar or clinic save: one pass over the cache marks
 * every query showing the doctor stale. Mounted ones refetch now, the
 * rest on their next mount, so no screen keeps the old name or clinic for
 * the 5-minute staleTime.
 */
export function invalidateDoctorIdentityQueries(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => showsDoctorIdentity(query.queryKey, DOCTOR_IDENTITY_QUERY_ROOTS),
  });
}

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
  { userId: string; data: CreateClinicProfileBody }
> {
  const queryClient = useQueryClient();

  return useMutation<DentistProfile, Error, { userId: string; data: CreateClinicProfileBody }>({
    mutationFn: ({ userId, data }) => dentistProfileService.createProfileForUser(userId, data),
    onSuccess: () => {
      void invalidateDoctorIdentityQueries(queryClient);
    },
  });
}

/**
 * Hook to create a dentist profile
 */
export function useCreateDentistProfile(): UseMutationResult<DentistProfile, Error, CreateClinicProfileBody> {
  const queryClient = useQueryClient();

  return useMutation<DentistProfile, Error, CreateClinicProfileBody>({
    mutationFn: dentistProfileService.createProfile,
    onSuccess: () => {
      void invalidateDoctorIdentityQueries(queryClient);
    },
    // The doctor's own clinic forms (/account/clinic, /account/settings)
    // do not catch: a refused creation must still say why.
    onError: (error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}

/**
 * Hook to update a dentist profile
 */
export function useUpdateDentistProfile(): UseMutationResult<
  DentistProfile,
  Error,
  { id: string; data: UpdateClinicProfileBody }
> {
  const queryClient = useQueryClient();

  return useMutation<DentistProfile, Error, { id: string; data: UpdateClinicProfileBody }>({
    mutationFn: ({ id, data }) => dentistProfileService.updateProfile(id, data),
    onSuccess: () => {
      // The profile detail and lists are under profileKeys.all, one of the roots.
      void invalidateDoctorIdentityQueries(queryClient);
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
      void invalidateDoctorIdentityQueries(queryClient);
      toast.success(t('toasts.dentistProfiles.deleted'));
    },
    onError: (error: Error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}
