'use client';

import { useCallback } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  UseMutationResult,
  UseQueryResult,
} from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { extractApiError, toastMutationError, ordersService, patientsService } from '@/lib/api';
import type { BulkDeletePatientsResult } from '@/lib/api/patients.service';
import { useT } from '@/lib/i18n/lang-context';
import {
  CreatePatientDto,
  DentalOrder,
  MessageResponse,
  PaginatedResponse,
  Patient,
  PatientFilterParams,
  PatientListItem,
  UpdatePatientDto,
} from '@/lib/types';
import { orderKeys } from './use-orders';

export const patientKeys = {
  all: ['patients'] as const,
  lists: () => [...patientKeys.all, 'list'] as const,
  list: (params?: PatientFilterParams) => [...patientKeys.lists(), params] as const,
  details: () => [...patientKeys.all, 'detail'] as const,
  detail: (id: string) => [...patientKeys.details(), id] as const,
};

// Each row carries its newest order's status, which moves on other
// screens (the lab advances a case): the list refreshes whenever the page
// is opened and is considered fresh for 30 s only.
const PATIENT_LIST_STALE_TIME = 30_000;

export function usePatients(
  params?: PatientFilterParams,
): UseQueryResult<PaginatedResponse<PatientListItem>, Error> {
  return useQuery<PaginatedResponse<PatientListItem>, Error>({
    queryKey: patientKeys.list(params),
    queryFn: () => patientsService.getPatients(params),
    staleTime: PATIENT_LIST_STALE_TIME,
    refetchOnMount: 'always',
    // Keep the rows on screen while a new search, filter or page loads,
    // instead of flashing the whole list back to skeletons.
    placeholderData: keepPreviousData,
  });
}

/**
 * Totals for several filter sets at once (the patient book's view tabs):
 * one `limit: 1` request each, which returns the matching `total`.
 * `undefined` while a total is not known yet.
 */
export function usePatientTotals(
  paramsList: PatientFilterParams[],
): (number | undefined)[] {
  return useQueries({
    queries: paramsList.map((params) => {
      const countParams = { ...params, page: 1, limit: 1 };
      return {
        queryKey: patientKeys.list(countParams),
        queryFn: () => patientsService.getPatients(countParams),
        staleTime: PATIENT_LIST_STALE_TIME,
        refetchOnMount: 'always' as const,
        placeholderData: keepPreviousData,
        select: (data: PaginatedResponse<PatientListItem>) => data.total,
      };
    }),
  }).map((query) => query.data);
}

export function usePatient(id: string): UseQueryResult<Patient, Error> {
  return useQuery<Patient, Error>({
    queryKey: patientKeys.detail(id),
    queryFn: () => patientsService.getPatientById(id),
    enabled: !!id,
  });
}

/**
 * A patient's orders, newest first, for the patient panel. Keyed under
 * `orderKeys.lists()`, so every order mutation that refreshes the orders
 * lists refreshes this too. Deliberately WITHOUT placeholder data: on a
 * switch to another patient the panel must never show the previous
 * patient's orders while the new ones load.
 */
export function usePatientOrders(
  patientId: string | null,
): UseQueryResult<PaginatedResponse<DentalOrder>, Error> {
  const params = {
    patientId: patientId ?? undefined,
    limit: 50,
    sortBy: 'createdAt' as const,
    sortOrder: 'desc' as const,
  };
  return useQuery<PaginatedResponse<DentalOrder>, Error>({
    queryKey: orderKeys.list(params),
    queryFn: () => ordersService.getOrders(params),
    enabled: !!patientId,
    staleTime: 15_000,
  });
}

/**
 * Prefetch for the patient detail (the order detail page reads it). The
 * callback is stable, so rows can bind it without re-rendering.
 */
export function usePatientPrefetch(): (id: string) => void {
  const queryClient = useQueryClient();
  return useCallback(
    (id: string) => {
      if (!id) return;
      queryClient.prefetchQuery({
        queryKey: patientKeys.detail(id),
        queryFn: () => patientsService.getPatientById(id),
        staleTime: 1000 * 60 * 2,
      });
    },
    [queryClient],
  );
}

export function useCreatePatient(): UseMutationResult<
  Patient,
  Error,
  CreatePatientDto
