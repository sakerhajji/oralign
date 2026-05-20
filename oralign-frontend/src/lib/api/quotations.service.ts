import apiClient from './client';
import type { Quotation, UpsertQuotationDto } from '@/lib/types';

/**
 * Quotation API client. The doctor + admin both use these endpoints —
 * RBAC is enforced server-side. The PDF download URL is exposed as a
 * helper so the UI can build a `<a download>` link.
 */
export const quotationsService = {
  getForOrder: async (orderId: string): Promise<Quotation | null> => {
    const res = await apiClient.get<Quotation | null>(
      `/orders/${orderId}/quotation`,
    );
    return res.data;
  },

  create: async (
    orderId: string,
    dto: UpsertQuotationDto,
  ): Promise<Quotation> => {
    const res = await apiClient.post<Quotation>(
      `/orders/${orderId}/quotations`,
      dto,
    );
    return res.data;
  },

  update: async (id: string, dto: UpsertQuotationDto): Promise<Quotation> => {
    const res = await apiClient.put<Quotation>(`/quotations/${id}`, dto);
    return res.data;
  },

  send: async (id: string): Promise<Quotation> => {
    const res = await apiClient.post<Quotation>(`/quotations/${id}/send`, {});
    return res.data;
  },

  generatePdf: async (id: string): Promise<Quotation> => {
    const res = await apiClient.post<Quotation>(
      `/quotations/${id}/generate-pdf`,
      {},
    );
    return res.data;
  },

  cancel: async (id: string): Promise<{ id: string; canceled: true }> => {
    const res = await apiClient.post<{ id: string; canceled: true }>(
      `/quotations/${id}/cancel`,
      {},
    );
    return res.data;
  },

  approve: async (id: string): Promise<Quotation> => {
    const res = await apiClient.post<Quotation>(
      `/quotations/${id}/approve`,
      {},
    );
    return res.data;
  },

  reject: async (
    id: string,
    rejectionReason?: string,
  ): Promise<Quotation> => {
    const res = await apiClient.post<Quotation>(
      `/quotations/${id}/reject`,
      rejectionReason ? { rejectionReason } : {},
    );
    return res.data;
  },

  /**
   * Stream URL for the rendered PDF. The endpoint is RBAC-gated server
   * side. NOT suitable for a plain `<a href>` link — browsers don't
   * attach the localStorage Bearer token to plain anchor navigations,
   * so the request would arrive unauthenticated and 401. Use
   * `downloadPdf(id, fileName)` below for clicks; this URL is only
   * exposed for diagnostics / curl debugging.
   */
  pdfDownloadUrl: (id: string): string => {
    const base =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
    return `${base}/quotations/${id}/pdf`;
  },

  /**
   * Fetch the PDF through the authenticated axios client (so the
   * Bearer token + refresh-token interceptor both run), then trigger
   * a browser download via a Blob URL.
   *
   * This is the canonical way to download an auth-gated file in a
   * single-page app — `<a href>` would arrive at the server WITHOUT
   * the Authorization header and bounce on the JwtAuthGuard with
   * "Invalid or expired token".
   */
  downloadPdf: async (id: string, fileName: string): Promise<void> => {
    const res = await apiClient.get(`/quotations/${id}/pdf`, {
      // Important: tell axios this is a binary payload so the response
      // doesn't get coerced to a string and corrupted.
      responseType: 'blob',
    });
    const blob =
      res.data instanceof Blob
        ? res.data
        : new Blob([res.data as ArrayBuffer], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      // Some browsers require the element to be in the DOM to honour
      // a programmatic .click().
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      window.URL.revokeObjectURL(url);
    }
  },
};
