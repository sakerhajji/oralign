'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminInvoicesService } from '@/lib/api/admin-invoices.service';
import { extractApiErrorMessage, toastMutationError } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import type {
  CreateInvoiceInput,
  Invoice,
  InvoiceClientMatch,
  InvoiceFilters,
  InvoiceSummary,
  PaginatedResponse,
  UpdateInvoiceInput,
} from '@/lib/types';

export const invoiceKeys = {
  all: ['admin-invoices'] as const,
  lists: () => [...invoiceKeys.all, 'list'] as const,
  list: (filters: InvoiceFilters) => [...invoiceKeys.lists(), filters] as const,
  summary: (filters: InvoiceFilters) =>
    [...invoiceKeys.all, 'summary', filters] as const,
  details: () => [...invoiceKeys.all, 'detail'] as const,
  detail: (id: string) => [...invoiceKeys.details(), id] as const,
  clients: (search: string) => [...invoiceKeys.all, 'clients', search] as const,
};

/**
 * One invalidation for the whole desk: the list, the period summary and
 * any open detail all move together after a write.
 */
function invalidateInvoices(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
}

export function useInvoices(
  filters: InvoiceFilters = {},
  enabled = true,
): UseQueryResult<PaginatedResponse<Invoice>, Error> {
  return useQuery({
    queryKey: invoiceKeys.list(filters),
    queryFn: () => adminInvoicesService.list(filters),
    enabled,
    staleTime: 10_000,
    // Keep the current page on screen while the next one loads — no
    // spinner flash when paging or switching a filter.
    placeholderData: (previous) => previous,
  });
}

export function useInvoiceSummary(
  filters: InvoiceFilters = {},
  enabled = true,
): UseQueryResult<InvoiceSummary, Error> {
  return useQuery({
    queryKey: invoiceKeys.summary(filters),
    queryFn: () => adminInvoicesService.summary(filters),
    enabled,
    staleTime: 10_000,
    placeholderData: (previous) => previous,
  });
}

export function useInvoice(id?: string): UseQueryResult<Invoice, Error> {
  return useQuery({
    queryKey: invoiceKeys.detail(id ?? ''),
    queryFn: () => adminInvoicesService.getById(id ?? ''),
    enabled: Boolean(id),
    staleTime: 5_000,
  });
}

/**
 * Client lookup for the create form. Debounce lives in the component;
 * the backend already ignores anything shorter than 2 characters.
 */
export function useInvoiceClientSearch(
  search: string,
): UseQueryResult<InvoiceClientMatch[], Error> {
  return useQuery({
    queryKey: invoiceKeys.clients(search),
    queryFn: () => adminInvoicesService.findClients(search),
    enabled: search.trim().length >= 2,
    staleTime: 30_000,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (input: CreateInvoiceInput) => adminInvoicesService.create(input),
    onSuccess: (invoice) => {
      invalidateInvoices(queryClient);
      toast.success(t('invoicesAdmin.toastCreated', { number: invoice.invoiceNumber }));
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateInvoiceInput }) =>
      adminInvoicesService.update(id, input),
    onSuccess: (invoice) => {
      queryClient.setQueryData(invoiceKeys.detail(invoice.id), invoice);
      invalidateInvoices(queryClient);
      toast.success(t('invoicesAdmin.toastUpdated'));
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useArchiveInvoice() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id: string) => adminInvoicesService.archive(id),
    onSuccess: () => {
      invalidateInvoices(queryClient);
      toast.success(t('invoicesAdmin.toastArchived'));
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useRestoreInvoice() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id: string) => adminInvoicesService.restore(id),
    onSuccess: () => {
      invalidateInvoices(queryClient);
      toast.success(t('invoicesAdmin.toastRestored'));
    },
    onError: (err) => toastMutationError(err),
  });
}

/**
 * Refused with 409 for anything ever issued — the backend is the
 * authority and its explanation is what the toast shows.
 */
export function usePermanentDeleteInvoice() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id: string) => adminInvoicesService.permanentDelete(id),
    onSuccess: () => {
      invalidateInvoices(queryClient);
      toast.success(t('invoicesAdmin.toastPermanentlyDeleted'));
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useBulkArchiveInvoices() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (ids: string[]) => adminInvoicesService.bulkArchive(ids),
    onSuccess: (res) => {
      invalidateInvoices(queryClient);
      toast.success(t('invoicesAdmin.toastBulkArchived', { count: res.archived }));
    },
    onError: (err) => toastMutationError(err),
  });
}

// ── Downloads: mutations so the buttons get isPending for free ────────

export function useDownloadInvoicePdf() {
  return useMutation({
    mutationFn: ({ id, invoiceNumber }: { id: string; invoiceNumber: string }) =>
      adminInvoicesService.downloadPdf(id, invoiceNumber),
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useExportInvoicesCsv() {
  const { t } = useT();
  return useMutation({
    mutationFn: (filters: InvoiceFilters) => adminInvoicesService.exportCsv(filters),
    onSuccess: () => toast.success(t('invoicesAdmin.toastExported')),
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useExportInvoicesZip() {
  const { t } = useT();
  return useMutation({
    mutationFn: (ids: string[]) => adminInvoicesService.exportZip(ids),
    onSuccess: () => toast.success(t('invoicesAdmin.toastExported')),
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}
