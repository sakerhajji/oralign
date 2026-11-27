import apiClient from './client';
import {
  DentistProfile,
  CreateDentistProfileDto,
  UpdateDentistProfileDto,
  PaginatedResponse,
  PaginationParams,
  SearchByCityDto,
  SearchNearbyDto,
  MessageResponse,
  SetupClinicDto,
} from '@/lib/types';

/**
 * The clinic write bodies. The DTOs carry the private identity field
 * (registrationNumber, spec §6) themselves, which the server redacts like
 * taxId for anyone but the doctor and the admins.
 */
export type CreateClinicProfileBody = CreateDentistProfileDto;
export type UpdateClinicProfileBody = UpdateDentistProfileDto;
export type SetupClinicBody = SetupClinicDto;

export const dentistProfileService = {
  /**
   * Atomic onboarding endpoint — saves the dentist profile AND the entire
   * weekly schedule in a single transaction. Use this from the onboarding
   * wizard so the UI never has to await two separate mutations to keep
   * `clinicComplete` and `scheduleComplete` in sync.
   */
  setupClinic: async (data: SetupClinicBody): Promise<DentistProfile> => {
    const response = await apiClient.post<DentistProfile>('/dentist-profile/setup', data);
    return response.data;
  },

  /**
   * Create dentist profile (for current user)
   */
  createProfile: async (data: CreateClinicProfileBody): Promise<DentistProfile> => {
    const response = await apiClient.post<DentistProfile>('/dentist-profile', data);
    return response.data;
  },

  /**
   * Admin: create dentist profile for a specific user
   */
  createProfileForUser: async (userId: string, data: CreateClinicProfileBody): Promise<DentistProfile> => {
    const response = await apiClient.post<DentistProfile>(`/dentist-profile/admin/user/${userId}`, data);
    return response.data;
  },

  /**
   * Get all dentist profiles with pagination
   */
  getAllProfiles: async (params?: PaginationParams): Promise<PaginatedResponse<DentistProfile>> => {
    const response = await apiClient.get<PaginatedResponse<DentistProfile>>('/dentist-profile', { params });
    return response.data;
  },

  /**
   * Get dentist profile by ID
   */
  getProfileById: async (id: string): Promise<DentistProfile> => {
    const response = await apiClient.get<DentistProfile>(`/dentist-profile/${id}`);
    return response.data;
  },

  /**
   * Search dentist profiles by city
   */
  searchByCity: async (params: SearchByCityDto): Promise<PaginatedResponse<DentistProfile>> => {
    const response = await apiClient.get<PaginatedResponse<DentistProfile>>(
      '/dentist-profile/search/by-city',
      { params }
    );
    return response.data;
  },

  /**
   * Search nearby dentist profiles using geo-location
   */
  searchNearby: async (params: SearchNearbyDto): Promise<PaginatedResponse<DentistProfile>> => {
    const response = await apiClient.get<PaginatedResponse<DentistProfile>>(
      '/dentist-profile/search/nearby',
      { params }
    );
    return response.data;
  },

  /**
   * Update dentist profile
   */
  updateProfile: async (id: string, data: UpdateClinicProfileBody): Promise<DentistProfile> => {
    const response = await apiClient.put<DentistProfile>(`/dentist-profile/${id}`, data);
    return response.data;
  },

  /**
   * Delete dentist profile
   */
  deleteProfile: async (id: string): Promise<MessageResponse> => {
    const response = await apiClient.delete<MessageResponse>(`/dentist-profile/${id}`);
    return response.data;
  },
};
