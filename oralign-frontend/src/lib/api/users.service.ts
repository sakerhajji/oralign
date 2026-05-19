import apiClient from './client';
import {
  User,
  CreateUserDto,
  UpdateUserDto,
  PaginatedResponse,
  UserFilterParams,
  MessageResponse,
  BulkActionDto,
  BulkUpdateStatusDto,
} from '@/lib/types';

export const usersService = {
  /**
   * Get current logged-in user
   */
  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get<User>('/users/me');
    return response.data;
  },

  /**
   * Get all users (Admin only) with pagination and filters
   */
  getAllUsers: async (params?: UserFilterParams): Promise<PaginatedResponse<User>> => {
    const response = await apiClient.get<PaginatedResponse<User>>('/users', { params });
    return response.data;
  },

  /**
   * Get all deleted users (Admin only) with pagination and filters
   */
  getDeletedUsers: async (params?: UserFilterParams): Promise<PaginatedResponse<User>> => {
    const response = await apiClient.get<PaginatedResponse<User>>('/users/deleted/list', { params });
    return response.data;
  },

  /**
   * Get user by ID (Admin only)
   */
  getUserById: async (id: string): Promise<User> => {
    const response = await apiClient.get<User>(`/users/${id}`);
    return response.data;
  },

  /**
   * Create new user (Admin only)
   */
  createUser: async (data: CreateUserDto): Promise<User> => {
    const response = await apiClient.post<User>('/users', data);
    return response.data;
  },

  /**
   * Update user (Own profile or Admin)
   */
  updateUser: async (id: string, data: UpdateUserDto): Promise<User> => {
    const response = await apiClient.put<User>(`/users/${id}`, data);
    return response.data;
  },

  /**
   * Delete user (Admin only)
   */
  deleteUser: async (id: string): Promise<MessageResponse> => {
    const response = await apiClient.delete<MessageResponse>(`/users/${id}`);
    return response.data;
  },

  /**
   * Restore a deleted user (Admin only)
   */
  restoreUser: async (id: string): Promise<User> => {
    const response = await apiClient.post<User>(`/users/${id}/restore`);
    return response.data;
  },

  /**
   * Bulk delete users (Admin only)
   */
  bulkDeleteUsers: async (data: BulkActionDto): Promise<MessageResponse & { count: number }> => {
    const response = await apiClient.delete<MessageResponse & { count: number }>('/users', { data });
    return response.data;
  },

  /**
   * Bulk restore users (Admin only)
   */
  bulkRestoreUsers: async (data: BulkActionDto): Promise<MessageResponse & { count: number }> => {
    const response = await apiClient.post<MessageResponse & { count: number }>('/users/bulk-restore', data);
    return response.data;
  },

  /**
   * Bulk update user status (Admin only)
   */
  bulkUpdateStatus: async (data: BulkUpdateStatusDto): Promise<MessageResponse & { count: number }> => {
    const response = await apiClient.patch<MessageResponse & { count: number }>('/users/bulk-status', data);
    return response.data;
  },

  /**
   * Admin approval — flip the user's verificationStatus.
   * Backend fires the approval email automatically when transitioning to
   * "approved" for the first time.
   */
  updateApproval: async (
    id: string,
    verificationStatus: 'pending' | 'approved' | 'rejected',
  ): Promise<User> => {
    const response = await apiClient.patch<User>(
      `/users/${id}/approval`,
      { verificationStatus },
    );
    return response.data;
  },

  /**
   * Permanently delete a user (Hard delete - Admin only)
   */
  permanentlyDeleteUser: async (id: string): Promise<MessageResponse> => {
    const response = await apiClient.delete<MessageResponse>(`/users/${id}/permanent`);
    return response.data;
  },

  /**
   * Bulk permanently delete users (Hard delete - Admin only)
   */
  bulkPermanentlyDeleteUsers: async (data: BulkActionDto): Promise<MessageResponse & { count: number }> => {
    const response = await apiClient.delete<MessageResponse & { count: number }>('/users/bulk-permanent', { data });
    return response.data;
  },

  /**
   * Upload user avatar
   */
  uploadAvatar: async (id: string, file: File): Promise<User> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post<User>(`/users/${id}/avatar`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};
