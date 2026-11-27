import apiClient from './client';
import { asBlob } from './blob-download';
import {
  RECEIPT_UPLOAD_TIMEOUT_MS,
  proofError,
  serialisePaymentFilters,
  uploadProgress,
} from './payments.service';
import type { TransferState } from '@/lib/types';
import {
  CreateOrderDto,
  DentalOrder,
  MessageResponse,
  OrderFile,
  OrderFileCategory,
  OrderFilterParams,
  OrderHistoryEntry,
  OrderStatus,
  PaginatedResponse,
  PaymentMethod,
  PaymentRecordStatus,
  ToothInstruction,
  ToothInstructionType,
  TreatmentFeeFilterParams,
  UpdateOrderDto,
} from '@/lib/types';

/**
 * Row returned by the treatment-fee list endpoints: one order's fee
 * (the fee lives on the order, not in the Payment table).
 */
export interface TreatmentFeeRow {
  orderId: string;
  orderCode: string;
  /**
   * Cash collected: fee due (TTC) + stamp - retenue. null when no fee was
   * set; 0 when the welcome gift waived it.
   */
  amount: number | null;
  /** Retenue à la source the practitioner applied: rate (%) and amount kept back. */
  withholdingRate?: number | null;
  withholdingAmount?: number;
  /** Droit de timbre charged on top with the fee (0 on fees paid before 2026-11-20). */
  stampAmount?: number;
  method: PaymentMethod | null;
  status: PaymentRecordStatus | null;
  /** null while a bank transfer waits for confirmation. */
  paidAt: string | null;
  /**
   * Stored receipt path (owning dentist and admins only). Never a URL: the
   * folder is private, the bytes come from GET orders/:id/treatment-fee/proof.
   * Test `hasProof`.
   */
  proofPath?: string | null;
  /** Whether a fee receipt is attached (P-A). */
  hasProof?: boolean;
  /** The transfer declaration's identity: when the receipt was sent. */
  declaredAt?: string | null;
  /** First time an admin opened the receipt ("En cours de vérification"). */
  reviewOpenedAt?: string | null;
  /** A refused transfer: when and why (status `rejected`). */
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  /** The derived spec state (CONTRACT §7). */
  state?: TransferState;
  /** The ORDER's submission, not the payment's. */
  submittedAt: string | null;
  updatedAt: string;
  /** The number of the fee's facture (FAC-…; TF-… on older fees), null until issued. */
  invoiceNumber: string | null;
  doctor: { id: string; fullName: string; email: string } | null;
  patient: { id: string; fullName: string } | null;
}

