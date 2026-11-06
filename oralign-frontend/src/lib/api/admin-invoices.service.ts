import apiClient from './client';
import { asBlob, blobError, saveBlob } from './blob-download';
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

  /**
   * The PDF as a Blob, for on-screen preview. Same endpoint as the
   * download — the file is auth-gated, so an `<iframe src>` pointed at
   * the API would arrive without the Authorization header.
   */
  fetchPdfBlob: async (id: string): Promise<Blob> => {
    try {
      const res = await apiClient.get(`/admin/invoices/${id}/pdf`, {
        responseType: 'blob',
      });
      return asBlob(res.data, 'application/pdf');
    } catch (error) {
      throw await blobError(error, 'Could not load the invoice PDF.');
    }
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
