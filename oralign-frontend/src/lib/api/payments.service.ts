import apiClient from './client';
import type {
  ConfirmPaymentDto,
  PaginatedResponse,
  Payment,
  PaymentFilterDto,
  RecordCashPaymentDto,
  RejectPaymentDto,
} from '@/lib/types';

/**
 * Payments API. The backend owns idempotency + the single SUCCESS
 * transition; the UI just dispatches user intents. Amount is never
 * sent — the server loads it from the installment row under a row
 * lock to defeat tampering.
 */
export const paymentsService = {
  // ─── Doctor — CARD ────────────────────────────────────────────────
  // Idempotency-Key header MUST be set by the caller. Replays with
  // the same key return the same Payment row idempotently. The
  // optional `X-Mock-Outcome` header is honoured by the mock gateway
  // when MOCK_PAYMENT_CONTROLLABLE === 'true' (defaults off in
  // production).

  payByCard: async (args: {
    quotationId: string;
    installmentId: string;
    idempotencyKey: string;
    mockOutcome?: 'success' | 'failed' | 'pending';
  }): Promise<Payment> => {
    const res = await apiClient.post<Payment>(
      `/quotations/${args.quotationId}/installments/${args.installmentId}/pay-by-card`,
      {},
      {
        headers: {
          'Idempotency-Key': args.idempotencyKey,
          ...(args.mockOutcome
            ? { 'X-Mock-Outcome': args.mockOutcome }
            : {}),
        },
      },
    );
    return res.data;
  },

  // ─── Doctor — BANK_TRANSFER ───────────────────────────────────────
  // Multipart upload: bankReference (text) + proofFile (PNG/JPG/WebP/
  // HEIC or PDF, ≤5 MB). Backend stores the file under
  // /uploads/payments and validates MIME + size again server-side.

  declareBankTransfer: async (args: {
    quotationId: string;
    installmentId: string;
    bankReference?: string;
    proofFile?: File | Blob | null;
  }): Promise<Payment> => {
    const form = new FormData();
    if (args.bankReference) form.append('bankReference', args.bankReference);
    if (args.proofFile) form.append('proofFile', args.proofFile);
    const res = await apiClient.post<Payment>(
      `/quotations/${args.quotationId}/installments/${args.installmentId}/declare-bank-transfer`,
      form,
      {
        // Let the browser/axios pick the multipart boundary — explicit
        // Content-Type without boundary would break the upload.
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return res.data;
  },

  // ─── Doctor reads their own payment ───────────────────────────────

  getOwnPayment: async (args: {
    quotationId: string;
    paymentId: string;
  }): Promise<Payment> => {
    const res = await apiClient.get<Payment>(
      `/quotations/${args.quotationId}/payments/${args.paymentId}`,
    );
    return res.data;
  },

  // ─── Admin queue + actions ────────────────────────────────────────

  listPendingConfirmations: async (
    filters: PaymentFilterDto = {},
  ): Promise<PaginatedResponse<Payment>> => {
    const res = await apiClient.get<PaginatedResponse<Payment>>(
      '/admin/payments/pending-confirmations',
      { params: serialisePaymentFilters(filters) },
    );
    return res.data;
  },

  /** Admin: full payment history across every order in the system. */
  listAllPayments: async (
    filters: PaymentFilterDto = {},
  ): Promise<PaginatedResponse<Payment>> => {
    const res = await apiClient.get<PaginatedResponse<Payment>>(
      '/admin/payments',
      { params: serialisePaymentFilters(filters) },
    );
    return res.data;
  },

  /** Doctor (or admin) — payments tied to the caller's own orders. */
  listMyPayments: async (
    filters: PaymentFilterDto = {},
  ): Promise<PaginatedResponse<Payment>> => {
    const res = await apiClient.get<PaginatedResponse<Payment>>(
      '/payments/mine',
      { params: serialisePaymentFilters(filters) },
    );
    return res.data;
  },

  adminGetPayment: async (paymentId: string): Promise<Payment> => {
    const res = await apiClient.get<Payment>(`/admin/payments/${paymentId}`);
    return res.data;
  },

  confirmBankTransfer: async (
    paymentId: string,
    dto: ConfirmPaymentDto,
  ): Promise<Payment> => {
    const res = await apiClient.post<Payment>(
      `/admin/payments/${paymentId}/confirm`,
      dto,
    );
    return res.data;
  },

  rejectBankTransfer: async (
    paymentId: string,
    dto: RejectPaymentDto,
  ): Promise<Payment> => {
    const res = await apiClient.post<Payment>(
      `/admin/payments/${paymentId}/reject`,
      dto,
    );
    return res.data;
  },

  recordCash: async (args: {
    quotationId: string;
    installmentId: string;
    dto: RecordCashPaymentDto;
  }): Promise<Payment> => {
    const res = await apiClient.post<Payment>(
      `/admin/quotations/${args.quotationId}/installments/${args.installmentId}/record-cash`,
      args.dto,
    );
    return res.data;
  },
};

/**
 * Normalise PaymentFilterDto to the wire shape: arrays joined as
 * comma strings (backend's DTO handles both `methods=a,b` and
 * `methods=a&methods=b`), empty values dropped so the URL stays
 * clean AND React-Query keys don't churn on "empty vs missing".
 */
function serialisePaymentFilters(
  filters: PaymentFilterDto,
): Record<string, unknown> {
  const params: Record<string, unknown> = { ...filters };
  if (Array.isArray(filters.methods)) {
    if (filters.methods.length > 0) {
      params.methods = filters.methods.join(',');
    } else {
      delete params.methods;
    }
  }
  if (Array.isArray(filters.statuses)) {
    if (filters.statuses.length > 0) {
      params.statuses = filters.statuses.join(',');
    } else {
      delete params.statuses;
    }
  }
  for (const k of Object.keys(params)) {
    const v = params[k];
    if (v === undefined || v === null || v === '') delete params[k];
  }
  return params;
}
