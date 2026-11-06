import apiClient from './client';
import { asBlob, blobError, fileNameFromHeaders } from './blob-download';
import type {
  ConfirmPaymentDto,
  HostedPaymentSession,
  PaginatedResponse,
  Payment,
  PaymentFilterDto,
  PaymentListItem,
  PaymentPractitioner,
  PaymentPurpose,
  PaymentsReportRequest,
  PaymentsSummary,
  PaymentsSummaryParams,
  RecordCashPaymentDto,
  RejectPaymentDto,
} from '@/lib/types';

/** The PDF of the payments report, named as the server named it. */
export interface PaymentsReportFile {
  blob: Blob;
  fileName: string;
}

/**
 * Payments API. The backend owns idempotency + the single SUCCESS
 * transition; the UI just dispatches user intents. Amount is never
 * sent — the server loads it from the installment row under a row
 * lock to defeat tampering.
 */
export const paymentsService = {
  createClicToPaySession: async (args: {
    orderId: string;
    purpose: PaymentPurpose;
    installmentId?: string;
    idempotencyKey: string;
    language?: 'fr' | 'en' | 'ar';
    pageView?: 'DESKTOP' | 'MOBILE';
  }): Promise<HostedPaymentSession> => {
    const res = await apiClient.post<HostedPaymentSession>(
      '/payments/clictopay/session',
      {
        orderId: args.orderId,
        purpose: args.purpose,
        installmentId: args.installmentId,
        language: args.language,
        pageView: args.pageView,
      },
      { headers: { 'Idempotency-Key': args.idempotencyKey } },
    );
    return res.data;
  },

  verifyClicToPayPayment: async (
    paymentId: string,
  ): Promise<HostedPaymentSession> => {
    const res = await apiClient.get<HostedPaymentSession>(
      `/payments/clictopay/${paymentId}/status`,
    );
    return res.data;
  },

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
  ): Promise<PaginatedResponse<PaymentListItem>> => {
    const res = await apiClient.get<PaginatedResponse<PaymentListItem>>(
      '/admin/payments/pending-confirmations',
      { params: serialisePaymentFilters(filters) },
    );
    return res.data;
  },

  /** Admin: full payment history across every order in the system. */
  listAllPayments: async (
    filters: PaymentFilterDto = {},
  ): Promise<PaginatedResponse<PaymentListItem>> => {
    const res = await apiClient.get<PaginatedResponse<PaymentListItem>>(
      '/admin/payments',
      { params: serialisePaymentFilters(filters) },
    );
    return res.data;
  },

  /** Doctor (or admin) — payments tied to the caller's own orders. */
  listMyPayments: async (
    filters: PaymentFilterDto = {},
  ): Promise<PaginatedResponse<PaymentListItem>> => {
    const res = await apiClient.get<PaginatedResponse<PaymentListItem>>(
      '/payments/mine',
      { params: serialisePaymentFilters(filters) },
    );
    return res.data;
  },

  /**
   * Money received over a range of Africa/Tunis days, by method, for the
   * caller's scope (a dentist: their own orders). No range → today.
   */
  getSummary: async (
    params: PaymentsSummaryParams = {},
  ): Promise<PaymentsSummary> => {
    const res = await apiClient.get<PaymentsSummary>('/payments/summary', {
      params: withoutEmptyValues({ ...params }),
    });
    return res.data;
  },

  /**
   * Admin: the dentists with at least one payment of `purpose` — the
   * options of the desk's practitioner filter.
   */
  listPractitioners: async (
    purpose: PaymentPurpose,
  ): Promise<PaymentPractitioner[]> => {
    const res = await apiClient.get<{ data: PaymentPractitioner[] }>(
      '/payments/practitioners',
      { params: { purpose } },
    );
    return res.data.data;
  },

  /**
   * The payments report as a PDF, built on the server from every row
   * matching the period and the tabs' filters (never from the rows on
   * screen). A refusal (e.g. REPORT_TOO_LARGE) comes back as an Error
   * carrying the server's message and errorCode.
   */
  downloadReport: async (
    request: PaymentsReportRequest,
  ): Promise<PaymentsReportFile> => {
    try {
      const res = await apiClient.post('/payments/report', request, {
        responseType: 'blob',
        // A long report takes Chromium a few seconds to print.
        timeout: 120_000,
      });
      return {
        blob: asBlob(res.data, 'application/pdf'),
        fileName: fileNameFromHeaders(
          res.headers as Record<string, unknown>,
          'Oralign_Rapport_Paiements.pdf',
        ),
      };
    } catch (error) {
      throw await blobError(error, 'Could not generate the payments report.');
    }
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
 * Normalise a payment or treatment-fee filter to the wire shape: the
 * `methods` / `statuses` arrays joined as comma strings (both backend
 * DTOs accept `methods=a,b` and `methods=a&methods=b`), empty values
 * dropped so the URL stays clean (the strict validation pipe would
 * refuse an empty enum value).
 */
export function serialisePaymentFilters(
  filters: object,
): Record<string, unknown> {
  const params: Record<string, unknown> = { ...filters };
  for (const key of ['methods', 'statuses']) {
    const values = params[key];
    if (Array.isArray(values)) {
      params[key] = values.length > 0 ? values.join(',') : undefined;
    }
  }
  return withoutEmptyValues(params);
}

function withoutEmptyValues(
  params: Record<string, unknown>,
): Record<string, unknown> {
  for (const k of Object.keys(params)) {
    const v = params[k];
    if (v === undefined || v === null || v === '') delete params[k];
  }
  return params;
}
