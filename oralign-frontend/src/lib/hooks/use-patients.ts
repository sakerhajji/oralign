'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  UseMutationResult,
  UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { toastMutationError, patientsService } from '@/lib/api';
import { useT } from '@/lib/i18n/lang-context';
import {
  CreatePatientDto,
  MessageResponse,
  PaginatedResponse,
  Patient,
  PatientFilterParams,
  UpdatePatientDto,
} from '@/lib/types';

export const patientKeys = {
  all: ['patients'] as const,
  lists: () => [...patientKeys.all, 'list'] as const,
  list: (params?: PatientFilterParams) => [...patientKeys.lists(), params] as const,
  details: () => [...patientKeys.all, 'detail'] as const,
  detail: (id: string) => [...patientKeys.details(), id] as const,
};

export function usePatients(
  params?: PatientFilterParams,
): UseQueryResult<PaginatedResponse<Patient>, Error> {
  return useQuery<PaginatedResponse<Patient>, Error>({
    queryKey: patientKeys.list(params),
    queryFn: () => patientsService.getPatients(params),
    staleTime: 1000 * 60 * 5,
  });
}

export function usePatient(id: string): UseQueryResult<Patient, Error> {
  return useQuery<Patient, Error>({
    queryKey: patientKeys.detail(id),
    queryFn: () => patientsService.getPatientById(id),
    enabled: !!id,
  });
}

/**
 * Hover-triggered prefetch for the patient detail. Same rationale as
 * useOrderPrefetch — the moment the user hovers a row in the patients
 * list, we kick off the detail GET so navigation feels instant.
 */
export function usePatientPrefetch(): (id: string) => void {
  const queryClient = useQueryClient();
  return (id: string) => {
    if (!id) return;
    queryClient.prefetchQuery({
      queryKey: patientKeys.detail(id),
      queryFn: () => patientsService.getPatientById(id),
      staleTime: 1000 * 60 * 2,
    });
  };
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
      queryClient.invalidateQueries({ queryKey: patientKeys.detail(variables.id) });
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

export function useDeletePatient(): UseMutationResult<
  MessageResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();
  const { t } = useT();

  return useMutation<MessageResponse, Error, string>({
    mutationFn: patientsService.deletePatient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
      toast.success(t('toasts.patients.deleted'));
    },
    onError: (error) => {
      toastMutationError(error);
    },
  });
}

/** Permanent (hard) delete — admin-only, irreversible. */
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

export function usePermanentDeletePatient(): UseMutationResult<
  MessageResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();
  const { t } = useT();

  return useMutation<MessageResponse, Error, string>({
    mutationFn: patientsService.permanentDeletePatient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
      toast.success(t('toasts.patients.permanentlyDeleted'));
    },
    onError: (error) => {
      toastMutationError(error);
    },
  });
}

export function useBulkDeletePatients(): UseMutationResult<
  { message: string; deleted: number },
  Error,
  string[]
> {
  const queryClient = useQueryClient();
  const { t } = useT();

  return useMutation<{ message: string; deleted: number }, Error, string[]>({
    mutationFn: patientsService.bulkDeletePatients,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
      toast.success(t('toasts.patients.bulkDeleted', { count: data.deleted }));
    },
    onError: (error) => {
      toastMutationError(error);
    },
  });
}
