'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { quotationPaymentPlanService } from '@/lib/api/quotation-payment-plan.service';
import { extractApiErrorMessage } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import { quotationKeys, toastQuoteError } from './use-quotations';
import { orderKeys } from './use-orders';
import { productionKeys } from './use-production';
import { invalidateProductionAdmin } from './use-production-admin';
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
  queryClient.invalidateQueries({ queryKey: orderKeys.history(quote.orderId) });
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
    onError: (err) => toastQuoteError(err, t),
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
    onError: (err) => toastQuoteError(err, t),
  });
}

/**
 * Admin « Débloquer la tranche » (POST …/step-batches/:batchId/unlock).
 * No toast here: the reason dialog owns the feedback (field errors, the
 * « déjà débloquée » case). Refreshes the quote panel, the order history
 * (the journal row) and the lab screens that read the release block.
 */
export function useUnlockBatch(): UseMutationResult<
  QuoteStepBatch,
  Error,
  { quotationId: string; orderId: string; batchId: string; reason: string }
> {
  const queryClient = useQueryClient();
  const refresh = (quotationId: string, orderId: string) => {
    invalidatePaymentPlan(queryClient, { id: quotationId, orderId });
    void queryClient.invalidateQueries({ queryKey: productionKeys.sheet(orderId) });
    void queryClient.invalidateQueries({ queryKey: productionKeys.queues() });
    void invalidateProductionAdmin(queryClient);
  };
  return useMutation({
    mutationFn: ({ quotationId, batchId, reason }) =>
      quotationPaymentPlanService.unlockBatch(quotationId, batchId, reason),
    onSuccess: (_batch, { quotationId, orderId }) => refresh(quotationId, orderId),
    // A 404 means the plan changed under the dialog: show the fresh one.
    onError: (_error, { quotationId, orderId }) => refresh(quotationId, orderId),
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
