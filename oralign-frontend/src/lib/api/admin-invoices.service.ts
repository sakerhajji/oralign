import apiClient from './client';
import type {
  CreateInvoiceInput,
  Invoice,
  InvoiceClientMatch,
  InvoiceFilters,
  InvoiceSummary,
  PaginatedResponse,
  UpdateInvoiceInput,
} from '@/lib/types';

/**
 * Admin invoicing desk.
 *
 * Kept separate from `invoices.service.ts`, which serves the ORIGINAL
 * payment-receipt downloads — that flow is untouched and this one has a
 * different surface (CRUD + exports) and a different RBAC (admin only).
 */

/**
 * Trigger a browser download from an authenticated response. `<a href>`
 * cannot be used: the request would reach the API without the
 * Authorization header and bounce on the JwtAuthGuard.
 */
function saveBlob(
  blob: Blob,
  fallbackName: string,
  headers: Record<string, unknown>,
): void {
  const disposition = String(
    headers['content-disposition'] ?? headers['Content-Disposition'] ?? '',
  );
  // RFC 5987 `filename*=UTF-8''…` wins over the ASCII fallback, so an
  // accented client name survives the round trip.
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  let name = fallbackName;
  if (utf8) {
    try {
      name = decodeURIComponent(utf8[1]);
    } catch {
      name = plain?.[1] ?? fallbackName;
    }
  } else if (plain) {
    name = plain[1];
  }

  const url = window.URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name.replace(/[\\/:*?"<>|]/g, '_');
    // Some browsers only honour a programmatic click on a mounted node.
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.URL.revokeObjectURL(url);
  }
}

function asBlob(data: unknown, type: string): Blob {
  return data instanceof Blob ? data : new Blob([data as BlobPart], { type });
}

/**
 * An error thrown on a `responseType: 'blob'` request carries its JSON
 * body as a Blob, so the usual message extraction reads empty. Unwrap it
 * so a 409 explanation still reaches the toast.
 */
async function blobError(error: unknown, fallback: string): Promise<Error> {
  const response = (error as { response?: { data?: unknown } })?.response;
  if (response?.data instanceof Blob) {
    try {
      const text = await response.data.text();
      const parsed = JSON.parse(text) as { message?: string | string[] };
      const message = Array.isArray(parsed.message)
        ? parsed.message[0]
        : parsed.message;
      if (message) return new Error(message);
    } catch {
      // Not JSON — fall through to the generic message.
    }
  }
  return error instanceof Error ? error : new Error(fallback);
}

/** Drop empty values so the API never sees `?search=` or `?statuses=`. */
function cleanParams(filters: InvoiceFilters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      out[key] = value.join(',');
      continue;
    }
    out[key] = value;
  }
  return out;
}

export const adminInvoicesService = {
  list: async (filters: InvoiceFilters = {}): Promise<PaginatedResponse<Invoice>> => {
    const res = await apiClient.get<PaginatedResponse<Invoice>>('/admin/invoices', {
      params: cleanParams(filters),
    });
    return res.data;
  },

  /** Totals across the WHOLE filter — what the period header shows. */
  summary: async (filters: InvoiceFilters = {}): Promise<InvoiceSummary> => {
    const res = await apiClient.get<InvoiceSummary>('/admin/invoices/summary', {
      params: cleanParams(filters),
    });
    return res.data;
  },

  getById: async (id: string): Promise<Invoice> => {
    const res = await apiClient.get<Invoice>(`/admin/invoices/${id}`);
    return res.data;
  },

  /** Existing patients + their orders, to prefill the create form. */
  findClients: async (search: string): Promise<InvoiceClientMatch[]> => {
    const res = await apiClient.get<{ data: InvoiceClientMatch[] }>(
      '/admin/invoices/clients',
      { params: { search } },
    );
    return res.data.data;
  },

  create: async (input: CreateInvoiceInput): Promise<Invoice> => {
    const res = await apiClient.post<Invoice>('/admin/invoices', input);
    return res.data;
  },

  update: async (id: string, input: UpdateInvoiceInput): Promise<Invoice> => {
    const res = await apiClient.patch<Invoice>(`/admin/invoices/${id}`, input);
    return res.data;
  },

  // Deletion lifecycle: archive -> restore -> permanent.
  archive: async (id: string): Promise<{ id: string }> => {
    const res = await apiClient.delete<{ id: string }>(`/admin/invoices/${id}`);
    return res.data;
  },

  restore: async (id: string): Promise<Invoice> => {
    const res = await apiClient.patch<Invoice>(`/admin/invoices/${id}/restore`);
    return res.data;
  },

  permanentDelete: async (id: string): Promise<{ message: string }> => {
    const res = await apiClient.delete<{ message: string }>(
      `/admin/invoices/${id}/permanent`,
    );
    return res.data;
  },

  bulkArchive: async (ids: string[]): Promise<{ archived: number }> => {
    const res = await apiClient.post<{ archived: number }>(
      '/admin/invoices/bulk/archive',
      { ids },
    );
    return res.data;
  },

  downloadPdf: async (id: string, invoiceNumber: string): Promise<void> => {
    try {
      const res = await apiClient.get(`/admin/invoices/${id}/pdf`, {
        responseType: 'blob',
      });
      saveBlob(
        asBlob(res.data, 'application/pdf'),
        `${invoiceNumber}.pdf`,
        res.headers as Record<string, unknown>,
      );
    } catch (error) {
      throw await blobError(error, 'Could not download the invoice PDF.');
    }
  },

  /** CSV of the whole filtered period, not just the current page. */
  exportCsv: async (filters: InvoiceFilters): Promise<void> => {
    try {
      const res = await apiClient.get('/admin/invoices/export/csv', {
        params: cleanParams(filters),
        responseType: 'blob',
      });
      saveBlob(
        asBlob(res.data, 'text/csv;charset=utf-8'),
        'factures.csv',
        res.headers as Record<string, unknown>,
      );
    } catch (error) {
      throw await blobError(error, 'Could not export the invoices.');
    }
  },

  /** ZIP of the selected invoices' PDFs — the accountant's parcel. */
  exportZip: async (ids: string[]): Promise<void> => {
    try {
      const res = await apiClient.post(
        '/admin/invoices/export/zip',
        { ids },
        { responseType: 'blob' },
      );
      saveBlob(
        asBlob(res.data, 'application/zip'),
        'factures.zip',
        res.headers as Record<string, unknown>,
      );
    } catch (error) {
      throw await blobError(error, 'Could not export the selected invoices.');
    }
  },
};
