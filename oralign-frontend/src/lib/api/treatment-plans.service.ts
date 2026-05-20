import apiClient from './client';
import type {
  PublicTreatmentViewerPayload,
  TreatmentMessage,
  TreatmentPlan,
  TreatmentPlanReview,
  TreatmentAttachmentCategory,
} from '@/lib/types';

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
};
