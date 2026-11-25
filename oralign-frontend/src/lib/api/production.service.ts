import { AxiosError } from 'axios';
import apiClient from './client';
import { asBlob, blobError, saveBlob } from './blob-download';
import {
  PRODUCTION_WARNINGS,
  type CancelProductionEventInput,
  type DeclareProductionEventInput,
  type ProductionAnomalies,
  type ProductionCancelResult,
  type ProductionCaseSheet,
  type ProductionDeclareResult,
  type ProductionDossier,
  type ProductionErrorCode,
  type ProductionExportParams,
  type ProductionFileVariant,
  type ProductionFileView,
  type ProductionMyDay,
  type ProductionMyDayChoice,
  type ProductionNoticePage,
  type ProductionNoticesParams,
  type ProductionNoticeView,
  type ProductionPeriodParams,
  type ProductionPlanAttachmentView,
  type ProductionProgressPage,
  type ProductionProgressParams,
  type ProductionQueuePage,
  type ProductionQueueParams,
  type ProductionSummary,
  type ProductionWarningCode,
} from '@/lib/types/production';

/**
 * Lab production API: one typed function per endpoint of
 * ProductionController (`/production/*`, technician + admins) and
 * ProductionAdminController (`/production/admin/*`, admins). Contract:
 * production-build/CONTRACT.md; shapes: lib/types/production.ts.
 * FOUNDATION-OWNED and frozen.
 *
 * Files behind the JWT never go into an <a href>: `paths` gives the
 * API-relative path for `useAuthedImage` (apiClient), `absoluteUrl` turns
 * it into the full URL `fetchAuthedBlob` / a 3D viewer expects, and the
 * download functions save the bytes under the server's file name.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

/** Drop empty values so the API never sees `?search=`. */
function cleanParams(params: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
}

const enc = encodeURIComponent;

/** API-relative paths of the production file streams (for useAuthedImage). */
export const productionPaths = {
  orderFile: (orderId: string, fileId: string, variant?: ProductionFileVariant) =>
    `/production/orders/${enc(orderId)}/files/${enc(fileId)}/download` +
    (variant ? `?variant=${enc(variant)}` : ''),
  planAttachment: (orderId: string, attachmentId: string) =>
    `/production/orders/${enc(orderId)}/plan/attachments/${enc(attachmentId)}/download`,
  movementTableImage: (orderId: string) =>
    `/production/orders/${enc(orderId)}/plan/movement-table-image`,
  dentalTableImage: (orderId: string) =>
    `/production/orders/${enc(orderId)}/plan/dental-table-image`,
};

/** The full URL of an API-relative path (fetchAuthedBlob, model viewer). */
export function absoluteUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * A fresh Idempotency-Key for ONE declaration attempt. Create it when the
 * form opens (or on the first submit) and reuse it for every retry of that
 * same submit, so a double tap or a lost response never writes twice.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Older WebViews: 32 hex characters from getRandomValues.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** What the UI needs from a failed production call. */
export interface ProductionApiError {
  status: number | null;
  errorCode: ProductionErrorCode | string | null;
  /** The server's words (already in the caller's language when it has them). */
  message: string | null;
  /** The warnings of a 409 PRODUCTION_CONFIRM_REQUIRED; [] otherwise. */
  warnings: ProductionWarningCode[];
}

const WARNING_SET: ReadonlySet<string> = new Set(PRODUCTION_WARNINGS);

/**
 * Read a production error: status, errorCode, message and the confirmable
 * warnings. Pair it with `classifyApiError` (lib/api/error.ts) for the
 * offline / timeout / upstream cases, which carry no errorCode.
 */