export const ordersService = {
  getOrders: async (
    params?: OrderFilterParams,
  ): Promise<PaginatedResponse<DentalOrder>> => {
    const response = await apiClient.get<PaginatedResponse<DentalOrder>>(
      '/orders',
      {
        params,
        // Force the array values (`statuses[]`) into repeated query
        // params WITHOUT bracket or index suffixes, e.g.
        //   ?statuses=draft&statuses=submitted
        // Axios's default serializer emits `statuses[]=…` which most
        // querystring parsers handle, but a couple of edge versions
        // produce the indexed-bracket shape (`statuses[0]=…`) that
        // qs treats as an OBJECT rather than an array — pinning the
        // serializer here avoids that whole class of "tab returns
        // 400" bugs at the source.
        paramsSerializer: { indexes: null },
      },
    );
    return response.data;
  },

  getOrderById: async (id: string): Promise<DentalOrder> => {
    const response = await apiClient.get<DentalOrder>(`/orders/${id}`);
    return response.data;
  },

  getOrderHistory: async (id: string): Promise<OrderHistoryEntry[]> => {
    const response = await apiClient.get<OrderHistoryEntry[]>(
      `/orders/${id}/history`,
    );
    return response.data;
  },

  /**
   * `idempotencyKey` lets a POST be repeated safely: the backend returns
   * the order the first attempt created instead of a second draft.
   */
  createOrder: async (
    data: CreateOrderDto,
    options: { idempotencyKey?: string } = {},
  ): Promise<DentalOrder> => {
    const response = await apiClient.post<DentalOrder>('/orders', data, {
      headers: options.idempotencyKey
        ? { 'Idempotency-Key': options.idempotencyKey }
        : undefined,
    });
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

  submitOrder: async (
    id: string,
    termsAccepted: boolean,
  ): Promise<DentalOrder> => {
    // The doctor must accept the General Terms & Conditions to submit;
    // the backend rejects the call when `termsAccepted` isn't true.
    const response = await apiClient.post<DentalOrder>(
      `/orders/${id}/submit`,
      { termsAccepted },
    );
    return response.data;
  },

  /**
   * Mark an order as seen by an admin (clears the sidebar "new orders"
   * badge). Admin-only on the backend; idempotent. Returns `{ seen }`
   * where `seen` is true only when this call was the one that stamped it.
   */
  markSeen: async (id: string): Promise<{ seen: boolean }> => {
    const response = await apiClient.post<{ seen: boolean }>(
      `/orders/${id}/mark-seen`,
    );
    return response.data;
  },

  /**
   * Pay the treatment fee on an order. The backend routes by method:
   *   • cash / cheque       → admin only, instant success
   *   • bank_transfer       → admins only now: a dentist's transfer is
   *     declared WITH its receipt, through `uploadTreatmentFeeProof`
   *     (POST …/pay bank_transfer answers a dentist 400 PROOF_REQUIRED).
   *     An admin confirms it once the funds land.
   */
  payTreatmentFee: async (
    id: string,
    method: 'card' | 'cash' | 'cheque' | 'bank_transfer',
    // `amount` is accepted for call-site compatibility but is NOT sent:
    // the backend computes the fee server-side (audit M-4) and the strict
    // ValidationPipe rejects any extra body field.
    _amount?: number,
    // The practitioner keeps the retenue à la source back; the server
    // computes it from the fee due and the company rate.
    applyWithholding = false,
  ): Promise<DentalOrder> => {
    const response = await apiClient.post<DentalOrder>(
      `/orders/${id}/treatment-fee/pay`,
      { method, applyWithholding },
    );
    return response.data;
  },

  /**
   * Declare the treatment-fee bank transfer with its receipt (JPEG / PNG /
   * WebP / PDF ≤ 10 MB, prepared by lib/payments/compress-receipt.ts): the
   * fee turns `awaiting_confirmation`. A receipt still awaiting
   * confirmation is REPLACED (its file kept); a refused one is cleared.
   */
  uploadTreatmentFeeProof: async (
    id: string,
    proof: File,
    // `amount` kept for call-site compatibility; not sent — the backend
    // derives the fee server-side (audit M-4).
    _amount?: number,
    applyWithholding = false,
    options: {
      /** One key per declaration intent, reused by its retries (CONTRACT §0). */
      idempotencyKey?: string;
      /** Upload progress, 0..1. */
      onUploadProgress?: (fraction: number) => void;
    } = {},
  ): Promise<DentalOrder> => {
    const form = new FormData();
    form.append('proof', proof);
    // Multipart fields are strings; the server reads the raw value.
    form.append('applyWithholding', applyWithholding ? 'true' : 'false');
    const response = await apiClient.post<DentalOrder>(
      `/orders/${id}/treatment-fee/proof`,
      form,
      {
        headers: options.idempotencyKey
          ? { 'Idempotency-Key': options.idempotencyKey }
          : undefined,
        timeout: RECEIPT_UPLOAD_TIMEOUT_MS,
        onUploadProgress: uploadProgress(options.onUploadProgress),
      },
    );
    return response.data;
  },

  /**
   * Withdraw the fee transfer still awaiting confirmation (the owning
   * dentist, or an admin): the fee is payable again, the receipt stays
   * archived. 409 TRANSFER_NOT_WITHDRAWABLE once the lab processed it.
   */
  withdrawTreatmentFeeProof: async (id: string): Promise<DentalOrder> => {
    const response = await apiClient.delete<DentalOrder>(
      `/orders/${id}/treatment-fee/proof`,
    );
    return response.data;
  },

  /**
   * The fee receipt through the authenticated stream (the owning dentist
   * and admins; 404 PROOF_NOT_FOUND for anyone else).
   */
  getTreatmentFeeProof: async (id: string): Promise<Blob> => {
    try {
      const response = await apiClient.get<Blob>(`/orders/${id}/treatment-fee/proof`, {
        responseType: 'blob',
        timeout: RECEIPT_UPLOAD_TIMEOUT_MS,
      });
      return asBlob(response.data, 'application/octet-stream');
    } catch (error) {
      throw await proofError(error);
    }
  },

  /**
   * Treatment fees, filtered and paged (admins: every dentist's; a
   * dentist: their own — the server scopes it).
   */
  listTreatmentFees: async (
    params: TreatmentFeeFilterParams = {},
  ): Promise<PaginatedResponse<TreatmentFeeRow>> => {
    const response = await apiClient.get<
      PaginatedResponse<TreatmentFeeRow>
    >('/orders/admin/treatment-fees', {
      params: serialisePaymentFilters(params),
    });
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

  /**
   * Admin / designer: download ALL of an order's files + its data as a
   * single ZIP. Fetched as a blob through apiClient so the Bearer token
   * is attached (a plain <a href> can't authenticate). The backend
   * streams the archive, so we disable the axios timeout (`timeout: 0`)
   * exactly like the large-file upload path — a CBCT-heavy order can be
   * hundreds of MB and take minutes to compress + transfer.
   */
  /**
   * The order sheet alone (PDF): order data + the approved treatment
   * plan. Available to the owning dentist as well as the planners.
   */
  downloadOrderSheet: async (id: string, lang: 'fr' | 'en' = 'fr'): Promise<Blob> => {
    const response = await apiClient.get<Blob>(`/orders/${id}/sheet?lang=${lang}`, {
      responseType: 'blob',
      timeout: 0,
    });
    return response.data;
  },

  downloadAllZip: async (
    id: string,
    // Reports BYTES RECEIVED, not a percentage: the archive is streamed
    // with no Content-Length (entries are appended as they're read), so
    // there is no total to compute a percentage against.
    onProgress?: (loadedBytes: number) => void,
    // UI language of the requester — drives the folder names and the
    // order-sheet filename INSIDE the archive (fr by default).
    lang: 'fr' | 'en' = 'fr',
  ): Promise<Blob> => {
    const response = await apiClient.get<Blob>(`/orders/${id}/download-all?lang=${lang}`, {
      responseType: 'blob',
      timeout: 0,
      onDownloadProgress: onProgress
        ? (event) => onProgress(event.loaded ?? 0)
        : undefined,
    });
    return response.data;
  },
};
