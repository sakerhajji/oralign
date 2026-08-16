import apiClient from './client';
import {
  CreatePatientDto,
  MessageResponse,
  PaginatedResponse,
  Patient,
  PatientFilterParams,
  UpdatePatientDto,
} from '@/lib/types';

export const patientsService = {
  getPatients: async (
    params?: PatientFilterParams,
  ): Promise<PaginatedResponse<Patient>> => {
    const response = await apiClient.get<PaginatedResponse<Patient>>(
      '/patients',
      { params },
    );
    return response.data;
  },

  getPatientById: async (id: string): Promise<Patient> => {
    const response = await apiClient.get<Patient>(`/patients/${id}`);
    return response.data;
  },

  createPatient: async (data: CreatePatientDto): Promise<Patient> => {
    const response = await apiClient.post<Patient>('/patients', data);
    return response.data;
  },

  updatePatient: async (
    id: string,
    data: UpdatePatientDto,
  ): Promise<Patient> => {
    const response = await apiClient.put<Patient>(`/patients/${id}`, data);
    return response.data;
  },

  uploadProfilePhoto: async (id: string, file: File): Promise<Patient> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post<Patient>(
      `/patients/${id}/profile-photo`,
      formData,
    );
    return response.data;
  },

  deletePatient: async (id: string): Promise<MessageResponse> => {
    const response = await apiClient.delete<MessageResponse>(`/patients/${id}`);
    return response.data;
  },

  /** Bring a soft-deleted patient back (owner dentist or admin). */
  restorePatient: async (id: string): Promise<MessageResponse> => {
    const response = await apiClient.post<MessageResponse>(`/patients/${id}/restore`);
    return response.data;
  },

  /** Permanent (hard) delete — admin-only, trash-first, irreversible. */
  permanentDeletePatient: async (id: string): Promise<MessageResponse> => {
    const response = await apiClient.delete<MessageResponse>(
      `/patients/${id}/permanent`,
    );
    return response.data;
  },

  bulkDeletePatients: async (
    ids: string[],
  ): Promise<{ message: string; deleted: number }> => {
    const response = await apiClient.delete<{ message: string; deleted: number }>(
      '/patients/bulk',
      { data: { ids } },
    );
    return response.data;
  },
};
