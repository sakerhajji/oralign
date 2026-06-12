'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { quotationsService } from '@/lib/api/quotations.service';
import { extractApiErrorMessage } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import { orderKeys } from './use-orders';
import type { DevisLanguage, Quotation, UpsertQuotationDto } from '@/lib/types';

export const quotationKeys = {
  all: ['quotations'] as const,
  byOrder: (orderId: string) =>
    [...quotationKeys.all, 'order', orderId] as const,
  detail: (id: string) => [...quotationKeys.all, 'detail', id] as const,
};

const QUOTATION_STALE_TIME = 15_000;

/** Order-scoped read. Returns null when no quote exists yet. */
export function useQuotationForOrder(
  orderId: string,
  enabled = true,
): UseQueryResult<Quotation | null, Error> {
  return useQuery({
    queryKey: quotationKeys.byOrder(orderId),
    queryFn: () => quotationsService.getForOrder(orderId),
    enabled: enabled && !!orderId,
    staleTime: QUOTATION_STALE_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
  });
}

/**
 * Invalidate every cache that mentions this quote / order — used by all
 * mutations. The order list shows status, the order detail page shows
 * the Quote tab, and the byOrder query backs the tab itself.
 */
function invalidateQuotation(
  queryClient: ReturnType<typeof useQueryClient>,
  quote: Quotation,
) {
  queryClient.invalidateQueries({ queryKey: quotationKeys.byOrder(quote.orderId) });
  queryClient.invalidateQueries({ queryKey: quotationKeys.detail(quote.id) });
  queryClient.invalidateQueries({ queryKey: orderKeys.detail(quote.orderId) });
  queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
}

export function useCreateQuotation(): UseMutationResult<
  Quotation,
  Error,
  { orderId: string; dto: UpsertQuotationDto }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ orderId, dto }) => quotationsService.create(orderId, dto),
    onSuccess: (quote) => {
      invalidateQuotation(queryClient, quote);
      toast.success(t('toasts.quotations.draftCreated'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useUpdateQuotation(): UseMutationResult<
  Quotation,
  Error,
  { id: string; dto: UpsertQuotationDto }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, dto }) => quotationsService.update(id, dto),
    onSuccess: (quote) => {
      invalidateQuotation(queryClient, quote);
      toast.success(t('toasts.quotations.updated'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useSendQuotation(): UseMutationResult<Quotation, Error, string> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id) => quotationsService.send(id),
    onSuccess: (quote) => {
      invalidateQuotation(queryClient, quote);
      toast.success(t('toasts.quotations.sent'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

/**
 * Render (or re-render) the quotation PDF in a given language.
 * Variables: `{ id, lang? }`. Omit `lang` to use whatever language is
 * already on the row — useful for the first render. Pass `lang` to
 * issue another language version on demand (admin re-send or doctor
 * "I want the EN copy").
 */
export function useGenerateQuotationPdf(): UseMutationResult<
  Quotation,
  Error,
  { id: string; lang?: DevisLanguage }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, lang }) => quotationsService.generatePdf(id, lang),
    onSuccess: (quote) => {
      invalidateQuotation(queryClient, quote);
      toast.success(t('toasts.quotations.pdfGenerated'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useCancelQuotation(): UseMutationResult<
  { id: string; canceled: true },
  Error,
  { id: string; orderId: string }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id }) => quotationsService.cancel(id),
    onSuccess: (_data, { orderId }) => {
      queryClient.invalidateQueries({
        queryKey: quotationKeys.byOrder(orderId),
      });
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      toast.success(t('toasts.quotations.canceled'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

/**
 * Recall a sent quotation back to draft so the admin can edit + resend.
 * The doctor receives an in-app "revision incoming" notification.
 * Reuses the same cache-invalidation set as send/update — the doctor's
 * order detail page should immediately reflect the new draft state.
 */
export function useRevertQuotationToDraft(): UseMutationResult<
  Quotation,
  Error,
  string
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id) => quotationsService.revertToDraft(id),
    onSuccess: (quote) => {
      invalidateQuotation(queryClient, quote);
      toast.success(t('toasts.quotations.recalled'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useApproveQuotation(): UseMutationResult<
  Quotation,
  Error,
  string
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id) => quotationsService.approve(id),
    onSuccess: (quote) => {
      invalidateQuotation(queryClient, quote);
      toast.success(t('toasts.quotations.approved'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useRejectQuotation(): UseMutationResult<
  Quotation,
  Error,
  { id: string; rejectionReason?: string }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, rejectionReason }) =>
      quotationsService.reject(id, rejectionReason),
    onSuccess: (quote) => {
      invalidateQuotation(queryClient, quote);
      toast.success(t('toasts.quotations.rejected'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}
