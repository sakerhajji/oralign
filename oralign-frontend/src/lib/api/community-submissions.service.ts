import apiClient from './client';
import type {
  CommunitySubmission,
  CommunitySubmissionFilters,
  CommunitySubmissionStatus,
  CreateCommunitySubmissionInput,
  PaginatedResponse,
} from '@/lib/types';

type AdminCreateCommunitySubmissionInput = CreateCommunitySubmissionInput & {
  status?: CommunitySubmissionStatus;
};

function buildFormData(input: AdminCreateCommunitySubmissionInput): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (key === 'media' || value === undefined || value === null || value === '') continue;
    formData.append(key, String(value));
  }
  for (const file of input.media ?? []) formData.append('media', file);
  return formData;
}

export const communitySubmissionsService = {
  async listApproved(): Promise<CommunitySubmission[]> {
    const response = await apiClient.get<CommunitySubmission[]>('/community-submissions/approved');
    return response.data;
  },

  async create(input: CreateCommunitySubmissionInput, onUploadProgress?: (progress: number) => void): Promise<{ id: string; status: string; message: string }> {
    const response = await apiClient.post('/community-submissions', buildFormData(input), {
      onUploadProgress: (event) => {
        if (event.total) onUploadProgress?.(Math.round((event.loaded / event.total) * 100));
      },
    });
    return response.data;
  },

  async createAdmin(input: AdminCreateCommunitySubmissionInput): Promise<CommunitySubmission> {
    const response = await apiClient.post<CommunitySubmission>('/admin/community-submissions', buildFormData(input));
    return response.data;
  },

  async updateAdmin(id: string, input: Partial<CreateCommunitySubmissionInput>): Promise<CommunitySubmission> {
    const response = await apiClient.patch<CommunitySubmission>(`/admin/community-submissions/${id}`, input);
    return response.data;
  },

  async listAdmin(filters: CommunitySubmissionFilters = {}): Promise<PaginatedResponse<CommunitySubmission>> {
    const response = await apiClient.get<PaginatedResponse<CommunitySubmission>>('/admin/community-submissions', { params: filters });
    return response.data;
  },

  async approve(id: string): Promise<CommunitySubmission> {
    const response = await apiClient.patch<CommunitySubmission>(`/admin/community-submissions/${id}/approve`);
    return response.data;
  },

  async reject(id: string, reviewNote?: string): Promise<CommunitySubmission> {
    const response = await apiClient.patch<CommunitySubmission>(`/admin/community-submissions/${id}/reject`, { reviewNote });
    return response.data;
  },

  async remove(id: string): Promise<{ id: string }> {
    const response = await apiClient.delete<{ id: string }>(`/admin/community-submissions/${id}`);
    return response.data;
  },
};
