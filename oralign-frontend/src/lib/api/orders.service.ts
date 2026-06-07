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
  PaymentMethod,
  PaymentRecordStatus,
  ToothInstruction,
  ToothInstructionType,
  UpdateOrderDto,
} from '@/lib/types';

/**
 * Row returned by the admin treatment-fee list endpoints. The shape
 * intentionally mirrors a subset of the installment Payment row so
 * the UI can switch between sources without rewriting the table.
 */
export interface TreatmentFeeRow {
  orderId: string;
  orderCode: string;
  amount: number | null;
  method: PaymentMethod | null;
  status: PaymentRecordStatus | null;
  paidAt: string | null;
  proofPath: string | null;
  submittedAt: string | null;
  updatedAt: string;
  doctor: { id: string; fullName: string; email: string } | null;
  patient: { id: string; fullName: string } | null;
}

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
   * Pay the treatment fee on an order. The backend routes by method:
   *   • card / cash         → instant success, stamps treatmentFeePaidAt
   *   • bank_transfer       → records `awaiting_confirmation`; the
   *     caller should ALSO upload a receipt with `uploadTreatmentFeeProof`
   *     and an admin will then call `confirmTreatmentFeePayment` once
   *     the funds land.
   */
  payTreatmentFee: async (
    id: string,
    method: 'card' | 'cash' | 'bank_transfer',
    amount: number,
  ): Promise<DentalOrder> => {
    const response = await apiClient.post<DentalOrder>(
      `/orders/${id}/treatment-fee/pay`,
      { method, amount },
    );
    return response.data;
  },

  /**
   * Upload the bank-transfer receipt for the treatment fee. The
   * backend stores the file and sets the lifecycle to
   * `awaiting_confirmation`.
   */
  uploadTreatmentFeeProof: async (
    id: string,
    proof: File,
    amount: number,
  ): Promise<DentalOrder> => {
    const form = new FormData();
    form.append('proof', proof);
    form.append('amount', String(amount));
    const response = await apiClient.post<DentalOrder>(
      `/orders/${id}/treatment-fee/proof`,
      form,
    );
    return response.data;
  },

  /**
   * Admin endpoint — confirms a pending bank-transfer payment.
   * Stamps `treatmentFeePaidAt`, which unlocks treatment-plan creation.
   */
  confirmTreatmentFeePayment: async (id: string): Promise<DentalOrder> => {
    const response = await apiClient.post<DentalOrder>(
      `/orders/${id}/treatment-fee/confirm`,
    );
    return response.data;
  },

  /**
   * Admin: paginated treatment-fee bank-transfer payments awaiting
   * confirmation. Same envelope shape as the installment-payment
   * pending queue so the UI can render both with one table primitive.
   */
  listPendingTreatmentFees: async (params: {
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<
      PaginatedResponse<TreatmentFeeRow>
    >('/orders/admin/treatment-fees/pending', { params });
    return response.data;
  },

  /** Admin: full treatment-fee payment history. */
  listTreatmentFees: async (params: { page?: number; limit?: number }) => {
    const response = await apiClient.get<
      PaginatedResponse<TreatmentFeeRow>
    >('/orders/admin/treatment-fees', { params });
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
    // Optional progress callback. Receives a 0–100 percentage so the
    // caller can drive a progress bar without knowing about axios.
    onProgress?: (percent: number) => void,
  ): Promise<OrderFile[]> => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    // Do NOT set Content-Type manually — axios reads the FormData and
    // emits `multipart/form-data; boundary=...` automatically. Forcing
    // the header strips the boundary parameter and the server can no
    // longer parse the body. (Same fix as users.service.ts uploadAvatar.)
    //
    // `timeout: 0` disables the global 30-second axios timeout for THIS
    // request only. CBCT / DICOM ZIPs routinely run 200–800 MB and even
    // on a 30 Mbit/s clinic uplink that's 1–4 minutes of wall time —
    // well past the default 30 s, which is what produced the
    // "Network Error" toast on big uploads. The reverse proxy already
    // caps the body window at 15 minutes (nginx client_body_timeout),
    // so this isn't an unbounded wait either.
    const response = await apiClient.post<OrderFile[]>(
      `/orders/${id}/files`,
      formData,
      {
        params: { category },
        timeout: 0,
        onUploadProgress: onProgress
          ? (event) => {
              if (event.total && event.total > 0) {
                onProgress(Math.round((event.loaded * 100) / event.total));
              }
            }
          : undefined,
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