> {
  const queryClient = useQueryClient();
  const { t } = useT();

  return useMutation<Patient, Error, CreatePatientDto>({
    mutationFn: patientsService.createPatient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
      toast.success(t('toasts.patients.created'));
    },
    onError: (error) => {
      toastMutationError(error);
    },
  });
}

export function useUpdatePatient(): UseMutationResult<
  Patient,
  Error,
  { id: string; data: UpdatePatientDto }
> {
  const queryClient = useQueryClient();
  const { t } = useT();

  return useMutation<Patient, Error, { id: string; data: UpdatePatientDto }>({
    mutationFn: ({ id, data }) => patientsService.updatePatient(id, data),
    onSuccess: (patient, variables) => {
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
      queryClient.setQueryData(patientKeys.detail(variables.id), patient);
      toast.success(t('toasts.patients.updated'));
    },
    onError: (error) => {
      toastMutationError(error);
    },
  });
}

export function useUploadPatientProfilePhoto(): UseMutationResult<
  Patient,
  Error,
  { id: string; file: File }
> {
  const queryClient = useQueryClient();
  const { t } = useT();

  return useMutation<Patient, Error, { id: string; file: File }>({
    mutationFn: ({ id, file }) => patientsService.uploadProfilePhoto(id, file),
    onSuccess: (patient, variables) => {
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
      queryClient.setQueryData(patientKeys.detail(variables.id), patient);
      toast.success(t('toasts.patients.updated'));
    },
    onError: (error) => {
      toastMutationError(error);
    },
  });
}

/** Soft delete: the patient moves to the trash and can be restored. */
export function useDeletePatient(): UseMutationResult<
  MessageResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();
  const { t } = useT();

  return useMutation<MessageResponse, Error, string>({
    mutationFn: patientsService.deletePatient,
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
      queryClient.removeQueries({ queryKey: patientKeys.detail(id) });
      toast.success(t('toasts.patients.deleted'));
    },
    onError: (error) => {
      // 409: the patient still has orders (the backend's text is English).
      if (extractApiError(error).errorCode === 'PATIENT_HAS_ACTIVE_ORDERS') {
        toast.error(t('patientDesk.errors.hasOrders'));
        return;
      }
      toastMutationError(error);
    },
  });
}

export function useRestorePatient(): UseMutationResult<
  MessageResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();
  const { t } = useT();

  return useMutation<MessageResponse, Error, string>({
    mutationFn: patientsService.restorePatient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
      toast.success(t('toasts.patients.restored'));
    },
    onError: (error) => {
      toastMutationError(error);
    },
  });
}

/** Permanent (hard) delete — admin-only, trash-first, irreversible. */
export function usePermanentDeletePatient(): UseMutationResult<
  MessageResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();
  const { t } = useT();

  return useMutation<MessageResponse, Error, string>({
    mutationFn: patientsService.permanentDeletePatient,
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
      queryClient.removeQueries({ queryKey: patientKeys.detail(id) });
      toast.success(t('toasts.patients.permanentlyDeleted'));
    },
    onError: (error) => {
      toastMutationError(error);
    },
  });
}

/**
 * Bulk soft delete. The backend keeps every patient that still has
 * orders (`blocked`); say so instead of reporting a plain success.
 */
export function useBulkDeletePatients(): UseMutationResult<
  BulkDeletePatientsResult,
  Error,
  string[]
> {
  const queryClient = useQueryClient();
  const { t } = useT();

  return useMutation<BulkDeletePatientsResult, Error, string[]>({
    mutationFn: patientsService.bulkDeletePatients,
    onSuccess: ({ deleted, blocked }) => {
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
      const moved = t(
        deleted === 1 ? 'toasts.patients.bulkDeletedOne' : 'toasts.patients.bulkDeletedMany',
        { count: deleted },
      );
      if (blocked === 0) {
        toast.success(moved);
        return;
      }
      const kept = t(
        blocked === 1 ? 'toasts.patients.bulkBlockedOne' : 'toasts.patients.bulkBlockedMany',
        { count: blocked },
      );
      if (deleted === 0) toast.warning(kept);
      else toast.warning(`${moved}. ${kept}`);
    },
    onError: (error) => {
      toastMutationError(error);
    },
  });
}
