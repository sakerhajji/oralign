import apiClient from './client';

/**
 * Bilingual (FR/EN) payment-receipt API client.
 *
 * Mirrors `quotationsService.downloadQuotationPdf` — the endpoint is
 * RBAC-gated server-side, so we go through the authenticated axios
 * client (which carries the Bearer token + refresh-token interceptor)
 * rather than a plain `<a href>` that would bounce on the
 * JwtAuthGuard.
 *
 * The caller (a button in the payment history) is responsible for
 * turning the returned Blob into a download (createObjectURL +
 * anchor.click). We hand back the raw Blob here so the same call site
 * can either save the file OR preview it in a new tab.
 */
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

export const invoicesService = {
  /**
   * Doctor or admin fetches the invoice PDF blob for a given payment.
   * `lang` is the dashboard's current language — pass `'en' | 'fr'`
   * straight through from the i18n context. The backend will use it
   * to render the localised receipt; if anything else is passed
   * (or undefined), the backend falls back to the quote's snapshot
   * language and then French.
   *
   * @throws Error with a human-readable message extracted from the
   *         JSON error body (the server wraps blob responses in a
   *         JSON envelope on failure).
   */
  async downloadInvoice(paymentId: string, lang: 'en' | 'fr'): Promise<Blob> {
    try {
      const res = await apiClient.get(`/payments/${paymentId}/invoice`, {
        // Tell axios the response is binary so it doesn't get coerced
        // to a string and corrupted on the way through.
        responseType: 'blob',
        params: { lang },
      });
      return res.data instanceof Blob
        ? res.data
        : new Blob([res.data as ArrayBuffer], { type: 'application/pdf' });
    } catch (error) {
      const message = await extractBlobErrorMessage(error);
      throw new Error(message ?? 'Could not download the invoice PDF.');
    }
  },
};