export function readProductionError(error: unknown): ProductionApiError {
  if (!(error instanceof AxiosError)) {
    const errorCode = (error as { errorCode?: unknown } | null)?.errorCode;
    return {
      status: null,
      errorCode: typeof errorCode === 'string' ? errorCode : null,
      message: error instanceof Error ? error.message : null,
      warnings: [],
    };
  }
  const data = error.response?.data as
    | { message?: unknown; errorCode?: unknown; warnings?: unknown }
    | undefined;
  const message = Array.isArray(data?.message) ? data?.message[0] : data?.message;
  const warnings = Array.isArray(data?.warnings)
    ? (data.warnings.filter(
        (code): code is ProductionWarningCode =>
          typeof code === 'string' && WARNING_SET.has(code),
      ) as ProductionWarningCode[])
    : [];
  return {
    status: error.response?.status ?? null,
    errorCode: typeof data?.errorCode === 'string' ? data.errorCode : null,
    message: typeof message === 'string' ? message : null,
    warnings,
  };
}

async function getBlob(path: string, type: string, fallback: string): Promise<Blob> {
  try {
    const res = await apiClient.get(path, { responseType: 'blob', timeout: 0 });
    return asBlob(res.data, type);
  } catch (error) {
    throw await blobError(error, fallback);
  }
}

async function downloadBlob(path: string, fallbackName: string, failure: string): Promise<void> {
  try {
    // timeout 0: 3D scans and CBCT bundles can take minutes on lab Wi-Fi.
    const res = await apiClient.get(path, { responseType: 'blob', timeout: 0 });
    saveBlob(
      asBlob(res.data, 'application/octet-stream'),
      fallbackName,
      res.headers as Record<string, unknown>,
    );
  } catch (error) {
    throw await blobError(error, failure);
  }
}

