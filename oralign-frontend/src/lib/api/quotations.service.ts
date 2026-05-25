import apiClient from './client';
import type { DevisLanguage, Quotation, UpsertQuotationDto } from '@/lib/types';

function parseContentDispositionFilename(
  header: string | undefined,
): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*[^']*''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]).replace(/^"|"$/g, '');
    } catch {
      return star[1].replace(/^"|"$/g, '');
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain?.[1] ?? null;
}

function safePdfFileName(input: string): string {
  const base =
    input
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^[._-]+|[._-]+$/g, '')
      .slice(0, 120) || 'quotation';

  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

async function extractBlobErrorMessage(error: unknown): Promise<string | null> {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'data' in error.response &&
    error.response.data instanceof Blob
  ) {
    const text = await error.response.data.text();
    if (!text) return null;
    try {
      const parsed = JSON.parse(text) as { message?: string | string[] };
      if (Array.isArray(parsed.message)) return parsed.message[0] ?? null;
      return parsed.message ?? null;
    } catch {
      return text;
    }
  }
  return null;
}

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

  /**
   * Regenerate the quotation PDF. Both admins and the owning dentist
   * can call this — the admin uses it to issue the first PDF or
   * switch the document language; the dentist uses it to request
   * another version in their own language (FR/EN/AR). Backend
   * persists the chosen language on the row so subsequent downloads
   * stay consistent.
   */
  generatePdf: async (
    id: string,
    lang?: DevisLanguage,
  ): Promise<Quotation> => {
    const res = await apiClient.post<Quotation>(
      `/quotations/${id}/generate-pdf`,
      {},
      lang ? { params: { lang } } : undefined,
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

  /**
   * Recall a SENT quote back to draft so the admin can correct it
   * (wrong pack, wrong fees, wrong language, typo, …). The backend:
   *   • flips quote.status: sent → draft
   *   • snaps the order back to `treatment_approved`
   *   • notifies the doctor that a revision is incoming
   *
   * The admin then edits and re-sends like any draft.
   */
  revertToDraft: async (id: string): Promise<Quotation> => {
    const res = await apiClient.post<Quotation>(
      `/quotations/${id}/revert-to-draft`,
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
    let res;
    try {
      res = await apiClient.get(`/quotations/${id}/pdf`, {
        // Important: tell axios this is a binary payload so the response
        // doesn't get coerced to a string and corrupted.
        responseType: 'blob',
      });
    } catch (error) {
      const message = await extractBlobErrorMessage(error);
      throw new Error(message ?? 'Could not download the quotation PDF.');
    }
    const blob =
      res.data instanceof Blob
        ? res.data
        : new Blob([res.data as ArrayBuffer], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      const headerFileName = parseContentDispositionFilename(
        res.headers['content-disposition'] ??
          res.headers['Content-Disposition'],
      );
      anchor.download = safePdfFileName(headerFileName ?? fileName);
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
