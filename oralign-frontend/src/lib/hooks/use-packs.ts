'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { packsService } from '@/lib/api/packs.service';
import { toastMutationError } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import type {
  CreatePackDto,
  CreatePackPriceDto,
  PaginatedResponse,
  Pack,
  PackPrice,
  UpdatePackDto,
  UpdatePackPriceDto,
} from '@/lib/types';

export const packKeys = {
  all: ['packs'] as const,
  lists: () => [...packKeys.all, 'list'] as const,
  list: (params: Record<string, unknown>) =>
    [...packKeys.lists(), params] as const,
  detail: (id: string) => [...packKeys.all, 'detail', id] as const,
  public: () => [...packKeys.all, 'public'] as const,
};

const PACK_STALE_TIME = 60_000;

export function usePacks(params?: {
  includeInactive?: boolean;
  forOrthodontists?: boolean;
  page?: number;
  limit?: number;
  search?: string;
}): UseQueryResult<PaginatedResponse<Pack>, Error> {
  return useQuery({
    queryKey: packKeys.list(params ?? {}),
    queryFn: () => packsService.list(params),
    staleTime: PACK_STALE_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
}

/**
 * Marketing showcase hook — fetches the public packs catalogue with
 * no auth header. Short staleTime (60s) + refetch-on-focus so
 * deactivating a pack from `/dashboard/packs` removes it from the
 * `/practitioner` showcase on the next tab focus without a hard
 * refresh.
 */
export function usePublicPacks(): UseQueryResult<Pack[], Error> {
  return useQuery({
    queryKey: packKeys.public(),
    queryFn: () => packsService.listPublic(),
    staleTime: PACK_STALE_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

export function usePack(id: string, enabled = true) {
  return useQuery({
    queryKey: packKeys.detail(id),
    queryFn: () => packsService.get(id),
    enabled: enabled && !!id,
    staleTime: PACK_STALE_TIME,
    refetchOnMount: 'always',
  });
}

function invalidatePacks(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: packKeys.all });
}

export function useCreatePack(): UseMutationResult<Pack, Error, CreatePackDto> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (dto) => packsService.create(dto),
    onSuccess: () => {
      invalidatePacks(queryClient);
      toast.success(t('toasts.packs.created'));
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useUpdatePack(): UseMutationResult<
  Pack,
  Error,
  { id: string; dto: UpdatePackDto }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, dto }) => packsService.update(id, dto),
    onSuccess: () => {
      invalidatePacks(queryClient);
      toast.success(t('toasts.packs.updated'));
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useDeletePack(): UseMutationResult<
  { id: string; deleted: true },
  Error,
  string
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id) => packsService.remove(id),
    onSuccess: () => {
      invalidatePacks(queryClient);
      toast.success(t('toasts.packs.deleted'));
    },
    onError: (err) => toastMutationError(err),
  });
}

/** Permanent (hard) delete — admin-only, irreversible. */
export function useRestorePack(): UseMutationResult<Pack, Error, string> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation<Pack, Error, string>({
    mutationFn: (id) => packsService.restore(id),
    onSuccess: () => {
      invalidatePacks(queryClient);
      toast.success(t('toasts.packs.restored'));
    },
    onError: (err) => toastMutationError(err),
  });
}

export function usePermanentDeletePack(): UseMutationResult<
  { id: string },
  Error,
  string
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id) => packsService.permanentRemove(id),
    onSuccess: () => {
      invalidatePacks(queryClient);
      toast.success(t('toasts.packs.permanentlyDeleted'));
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useActivatePack(): UseMutationResult<Pack, Error, string> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id) => packsService.activate(id),
    onSuccess: () => {
      invalidatePacks(queryClient);
      toast.success(t('toasts.packs.activated'));
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useDeactivatePack(): UseMutationResult<Pack, Error, string> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id) => packsService.deactivate(id),
    onSuccess: () => {
      invalidatePacks(queryClient);
      toast.success(t('toasts.packs.deactivated'));
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useAddPackPrice(): UseMutationResult<
  PackPrice,
  Error,
  { packId: string; dto: CreatePackPriceDto }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ packId, dto }) => packsService.addPrice(packId, dto),
    onSuccess: () => {
      invalidatePacks(queryClient);
      toast.success(t('toasts.packs.priceAdded'));
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useUpdatePackPrice(): UseMutationResult<
  PackPrice,
  Error,
  { packId: string; priceId: string; dto: UpdatePackPriceDto }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ packId, priceId, dto }) =>
      packsService.updatePrice(packId, priceId, dto),
    onSuccess: () => {
      invalidatePacks(queryClient);
      toast.success(t('toasts.packs.priceUpdated'));
    },
    onError: (err) => toastMutationError(err),
  });
}

export function useArchivePackPrice(): UseMutationResult<
  PackPrice,
  Error,
  { packId: string; priceId: string }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ packId, priceId }) =>
      packsService.archivePrice(packId, priceId),
    onSuccess: () => {
      invalidatePacks(queryClient);
      toast.success(t('toasts.packs.priceArchived'));
    },
    onError: (err) => toastMutationError(err),
  });
}
