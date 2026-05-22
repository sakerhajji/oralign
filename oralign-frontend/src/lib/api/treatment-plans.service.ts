import apiClient from './client';
import type {
  PublicTreatmentViewerPayload,
  TreatmentMessage,
  TreatmentPlan,
  TreatmentPlanIpr,
  TreatmentPlanReview,
  TreatmentAttachmentCategory,
  UpsertTreatmentPlanIprDto,
} from '@/lib/types';

/**
 * Extract a filename from a Content-Disposition header. Handles both
 * `filename="x.png"` and RFC 5987 `filename*=UTF-8''x.png` forms; falls
 * back to `null` if neither is present or readable. Kept local to this
 * file because it's only consumed by `fetchAttachmentBlobUrl`.
 */
function parseContentDispositionFilename(
  header: string | undefined,
): string | null {
  if (!header) return null;
  // RFC 5987 form wins when both are present — that's the canonical
  // UTF-8-aware version.
  const star = /filename\*\s*=\s*[^']*''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]).replace(/^"|"$/g, '');
    } catch {
      return star[1].replace(/^"|"$/g, '');
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  if (plain?.[1]) return plain[1];
  return null;
}

export const treatmentPlansService = {
  // ─── Plans ────────────────────────────────────────────────────────────────

  listByOrder: async (orderId: string): Promise<TreatmentPlan[]> => {
    const res = await apiClient.get<TreatmentPlan[]>(
      `/orders/${orderId}/treatment-plans`,
    );
    return res.data;
  },

  create: async (
    orderId: string,
    data: { name?: string; resultViewUrl?: string },
  ): Promise<TreatmentPlan> => {
    const res = await apiClient.post<TreatmentPlan>(
      `/orders/${orderId}/treatment-plans`,
      data,
    );
    return res.data;
  },

  getOne: async (id: string): Promise<TreatmentPlan> => {
    const res = await apiClient.get<TreatmentPlan>(`/treatment-plans/${id}`);
    return res.data;
  },

  getReview: async (id: string): Promise<TreatmentPlanReview> => {
    const res = await apiClient.get<TreatmentPlanReview>(
      `/treatment-plans/${id}/review`,
    );
    return res.data;
  },

  updateResultViewUrl: async (
    id: string,
    resultViewUrl: string,
  ): Promise<TreatmentPlan> => {
    const res = await apiClient.put<TreatmentPlan>(
      `/treatment-plans/${id}/result-view-url`,
      { resultViewUrl },
    );
    return res.data;
  },

  markReady: async (id: string): Promise<TreatmentPlan> => {
    const res = await apiClient.post<TreatmentPlan>(
      `/treatment-plans/${id}/mark-ready`,
      {},
    );
    return res.data;
  },

  approve: async (id: string): Promise<TreatmentPlan> => {
    const res = await apiClient.post<TreatmentPlan>(
      `/treatment-plans/${id}/approve`,
      {},
    );
    return res.data;
  },

  reject: async (id: string): Promise<TreatmentPlan> => {
    const res = await apiClient.post<TreatmentPlan>(
      `/treatment-plans/${id}/reject`,
      {},
    );
    return res.data;
  },

  generatePublicLink: async (
    id: string,
    validDays?: number,
  ): Promise<TreatmentPlan> => {
    const res = await apiClient.post<TreatmentPlan>(
      `/treatment-plans/${id}/generate-public-link`,
      { validDays },
    );
    return res.data;
  },

  // ─── Movement table image ────────────────────────────────────────────────

  uploadMovementTableImage: async (
    id: string,
    file: File,
  ): Promise<TreatmentPlan> => {
    const form = new FormData();
    form.append('file', file);
    // Let axios derive the multipart boundary — see users.service.ts
    // for the long explanation; tl;dr: hand-setting Content-Type strips
    // the boundary and the server can't parse the body.
    const res = await apiClient.post<TreatmentPlan>(
      `/treatment-plans/${id}/movement-table-image`,
      form,
    );
    return res.data;
  },

  deleteMovementTableImage: async (id: string): Promise<TreatmentPlan> => {
    const res = await apiClient.delete<TreatmentPlan>(
      `/treatment-plans/${id}/movement-table-image`,
    );
    return res.data;
  },

  movementTableImageUrl: (id: string): string => {
    const base =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
    return `${base}/treatment-plans/${id}/movement-table-image`;
  },

  // ─── Dental treatment table image ("traitement dentaire") ────────────────
  // Mirrors the movement-table trio above one-to-one. Kept separate
  // rather than parameterised because (a) it pairs naturally with the
  // distinct hook trio in use-treatment-plans.ts, and (b) the URL is a
  // distinct route on the backend so a search across the codebase
  // surfaces every call site.

  uploadDentalTreatmentTableImage: async (
    id: string,
    file: File,
  ): Promise<TreatmentPlan> => {
    const form = new FormData();
    form.append('file', file);
    const res = await apiClient.post<TreatmentPlan>(
      `/treatment-plans/${id}/dental-treatment-table-image`,
      form,
    );
    return res.data;
  },

  deleteDentalTreatmentTableImage: async (
    id: string,
  ): Promise<TreatmentPlan> => {
    const res = await apiClient.delete<TreatmentPlan>(
      `/treatment-plans/${id}/dental-treatment-table-image`,
    );
    return res.data;
  },

  dentalTreatmentTableImageUrl: (id: string): string => {
    const base =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
    return `${base}/treatment-plans/${id}/dental-treatment-table-image`;
  },

  // ─── Messages & attachments ──────────────────────────────────────────────

  listMessages: async (id: string): Promise<TreatmentMessage[]> => {
    const res = await apiClient.get<TreatmentMessage[]>(
      `/treatment-plans/${id}/messages`,
    );
    return res.data;
  },

  sendMessage: async (
    id: string,
    message: string,
  ): Promise<TreatmentMessage> => {
    const res = await apiClient.post<TreatmentMessage>(
      `/treatment-plans/${id}/messages`,
      { message },
    );
    return res.data;
  },

  sendMessageWithAttachments: async (
    id: string,
    args: {
      message?: string;
      files: File[];
      category?: TreatmentAttachmentCategory;
    },
  ): Promise<TreatmentMessage> => {
    const form = new FormData();
    if (args.message) form.append('message', args.message);
    for (const f of args.files) form.append('files', f);
    const res = await apiClient.post<TreatmentMessage>(
      `/treatment-plans/${id}/messages/with-attachments`,
      form,
      {
        // Axios auto-fills Content-Type with the right boundary when the
        // body is FormData. Don't override it.
        params: args.category ? { category: args.category } : undefined,
      },
    );
    return res.data;
  },

  attachmentDownloadUrl: (attachmentId: string): string => {
    const base =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
    return `${base}/treatment-message-attachments/${attachmentId}/download`;
  },

  /**
   * Fetch a chat attachment as a Blob using the authenticated axios client
   * (so the JWT travels in the Authorization header), and return an object
   * URL the caller can open.
   *
   * Why this exists: a plain `<a href={attachmentDownloadUrl(id)}>` sends
   * no Authorization header, so the backend's @CurrentUser guard returned
   * 401 and the browser silently navigated to a JSON error page. Pulling
   * the bytes here lets us authenticate the request and hand the UI a
   * `blob:` URL that opens cleanly in a new tab.
   *
   * The blob URL is created via `URL.createObjectURL`. Callers should
   * `URL.revokeObjectURL()` once they're done with it to free the blob
   * (we don't auto-revoke because the user may keep the tab open).
   */
  fetchAttachmentBlobUrl: async (attachmentId: string): Promise<{
    blobUrl: string;
    mimeType: string;
    fileName: string;
  }> => {
    const res = await apiClient.get<Blob>(
      `/treatment-message-attachments/${attachmentId}/download`,
      { responseType: 'blob' },
    );
    const mimeType = res.headers['content-type'] ?? 'application/octet-stream';
    // Try to recover the filename from Content-Disposition so the
    // downloaded blob keeps the user-facing name. Falls back to a
    // generic name so the link is always clickable.
    const disposition =
      res.headers['content-disposition'] ?? res.headers['Content-Disposition'];
    const fileName = parseContentDispositionFilename(disposition) ?? 'attachment';
    const blobUrl = URL.createObjectURL(res.data);
    return { blobUrl, mimeType, fileName };
  },

  deleteAttachment: async (
    attachmentId: string,
  ): Promise<{ id: string; deletedAt: string }> => {
    const res = await apiClient.delete(
      `/treatment-message-attachments/${attachmentId}`,
    );
    return res.data;
  },

  // ─── Public viewer (no auth) ──────────────────────────────────────────────
  // Uses a RAW fetch instead of the authenticated apiClient — the patient
  // visiting the share link is anonymous, and the apiClient's response
  // interceptor would redirect them to /login if a stale access token is
  // sitting in localStorage. The endpoint is `@Public()` server-side,
  // rate-limited, and only returns display-safe fields.

  publicByToken: async (
    token: string,
  ): Promise<PublicTreatmentViewerPayload> => {
    const base =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
    const res = await fetch(
      `${base}/public/treatment-viewer/${encodeURIComponent(token)}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'omit',
      },
    );
    if (!res.ok) {
      throw new Error(`Public viewer fetch failed: HTTP ${res.status}`);
    }
    return (await res.json()) as PublicTreatmentViewerPayload;
  },

  // ─── IPR / stripping (per treatment plan) ───────────────────────────
  // Separate from the order's tooth instructions because IPR is a
  // between-tooth CONTACT property — its own table, its own endpoints.
  // Writes go through PUT (upsert) so re-saving the same contact never
  // throws P2002.

  listIpr: async (planId: string): Promise<TreatmentPlanIpr[]> => {
    const res = await apiClient.get<TreatmentPlanIpr[]>(
      `/treatment-plans/${planId}/iprs`,
    );
    return res.data;
  },

  upsertIpr: async (
    planId: string,
    dto: UpsertTreatmentPlanIprDto,
  ): Promise<TreatmentPlanIpr> => {
    const res = await apiClient.put<TreatmentPlanIpr>(
      `/treatment-plans/${planId}/iprs`,
      dto,
    );
    return res.data;
  },

  removeIpr: async (
    planId: string,
    fromTooth: number,
    toTooth: number,
  ): Promise<{ deleted: boolean }> => {
    const res = await apiClient.delete<{ deleted: boolean }>(
      `/treatment-plans/${planId}/iprs/${fromTooth}/${toTooth}`,
    );
    return res.data;
  },
};
