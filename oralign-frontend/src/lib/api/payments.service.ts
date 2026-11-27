import type { AxiosProgressEvent } from 'axios';
import apiClient from './client';
import { asBlob, blobError, fileNameFromHeaders } from './blob-download';
import type {
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
} from '@/lib/types';

/** The PDF of the payments report, named as the server named it. */
export interface PaymentsReportFile {
  blob: Blob;
  fileName: string;
}

/**
 * Receipt uploads and reads: two minutes, not the client's 30 s (a 10 MB
 * PDF from a phone on a weak link). The server stops a body at 10 MB.
 */
export const RECEIPT_UPLOAD_TIMEOUT_MS = 120_000;

/** axios `onUploadProgress` reporting a 0..1 fraction, or nothing when no callback. */
export function uploadProgress(
  onProgress: ((fraction: number) => void) | undefined,
): ((event: AxiosProgressEvent) => void) | undefined {
  if (!onProgress) return undefined;
  return (event) => {
    if (event.total && event.total > 0) {
      onProgress(Math.min(1, Math.max(0, event.loaded / event.total)));
    }
  };
}

/** A failed receipt read: the server's errorCode (PROOF_NOT_FOUND) and the HTTP status kept. */
export type ProofReadError = Error & { status?: number; errorCode?: string };

/** Unwrap a `responseType: 'blob'` error, keeping its HTTP status. */
export async function proofError(error: unknown): Promise<ProofReadError> {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  const unwrapped: ProofReadError = await blobError(error, 'Could not load the receipt.');
  if (status !== undefined) unwrapped.status = status;
  return unwrapped;
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
    /** Pay the amount due minus the retenue à la source. */
    applyWithholding?: boolean;
  }): Promise<HostedPaymentSession> => {
    const res = await apiClient.post<HostedPaymentSession>(
      '/payments/clictopay/session',
      {
        orderId: args.orderId,
        purpose: args.purpose,
        installmentId: args.installmentId,
        language: args.language,
        pageView: args.pageView,
        applyWithholding: args.applyWithholding ?? false,
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
  // Multipart upload: bankReference (text) + proofFile (JPEG / PNG / WebP
  // or PDF, ≤ 10 MB, prepared by lib/payments/compress-receipt.ts). The
  // server checks the bytes again, writes the file only after its checks
  // and answers RECEIPT_TYPE / RECEIPT_TOO_LARGE otherwise. A declaration
  // still awaiting confirmation on the installment is REPLACED by this one
  // (the old row is cancelled, its file kept).

  declareBankTransfer: async (args: {
    quotationId: string;
    installmentId: string;
    bankReference?: string;
    proofFile?: File | Blob | null;
    applyWithholding?: boolean;
    /**
     * One key per declaration intent, reused by its retries: a replay with
     * the same key answers the row the first attempt created (CONTRACT §0).
     */
    idempotencyKey?: string;
    /** Upload progress, 0..1 (absent when the browser cannot tell). */
    onUploadProgress?: (fraction: number) => void;
  }): Promise<Payment> => {
    const form = new FormData();
    if (args.bankReference) form.append('bankReference', args.bankReference);
    if (args.proofFile) form.append('proofFile', args.proofFile);
    // Multipart fields are strings; the server reads the raw value.
    form.append('applyWithholding', args.applyWithholding ? 'true' : 'false');
    const res = await apiClient.post<Payment>(
      `/quotations/${args.quotationId}/installments/${args.installmentId}/declare-bank-transfer`,
      form,
      {
        // No Content-Type here: axios lets the browser write
        // `multipart/form-data; boundary=…` for a FormData body.
        headers: args.idempotencyKey ? { 'Idempotency-Key': args.idempotencyKey } : undefined,
        // A 10 MB PDF over a weak phone link outlasts the 30 s default.
        timeout: RECEIPT_UPLOAD_TIMEOUT_MS,
        onUploadProgress: uploadProgress(args.onUploadProgress),
      },
    );
    return res.data;
  },

  /**
   * Withdraw a transfer declaration still awaiting confirmation (the
   * owning dentist, or an admin): the row turns `cancelled`, its receipt
   * stays archived. A repeat on a withdrawn row answers it again; a row
   * the lab already processed answers 409 TRANSFER_NOT_WITHDRAWABLE.
   */
  withdrawBankTransfer: async (paymentId: string, note?: string): Promise<Payment> => {
    const res = await apiClient.post<Payment>(
      `/payments/${encodeURIComponent(paymentId)}/withdraw`,
      note && note.trim() ? { note: note.trim() } : {},
    );
    return res.data;
  },

  /**
   * The receipt of a pack-installment transfer, through the authenticated
   * stream (the uploads folder is private): the owning dentist and admins;
   * anyone else gets 404 PROOF_NOT_FOUND, carried on the thrown Error.
   */
  getPaymentProof: async (paymentId: string): Promise<Blob> => {
    try {
      const res = await apiClient.get<Blob>(
        `/payments/${encodeURIComponent(paymentId)}/proof`,
        { responseType: 'blob', timeout: RECEIPT_UPLOAD_TIMEOUT_MS },
      );
      return asBlob(res.data, 'application/octet-stream');
    } catch (error) {
      throw await proofError(error);
    }
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

  // ─── Admin lists + actions ────────────────────────────────────────
  // (Bank transfers are confirmed / refused from the pending desk:
  // transfer-queue.service.ts.)

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
