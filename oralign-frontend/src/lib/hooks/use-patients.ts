'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  UseMutationResult,
  UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { extractApiErrorMessage, patientsService } from '@/lib/api';
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

export function useCreatePatient(): UseMutationResult<
  Patient,
  Error,
  CreatePatientDto
> {
  const queryClient = useQueryClient();

  return useMutation<Patient, Error, CreatePatientDto>({
    mutationFn: patientsService.createPatient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
      toast.success('Patient created successfully');
    },
    onError: (error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}

export function useUpdatePatient(): UseMutationResult<
  Patient,
  Error,
  { id: string; data: UpdatePatientDto }
> {
  const queryClient = useQueryClient();

  return useMutation<Patient, Error, { id: string; data: UpdatePatientDto }>({
    mutationFn: ({ id, data }) => patientsService.updatePatient(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
      queryClient.invalidateQueries({ queryKey: patientKeys.detail(variables.id) });
      toast.success('Patient updated successfully');
    },
    onError: (error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}

export function useDeletePatient(): UseMutationResult<
  MessageResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();

  return useMutation<MessageResponse, Error, string>({
    mutationFn: patientsService.deletePatient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patientKeys.lists() });
      toast.success('Patient deleted successfully');
    },
    onError: (error) => {
      toast.error(extractApiErrorMessage(error));
    },
  });
}
