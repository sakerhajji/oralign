'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { sliderMediaService } from '@/lib/api/slider-media.service';
import { extractApiErrorMessage } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import type {
  CreateSliderMediaInput,
  PaginatedResponse,
  SliderMedia,
  SliderMediaDeviceTarget,
  SliderMediaFilters,
  UpdateSliderMediaInput,
} from '@/lib/types';

export const sliderMediaKeys = {
  all: ['slider-media'] as const,
  active: (device: SliderMediaDeviceTarget) =>
    [...sliderMediaKeys.all, 'active', device] as const,
  adminList: (filters: SliderMediaFilters) =>
    [...sliderMediaKeys.all, 'admin', 'list', filters] as const,
  detail: (id: string) => [...sliderMediaKeys.all, 'detail', id] as const,
};

export function useActiveSliderMedia(
  device: SliderMediaDeviceTarget,
  enabled = true,
): UseQueryResult<SliderMedia[], Error> {
  return useQuery({
    queryKey: sliderMediaKeys.active(device),
    queryFn: () => sliderMediaService.listActive(device).then((r) => r.data),
    enabled,
    // Active slides change rarely — keep them warm for 60 s. The
    // dashboard WS will invalidate sooner when an admin edits.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useSliderMediaAdminList(
  filters: SliderMediaFilters = {},
  enabled = true,
): UseQueryResult<PaginatedResponse<SliderMedia>, Error> {
  return useQuery({
    queryKey: sliderMediaKeys.adminList(filters),
    queryFn: () => sliderMediaService.listAdmin(filters),
    enabled,
    staleTime: 15_000,
  });
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: sliderMediaKeys.all });
}

export function useCreateSliderMedia(): UseMutationResult<
  SliderMedia,
  Error,
  CreateSliderMediaInput
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (input) => sliderMediaService.create(input),
    onSuccess: () => {
      invalidateAll(queryClient);
      toast.success(t('toasts.sliderMedia.added'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useUpdateSliderMedia(): UseMutationResult<
  SliderMedia,
  Error,
  { id: string; input: UpdateSliderMediaInput }
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, input }) => sliderMediaService.update(id, input),
    onSuccess: () => {
      invalidateAll(queryClient);
      toast.success(t('toasts.sliderMedia.updated'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useActivateSliderMedia(): UseMutationResult<SliderMedia, Error, string> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id) => sliderMediaService.activate(id),
    onSuccess: () => {
      invalidateAll(queryClient);
      toast.success(t('toasts.sliderMedia.activated'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useDeactivateSliderMedia(): UseMutationResult<SliderMedia, Error, string> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id) => sliderMediaService.deactivate(id),
    onSuccess: () => {
      invalidateAll(queryClient);
      toast.success(t('toasts.sliderMedia.deactivated'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useReorderSliderMedia(): UseMutationResult<
  { updated: number },
  Error,
  string[]
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (ids) => sliderMediaService.reorder(ids),
    onSuccess: () => {
      invalidateAll(queryClient);
      toast.success(t('toasts.sliderMedia.reordered'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useDeleteSliderMedia(): UseMutationResult<{ id: string }, Error, string> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id) => sliderMediaService.softDelete(id),
    onSuccess: () => {
      invalidateAll(queryClient);
      toast.success(t('toasts.sliderMedia.trashed'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useRestoreSliderMedia(): UseMutationResult<SliderMedia, Error, string> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id) => sliderMediaService.restore(id),
    onSuccess: () => {
      invalidateAll(queryClient);
      toast.success(t('toasts.sliderMedia.restored'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}
