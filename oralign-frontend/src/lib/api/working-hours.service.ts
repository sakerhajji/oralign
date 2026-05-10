import apiClient from './client';
import {
  WorkingHours,
  CreateWorkingHoursDto,
  UpdateWorkingHoursDto,
  MessageResponse,
} from '@/lib/types';

export const workingHoursService = {
  /**
   * Create working hours for a dentist profile
   */
  createWorkingHours: async (data: CreateWorkingHoursDto): Promise<WorkingHours> => {
    const response = await apiClient.post<WorkingHours>('/working-hours', data);
    return response.data;
  },

  /**
   * Get working hours by ID
   */
  getWorkingHoursById: async (id: string): Promise<WorkingHours> => {
    const response = await apiClient.get<WorkingHours>(`/working-hours/${id}`);
    return response.data;
  },

  /**
   * Get all working hours for a dentist profile
   */
  getWorkingHoursByProfileId: async (dentistProfileId: string): Promise<WorkingHours[]> => {
    const response = await apiClient.get<WorkingHours[]>(
      `/working-hours/dentist-profile/${dentistProfileId}`
    );
    return response.data;
  },

  /**
   * Update working hours
   */
  updateWorkingHours: async (id: string, data: UpdateWorkingHoursDto): Promise<WorkingHours> => {
    const response = await apiClient.put<WorkingHours>(`/working-hours/${id}`, data);
    return response.data;
  },

  /**
   * Delete working hours
   */
  deleteWorkingHours: async (id: string): Promise<MessageResponse> => {
    const response = await apiClient.delete<MessageResponse>(`/working-hours/${id}`);
    return response.data;
  },
};
