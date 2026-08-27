'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { loyaltyService } from '@/lib/api/loyalty.service';
import { toastMutationError } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import type { LoyaltyTierInput } from '@/lib/types/loyalty';

export const loyaltyKeys = {
  all: ['loyalty'] as const,
  overview: () => [...loyaltyKeys.all, 'overview'] as const,
  tiers: () => [...loyaltyKeys.all, 'tiers'] as const,
};

function invalidateLoyalty(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: loyaltyKeys.all });
}

export function useLoyaltyOverview(enabled = true) {
  return useQuery({
    queryKey: loyaltyKeys.overview(),
    queryFn: () => loyaltyService.getOverview(),
    enabled,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

export function useLoyaltyTiers(enabled = true) {
  return useQuery({
    queryKey: loyaltyKeys.tiers(),
    queryFn: () => loyaltyService.listTiers(),
    enabled,
    staleTime: 60_000,
  });
}

export function useUpdateLoyaltyTiers() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (tiers: LoyaltyTierInput[]) => loyaltyService.updateTiers(tiers),
    onSuccess: () => {
      invalidateLoyalty(queryClient);
      toast.success(t('toasts.loyalty.tiersUpdated'));
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useRecomputeLoyalty() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: () => loyaltyService.recompute(),
    onSuccess: (res) => {
      invalidateLoyalty(queryClient);
      toast.success(t('toasts.loyalty.recomputed', { quarter: res.closed }));
    },
    onError: (err) => toastMutationError(err),
  });
}