export const productionService = {
  // ── Technician + admin ───────────────────────────────────────────

  /** GET /production/queue */
  getQueue: async (params: ProductionQueueParams = {}): Promise<ProductionQueuePage> => {
    const res = await apiClient.get<ProductionQueuePage>('/production/queue', {
      params: cleanParams(params),
    });
    return res.data;
  },

  /** GET /production/orders/:orderId (case sheet) */
  getCaseSheet: async (orderId: string): Promise<ProductionCaseSheet> => {
    const res = await apiClient.get<ProductionCaseSheet>(
      `/production/orders/${enc(orderId)}`,
    );
    return res.data;
  },

  /** GET /production/orders/:orderId/dossier (finance-free) */
  getDossier: async (orderId: string): Promise<ProductionDossier> => {
    const res = await apiClient.get<ProductionDossier>(
      `/production/orders/${enc(orderId)}/dossier`,
    );
    return res.data;
  },

  /** POST /production/events. Reuse the SAME key for every retry of one submit. */
  declareEvent: async (
    input: DeclareProductionEventInput,
    idempotencyKey: string,
  ): Promise<ProductionDeclareResult> => {
    const res = await apiClient.post<ProductionDeclareResult>('/production/events', input, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return res.data;
  },

  /** PATCH /production/events/:id/cancel (idempotent on an already-cancelled row) */
  cancelEvent: async (
    eventId: string,
    input: CancelProductionEventInput,
  ): Promise<ProductionCancelResult> => {
    const res = await apiClient.patch<ProductionCancelResult>(
      `/production/events/${enc(eventId)}/cancel`,
      input,
    );
    return res.data;
  },

  /** GET /production/my-day */
  getMyDay: async (day: ProductionMyDayChoice = 'today'): Promise<ProductionMyDay> => {
    const res = await apiClient.get<ProductionMyDay>('/production/my-day', {
      params: { day },
    });
    return res.data;
  },

  /** GET /production/orders/:orderId/files/:fileId/download as a Blob (preview, 3D viewer). */
  fetchOrderFile: (
    orderId: string,
    fileId: string,
    variant?: ProductionFileVariant,
  ): Promise<Blob> =>
    getBlob(
      productionPaths.orderFile(orderId, fileId, variant),
      'application/octet-stream',
      'Could not load the file.',
    ),

  /**
   * Save the ORIGINAL of an order file under the server's neutral name
   * (Content-Disposition `<category>-<NNN><ext>`); originalName is only the
   * fallback when a proxy drops the header.
   */
  downloadOrderFile: (
    orderId: string,
    file: Pick<ProductionFileView, 'id' | 'originalName'>,
  ): Promise<void> =>
    downloadBlob(
      productionPaths.orderFile(orderId, file.id),
      file.originalName,
      'Could not download the file.',
    ),

  /** GET /production/orders/:orderId/plan/attachments/:attachmentId/download as a Blob. */
  fetchPlanAttachment: (orderId: string, attachmentId: string): Promise<Blob> =>
    getBlob(
      productionPaths.planAttachment(orderId, attachmentId),
      'application/octet-stream',
      'Could not load the plan file.',
    ),

  /** Save a result file of the approved plan. */
  downloadPlanAttachment: (
    orderId: string,
    attachment: Pick<ProductionPlanAttachmentView, 'id' | 'fileName'>,
  ): Promise<void> =>
    downloadBlob(
      productionPaths.planAttachment(orderId, attachment.id),
      attachment.fileName,
      'Could not download the plan file.',
    ),

  /** GET /production/orders/:orderId/plan/movement-table-image */
  fetchMovementTableImage: (orderId: string): Promise<Blob> =>
    getBlob(
      productionPaths.movementTableImage(orderId),
      'image/png',
      'Could not load the movement table.',
    ),

  /** GET /production/orders/:orderId/plan/dental-table-image */
  fetchDentalTableImage: (orderId: string): Promise<Blob> =>
    getBlob(
      productionPaths.dentalTableImage(orderId),
      'image/png',
      'Could not load the dental treatment table.',
    ),

  // ── Admin desk ───────────────────────────────────────────────────

  /** GET /production/admin/summary (journal when from = to, recap otherwise) */
  getSummary: async (period: ProductionPeriodParams): Promise<ProductionSummary> => {
    const res = await apiClient.get<ProductionSummary>('/production/admin/summary', {
      params: cleanParams(period),
    });
    return res.data;
  },

  /** GET /production/admin/progress */
  getProgress: async (params: ProductionProgressParams = {}): Promise<ProductionProgressPage> => {
    const res = await apiClient.get<ProductionProgressPage>('/production/admin/progress', {
      params: cleanParams(params),
    });
    return res.data;
  },

  /** GET /production/admin/anomalies */
  getAnomalies: async (period: ProductionPeriodParams): Promise<ProductionAnomalies> => {
    const res = await apiClient.get<ProductionAnomalies>('/production/admin/anomalies', {
      params: cleanParams(period),
    });
    return res.data;
  },

  /** GET /production/admin/export.csv, saved under the server's file name. */
  exportCsv: async (params: ProductionExportParams): Promise<void> => {
    try {
      const res = await apiClient.get('/production/admin/export.csv', {
        params: cleanParams(params),
        responseType: 'blob',
        timeout: 0,
      });
      saveBlob(
        asBlob(res.data, 'text/csv;charset=utf-8'),
        `production_${params.from}_${params.to}_${params.format ?? 'detail'}.csv`,
        res.headers as Record<string, unknown>,
      );
    } catch (error) {
      throw await blobError(error, 'Could not export the production log.');
    }
  },

  /** GET /production/admin/notices (`exhausted`: see ProductionNoticesParams) */
  getNotices: async (params: ProductionNoticesParams = {}): Promise<ProductionNoticePage> => {
    const res = await apiClient.get<ProductionNoticePage>('/production/admin/notices', {
      params: cleanParams(params),
    });
    return res.data;
  },

  /** POST /production/admin/notices/:id/retry */
  retryNotice: async (noticeId: string): Promise<ProductionNoticeView> => {
    const res = await apiClient.post<ProductionNoticeView>(
      `/production/admin/notices/${enc(noticeId)}/retry`,
    );
    return res.data;
  },
};
