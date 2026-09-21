'use client';

import { useCallback } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { alignerDeliveriesService } from '@/lib/api/aligner-deliveries.service';
import { extractApiError, toastMutationError } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import {
  ALIGNER_DELIVERY_ERROR_CODES,
  type AlignerDeliveryErrorCode,
  type AlignerDeliverySummary,
  type RecordAlignerDeliveryInput,
} from '@/lib/types/aligner-delivery';
import { orderKeys } from './use-orders';

export const alignerDeliveryKeys = {
  /**
   * Nested under the order's detail key, so anything that invalidates the
   * order (status change, edit…) refreshes its delivery summary too.
   */
  summary: (orderId: string) =>
    [...orderKeys.detail(orderId), 'aligner-deliveries'] as const,
};

export function useAlignerDeliveries(
  orderId?: string,
): UseQueryResult<AlignerDeliverySummary, Error> {
  return useQuery({
    queryKey: alignerDeliveryKeys.summary(orderId ?? ''),
    queryFn: () => alignerDeliveriesService.getSummary(orderId ?? ''),
    enabled: !!orderId,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
}

function isDeliveryErrorCode(code: string | null): code is AlignerDeliveryErrorCode {
  return (ALIGNER_DELIVERY_ERROR_CODES as readonly string[]).includes(code ?? '');
}

/**
 * Surface a failed delivery write in the UI language. The backend's
 * business errors carry a stable errorCode, mapped to a localized
 * sentence; anything else falls back to the shared toastMutationError.
 *
 * A 409 means the log moved under us (another delivery was recorded
 * meanwhile): the summary is refetched, so the still-open form re-runs
 * its pre-check against fresh data and names the exact clash inline —
 * in the user's language, unlike the server's English message.
 */
function useDeliveryErrorHandler(orderId: string) {
  const { t } = useT();
  const queryClient = useQueryClient();
  return useCallback(
    (error: unknown) => {
      const info = extractApiError(error);
      if (info.status === 409) {
        queryClient.invalidateQueries({
          queryKey: alignerDeliveryKeys.summary(orderId),
        });
      }
      if (!isDeliveryErrorCode(info.errorCode)) {
        toastMutationError(error);
        return;
      }
      toast.error(t(`alignerDeliveries.errors.${info.errorCode}`), {
        duration: info.status === 409 ? 9000 : undefined,
      });
    },
    [orderId, queryClient, t],
  );
}

export function useRecordAlignerDelivery(orderId: string) {
  const queryClient = useQueryClient();
  const { t } = useT();
  const onError = useDeliveryErrorHandler(orderId);
  return useMutation({
    mutationFn: (input: RecordAlignerDeliveryInput) =>
      alignerDeliveriesService.record(orderId, input),
    onSuccess: (summary, input) => {
      // The response IS the fresh summary — no refetch round-trip.
      queryClient.setQueryData(alignerDeliveryKeys.summary(orderId), summary);
      toast.success(
        t('alignerDeliveries.toasts.recorded', {
          from: input.fromAligner,
          to: input.toAligner,
        }),
      );
    },
    onError,
  });
}

export function useUpdateAlignerTotal(orderId: string) {
  const queryClient = useQueryClient();
  const { t } = useT();
  const onError = useDeliveryErrorHandler(orderId);
  return useMutation({
    mutationFn: (totalAligners: number) =>
      alignerDeliveriesService.setTotal(orderId, totalAligners),
    onSuccess: (summary) => {
      queryClient.setQueryData(alignerDeliveryKeys.summary(orderId), summary);
      toast.success(
        t('alignerDeliveries.toasts.totalUpdated', {
          total: summary.totalAligners ?? '',
        }),
      );
    },
    onError,
  });
}
