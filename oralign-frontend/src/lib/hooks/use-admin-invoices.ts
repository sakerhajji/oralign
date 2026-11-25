'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { adminInvoicesService } from '@/lib/api/admin-invoices.service';
import { extractApiError, extractApiErrorMessage, toastMutationError } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import type {
  CreateInvoiceInput,
  Invoice,
  InvoiceAccountingSummary,
  InvoiceClientMatch,
  InvoiceFilters,
  InvoicePeriodParams,
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
  // Under `all`: every invoice write refreshes the accountant's figures too.
  accounting: (period: InvoicePeriodParams) =>
    [...invoiceKeys.all, 'accounting', period] as const,
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

/**
 * The récapitulatif comptable of a period. The previous period's figures
 * stay on screen while the next one loads (`isPlaceholderData`), so
 * switching presets never collapses the layout.
 */
export function useInvoiceAccountingSummary(
  period: InvoicePeriodParams,
  enabled = true,
): UseQueryResult<InvoiceAccountingSummary, Error> {
  return useQuery({
    queryKey: invoiceKeys.accounting(period),
    queryFn: () => adminInvoicesService.accountingSummary(period),
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

/** Send (or re-send) the invoice PDF to the practitioner by e-mail. */
/**
 * The API's refusals of an invoice e-mail, by errorCode. They answer 422
 * (never 502/503, which the classifier reads as "the server restarts"),
 * so the server's message would reach the toast, but it is written in
 * English: a known one gets the desk's own words. None clears on a retry.
 */
const EMAIL_INVOICE_ERRORS: Record<string, string> = {
  INVOICE_NO_RECIPIENT: 'invoicesAdmin.emailErrors.noRecipient',
  MAIL_NOT_CONFIGURED: 'invoicesAdmin.emailErrors.notConfigured',
  MAIL_SEND_FAILED: 'invoicesAdmin.emailErrors.sendFailed',
};

export function useEmailInvoice() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id: string) => adminInvoicesService.sendEmail(id),
    onSuccess: ({ emailedTo }) => {
      invalidateInvoices(queryClient);
      toast.success(t('invoicesAdmin.toastEmailed', { email: emailedTo }));
    },
    onError: (err) => {
      const { errorCode } = extractApiError(err);
      const key = errorCode ? EMAIL_INVOICE_ERRORS[errorCode] : undefined;
      if (key) {
        toast.error(t(key), { duration: 9000 });
        return;
      }
      toastMutationError(err);
    },
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

/** Every issued, paid and cancelled invoice of a period, as one ZIP. */
export function useExportPeriodZip() {
  const { t } = useT();
  return useMutation({
    mutationFn: (period: InvoicePeriodParams) => adminInvoicesService.exportPeriodZip(period),
    onSuccess: () => toast.success(t('invoicesAdmin.toastExported')),
    // A 400 here says why (more than 1000 invoices): it stays readable.
    onError: (err) => toast.error(extractApiErrorMessage(err), { duration: 9000 }),
  });
}

/** The récapitulatif comptable of a period, as a PDF in the page's language. */
export function useDownloadAccountingPdf() {
  const { t } = useT();
  return useMutation({
    mutationFn: ({ period, language }: { period: InvoicePeriodParams; language: 'fr' | 'en' }) =>
      adminInvoicesService.downloadAccountingPdf(period, language),
    onSuccess: () => toast.success(t('invoicesAdmin.toastExported')),
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}
