'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { quotationsService } from '@/lib/api/quotations.service';
import { classifyApiError } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import { orderKeys } from './use-orders';
import { supplementalErrorMessage } from './use-supplemental-orders';
import type { DevisLanguage, Quotation, UpsertQuotationDto } from '@/lib/types';

export const quotationKeys = {
  all: ['quotations'] as const,
  byOrder: (orderId: string) =>
    [...quotationKeys.all, 'order', orderId] as const,
  detail: (id: string) => [...quotationKeys.all, 'detail', id] as const,
};

const QUOTATION_STALE_TIME = 15_000;

/**
 * The payment-plan query prefix, written out instead of imported:
 * use-quotation-payment-plan.ts imports this file (its
 * paymentPlanKeys.all is the same literal).
 */
const PAYMENT_PLAN_PREFIX = ['payment-plan'] as const;

type Translate = ReturnType<typeof useT>['t'];

/** Refusals of a quote edit / re-plan the editor explains in its own words. */
export const QUOTE_ERROR_CODES = [
  'QUOTE_TOTAL_BELOW_PAID',
  'QUOTE_PAYMENT_IN_FLIGHT',
  'QUOTE_PLAN_REQUIRED',
  // Delete / recall / pack change once money was received.
  'QUOTE_PAYMENT_RECEIVED',
  // Edit of a declined quote.
  'QUOTE_NOT_EDITABLE',
  // Pack change or re-plan that would delete an open installment whose
  // step batch an admin released by hand (spec §3, manual unlock).
  'QUOTE_PLAN_BATCH_RELEASED',
] as const;
export type QuoteErrorCode = (typeof QUOTE_ERROR_CODES)[number];

/** The quote error code a failed request carries, if any. */
export function quoteErrorCode(error: unknown): QuoteErrorCode | null {
  const info = classifyApiError(error);
  const byCode = QUOTE_ERROR_CODES.find((code) => code === info.errorCode);
  if (byCode) return byCode;
  // A refusal thrown without the error envelope keeps the code in its text.
  const message = info.serverMessage ?? '';
  return QUOTE_ERROR_CODES.find((code) => message.includes(code)) ?? null;
}

/** A known code gets the dictionary's explanation; anything else the API's words. */
export function quoteErrorMessage(error: unknown, t: Translate): string {
  const code = quoteErrorCode(error);
  return code ? t(`quoteEditor.errors.${code}`) : classifyApiError(error).message;
}

/** A conflict is an explanation, not a glitch: it stays on screen longer. */
export function toastQuoteError(error: unknown, t: Translate): void {
  const conflict = classifyApiError(error).status === 409;
  toast.error(quoteErrorMessage(error, t), conflict ? { duration: 9000 } : undefined);
}

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
  quote: Pick<Quotation, 'id' | 'orderId'>,
) {
  queryClient.invalidateQueries({ queryKey: quotationKeys.byOrder(quote.orderId) });
  queryClient.invalidateQueries({ queryKey: quotationKeys.detail(quote.id) });
  // A total change rebalances the unpaid installments server-side, and a
  // recall or a delete changes what can be paid: refetch the plan too.
  queryClient.invalidateQueries({
    queryKey: [...PAYMENT_PLAN_PREFIX, 'installments', quote.id],
  });
  queryClient.invalidateQueries({
    queryKey: [...PAYMENT_PLAN_PREFIX, 'batches', quote.id],
  });
  queryClient.invalidateQueries({ queryKey: orderKeys.detail(quote.orderId) });
  queryClient.invalidateQueries({ queryKey: orderKeys.history(quote.orderId) });
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
    // A supplemental request may be refused by code (not quotable / no
    // plan for its kind): show the translated reason.
    onError: (err) => toast.error(supplementalErrorMessage(err, t)),
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
    onError: (err) => toastQuoteError(err, t),
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
    onError: (err) => toastQuoteError(err, t),
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
    onError: (err) => toastQuoteError(err, t),
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
    // The cancel endpoint deletes the quote; allowed while nothing was
    // received and no payment is in progress (`quote.canDelete`).
    mutationFn: ({ id }) => quotationsService.cancel(id),
    onSuccess: (_data, { id, orderId }) => {
      invalidateQuotation(queryClient, { id, orderId });
      toast.success(t('quoteEditor.deletedToast'));
    },
    onError: (err) => toastQuoteError(err, t),
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
    onError: (err) => toastQuoteError(err, t),
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
    onError: (err) => toastQuoteError(err, t),
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
    onError: (err) => toastQuoteError(err, t),
  });
}
