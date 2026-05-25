import apiClient from './client';
import {
  CreateOrderDto,
  DentalOrder,
  MessageResponse,
  OrderFile,
  OrderFileCategory,
  OrderFilterParams,
  OrderStatus,
  PaginatedResponse,
  ToothInstruction,
  ToothInstructionType,
  UpdateOrderDto,
} from '@/lib/types';

export const ordersService = {
  getOrders: async (
    params?: OrderFilterParams,
  ): Promise<PaginatedResponse<DentalOrder>> => {
    const response = await apiClient.get<PaginatedResponse<DentalOrder>>(
      '/orders',
      { params },
    );
    return response.data;
  },

  getOrderById: async (id: string): Promise<DentalOrder> => {
    const response = await apiClient.get<DentalOrder>(`/orders/${id}`);
    return response.data;
  },

  createOrder: async (data: CreateOrderDto): Promise<DentalOrder> => {
    const response = await apiClient.post<DentalOrder>('/orders', data);
    return response.data;
  },

  updateOrder: async (
    id: string,
    data: UpdateOrderDto,
  ): Promise<DentalOrder> => {
    const response = await apiClient.put<DentalOrder>(`/orders/${id}`, data);
    return response.data;
  },

  deleteOrder: async (id: string): Promise<MessageResponse> => {
    const response = await apiClient.delete<MessageResponse>(`/orders/${id}`);
    return response.data;
  },

  permanentDeleteOrder: async (id: string): Promise<MessageResponse> => {
    const response = await apiClient.delete<MessageResponse>(
      `/orders/${id}/permanent`,
    );
    return response.data;
  },

  /**
   * Restore a soft-deleted order — clears `deletedAt` so the row
   * shows up in the standard list/detail queries again. Admin only
   * (backend rejects non-admins with 403). Idempotent — re-clicking
   * Restore on an already-live order returns a no-op message.
   */
  restoreOrder: async (id: string): Promise<MessageResponse> => {
    const response = await apiClient.post<MessageResponse>(
      `/orders/${id}/restore`,
      {},
    );
    return response.data;
  },

  submitOrder: async (id: string): Promise<DentalOrder> => {
    const response = await apiClient.post<DentalOrder>(`/orders/${id}/submit`);
    return response.data;
  },

  /**
   * Admin-only manual status override. Accepts any valid OrderStatus,
   * including rollback to earlier phases. `reason` is logged on the
   * backend for auditability.
   */
  overrideStatus: async (
    id: string,
    status: OrderStatus,
    reason?: string,
  ): Promise<DentalOrder> => {
    const response = await apiClient.put<DentalOrder>(
      `/orders/${id}/status`,
      { status, reason: reason?.trim() || undefined },
    );
    return response.data;
  },

  /**
   * Bulk admin-only status update. The backend returns
   * `{ updated, skipped }` so the UI can show a precise toast
   * (e.g. "12 orders moved to Finished, 3 already there").
   */
  bulkUpdateStatus: async (
    ids: string[],
    status: OrderStatus,
    reason?: string,
  ): Promise<{ updated: number; skipped: number }> => {
    const response = await apiClient.post<{ updated: number; skipped: number }>(
      `/orders/bulk-status`,
      { ids, status, reason: reason?.trim() || undefined },
    );
    return response.data;
  },

  /**
   * Bulk soft-delete. Backend returns the count of rows it actually
   * marked deleted plus how many were already deleted (skipped).
   */
  bulkDelete: async (
    ids: string[],
  ): Promise<{ deleted: number; skipped: number }> => {
    const response = await apiClient.post<{ deleted: number; skipped: number }>(
      `/orders/bulk-delete`,
      { ids },
    );
    return response.data;
  },

  /**
   * Bulk restore — clears `deletedAt` for N soft-deleted orders.
   * Idempotent: already-live rows are skipped silently.
   */
  bulkRestore: async (
    ids: string[],
  ): Promise<{ restored: number; skipped: number }> => {
    const response = await apiClient.post<{
      restored: number;
      skipped: number;
    }>(`/orders/bulk-restore`, { ids });
    return response.data;
  },

  /**
   * Bulk PERMANENT delete — hard-deletes N orders and removes their
   * file blobs from disk. Capped at 100 per call by the backend.
   * Admin-only; irreversible.
   */
  bulkPermanentDelete: async (
    ids: string[],
  ): Promise<{ deleted: number; skipped: number }> => {
    const response = await apiClient.post<{ deleted: number; skipped: number }>(
      `/orders/bulk-permanent-delete`,
      { ids },
    );
    return response.data;
  },

  updateToothInstructions: async (
    id: string,
    instructions: ToothInstruction[],
    // Optional replace-scope. When supplied, the backend's wipe-and-
    // recreate semantics is limited to rows whose `type` is in this
    // list — letting the doctor and the planner each own their own
    // slice of OrderToothInstruction without overwriting each other.
    // See backend `UpdateToothInstructionsDto.replaceTypes` for the
    // full reasoning.
    replaceTypes?: ToothInstructionType[],
  ): Promise<DentalOrder> => {
    const response = await apiClient.put<DentalOrder>(
      `/orders/${id}/tooth-instructions`,
      { instructions, ...(replaceTypes ? { replaceTypes } : {}) },
    );
    return response.data;
  },

  uploadFiles: async (
    id: string,
    files: File[],
    category: OrderFileCategory,
  ): Promise<OrderFile[]> => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    // Do NOT set Content-Type manually — axios reads the FormData and
    // emits `multipart/form-data; boundary=...` automatically. Forcing
    // the header strips the boundary parameter and the server can no
    // longer parse the body. (Same fix as users.service.ts uploadAvatar.)
    const response = await apiClient.post<OrderFile[]>(
      `/orders/${id}/files`,
      formData,
      {
        params: { category },
      },
    );
    return response.data;
  },

  getFiles: async (id: string): Promise<OrderFile[]> => {
    const response = await apiClient.get<OrderFile[]>(`/orders/${id}/files`);
    return response.data;
  },

  deleteFile: async (
    id: string,
    fileId: string,
  ): Promise<MessageResponse> => {
    const response = await apiClient.delete<MessageResponse>(
      `/orders/${id}/files/${fileId}`,
    );
    return response.data;
  },

  getDownloadUrl: (id: string, fileId: string) =>
    `/orders/${id}/files/${fileId}/download`,
};
