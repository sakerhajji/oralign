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
import { orderKeys } from './use-orders';
import type { Quotation, UpsertQuotationDto } from '@/lib/types';

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
  return useMutation({
    mutationFn: ({ orderId, dto }) => quotationsService.create(orderId, dto),
    onSuccess: (quote) => {
      invalidateQuotation(queryClient, quote);
      toast.success('Quotation draft created.');
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
  return useMutation({
    mutationFn: ({ id, dto }) => quotationsService.update(id, dto),
    onSuccess: (quote) => {
      invalidateQuotation(queryClient, quote);
      toast.success('Quotation updated.');
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useSendQuotation(): UseMutationResult<Quotation, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => quotationsService.send(id),
    onSuccess: (quote) => {
      invalidateQuotation(queryClient, quote);
      toast.success('Quotation sent to the doctor.');
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useGenerateQuotationPdf(): UseMutationResult<
  Quotation,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => quotationsService.generatePdf(id),
    onSuccess: (quote) => {
      invalidateQuotation(queryClient, quote);
      toast.success('Quotation PDF generated.');
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
  return useMutation({
    mutationFn: ({ id }) => quotationsService.cancel(id),
    onSuccess: (_data, { orderId }) => {
      queryClient.invalidateQueries({
        queryKey: quotationKeys.byOrder(orderId),
      });
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      toast.success('Quotation canceled. You can issue a new one now.');
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
  return useMutation({
    mutationFn: (id) => quotationsService.approve(id),
    onSuccess: (quote) => {
      invalidateQuotation(queryClient, quote);
      toast.success('Quotation approved.');
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
  return useMutation({
    mutationFn: ({ id, rejectionReason }) =>
      quotationsService.reject(id, rejectionReason),
    onSuccess: (quote) => {
      invalidateQuotation(queryClient, quote);
      toast.success('Quotation rejected.');
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}
