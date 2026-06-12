'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { quotationPaymentPlanService } from '@/lib/api/quotation-payment-plan.service';
import { extractApiErrorMessage } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import { quotationKeys } from './use-quotations';
import { orderKeys } from './use-orders';
import type {
  AttachPackToQuotationDto,
  ConfigurePaymentPlanDto,
  Quotation,
  QuoteInstallment,
  QuoteStepBatch,
} from '@/lib/types';

export const paymentPlanKeys = {
  all: ['payment-plan'] as const,
  installments: (quotationId: string) =>
    [...paymentPlanKeys.all, 'installments', quotationId] as const,
  batches: (quotationId: string) =>
    [...paymentPlanKeys.all, 'batches', quotationId] as const,
};

const PLAN_STALE_TIME = 15_000;

export function useInstallments(
  quotationId: string,
  enabled = true,
): UseQueryResult<QuoteInstallment[], Error> {
  return useQuery({
    queryKey: paymentPlanKeys.installments(quotationId),
    queryFn: () => quotationPaymentPlanService.getInstallments(quotationId),
    enabled: enabled && !!quotationId,
    staleTime: PLAN_STALE_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

export function useStepBatches(
  quotationId: string,
  enabled = true,
): UseQueryResult<QuoteStepBatch[], Error> {
  return useQuery({
    queryKey: paymentPlanKeys.batches(quotationId),
    queryFn: () => quotationPaymentPlanService.getStepBatches(quotationId),
    enabled: enabled && !!quotationId,
    staleTime: PLAN_STALE_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

/**
 * After ANY mutation we wipe the quote-specific caches AND the related
 * order caches because the order status moves alongside the quote
 * (e.g. attach-pack → still draft, approve pack-quote → payment_plan_selected,
 * deliverBatch → may bump the order forward).
 */
function invalidatePaymentPlan(
  queryClient: ReturnType<typeof useQueryClient>,
  quote: { id: string; orderId: string },
) {
  queryClient.invalidateQueries({
    queryKey: paymentPlanKeys.installments(quote.id),
  });
  queryClient.invalidateQueries({
    queryKey: paymentPlanKeys.batches(quote.id),
  });
  queryClient.invalidateQueries({ queryKey: quotationKeys.detail(quote.id) });
  queryClient.invalidateQueries({
    queryKey: quotationKeys.byOrder(quote.orderId),
  });
  queryClient.invalidateQueries({ queryKey: orderKeys.detail(quote.orderId) });
  queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
}

export function useAttachPackToQuotation(): UseMutationResult<
  Quotation,
  Error,
  { quotationId: string; dto: AttachPackToQuotationDto }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ quotationId, dto }) =>
      quotationPaymentPlanService.attachPack(quotationId, dto),
    onSuccess: (quote) => {
      invalidatePaymentPlan(queryClient, quote);
      toast.success(t('toasts.quotationPaymentPlan.packAttached'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useConfigurePaymentPlan(): UseMutationResult<
  Quotation,
  Error,
  { quotationId: string; dto: ConfigurePaymentPlanDto }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ quotationId, dto }) =>
      quotationPaymentPlanService.configurePaymentPlan(quotationId, dto),
    onSuccess: (quote) => {
      invalidatePaymentPlan(queryClient, quote);
      toast.success(t('toasts.quotationPaymentPlan.planConfigured'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useDeliverBatch(): UseMutationResult<
  QuoteStepBatch,
  Error,
  { quotationId: string; orderId: string; batchId: string }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ quotationId, batchId }) =>
      quotationPaymentPlanService.deliverBatch(quotationId, batchId),
    onSuccess: (_batch, { quotationId, orderId }) => {
      invalidatePaymentPlan(queryClient, { id: quotationId, orderId });
      toast.success(t('toasts.quotationPaymentPlan.batchDelivered'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}
