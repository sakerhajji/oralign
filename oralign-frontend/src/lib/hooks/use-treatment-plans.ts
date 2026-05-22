'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { treatmentPlansService } from '@/lib/api/treatment-plans.service';
import { extractApiErrorMessage } from '@/lib/api/error';
import type {
  TreatmentAttachmentCategory,
  TreatmentMessage,
  TreatmentPlan,
  TreatmentPlanIpr,
  TreatmentPlanReview,
  UpsertTreatmentPlanIprDto,
} from '@/lib/types';

export const treatmentPlanKeys = {
  all: ['treatment-plans'] as const,
  byOrder: (orderId: string) =>
    [...treatmentPlanKeys.all, 'order', orderId] as const,
  detail: (id: string) => [...treatmentPlanKeys.all, 'detail', id] as const,
  review: (id: string) => [...treatmentPlanKeys.all, 'review', id] as const,
  messages: (id: string) => [...treatmentPlanKeys.all, 'messages', id] as const,
};

const PLAN_LIST_STALE_TIME = 15_000;
const PLAN_REVIEW_STALE_TIME = 30_000;

// ─── Queries ────────────────────────────────────────────────────────────────

export function useTreatmentPlansByOrder(
  orderId: string,
): UseQueryResult<TreatmentPlan[], Error> {
  return useQuery({
    queryKey: treatmentPlanKeys.byOrder(orderId),
    queryFn: () => treatmentPlansService.listByOrder(orderId),
    enabled: !!orderId,
    staleTime: PLAN_LIST_STALE_TIME,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
  });
}

export function useTreatmentPlanReview(
  id: string,
): UseQueryResult<TreatmentPlanReview, Error> {
  // This payload is heavy, so the order page lazy-mounts this tab. Once a
  // user opens it, though, it must reconcile on real navigation/focus because
  // production tabs can miss websocket events while sleeping in the background.
  return useQuery({
    queryKey: treatmentPlanKeys.review(id),
    queryFn: () => treatmentPlansService.getReview(id),
    enabled: !!id,
    staleTime: PLAN_REVIEW_STALE_TIME,
    gcTime: 1000 * 60 * 5,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
  });
}

// ─── Mutations ─────────────────────────────────────────────────────────────

function invalidatePlan(queryClient: ReturnType<typeof useQueryClient>, plan: TreatmentPlan) {
  queryClient.invalidateQueries({ queryKey: treatmentPlanKeys.byOrder(plan.orderId) });
  queryClient.invalidateQueries({ queryKey: treatmentPlanKeys.review(plan.id) });
  queryClient.invalidateQueries({ queryKey: treatmentPlanKeys.detail(plan.id) });
}

export function useCreateTreatmentPlan(): UseMutationResult<
  TreatmentPlan,
  Error,
  { orderId: string; name?: string; resultViewUrl?: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, name, resultViewUrl }) =>
      treatmentPlansService.create(orderId, { name, resultViewUrl }),
    onSuccess: (plan) => {
      invalidatePlan(queryClient, plan);
      toast.success(`${plan.name} created.`);
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useUpdateResultViewUrl(): UseMutationResult<
  TreatmentPlan,
  Error,
  { id: string; resultViewUrl: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resultViewUrl }) =>
      treatmentPlansService.updateResultViewUrl(id, resultViewUrl),
    onSuccess: (plan) => {
      invalidatePlan(queryClient, plan);
      toast.success('Treatment viewer URL saved.');
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useMarkTreatmentPlanReady(): UseMutationResult<
  TreatmentPlan,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => treatmentPlansService.markReady(id),
    onSuccess: (plan, sourceId) => {
      invalidatePlan(queryClient, plan);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      // Resend-after-rejection creates a NEW versioned plan — surface that
      // in the toast so the planner knows the rejected version is preserved
      // and they're now looking at a fresh one.
      const isNewVersion = plan.id !== sourceId;
      toast.success(
        isNewVersion
          ? `${plan.name} created and marked ready (replaces the rejected plan).`
          : 'Plan marked ready for doctor review.',
      );
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useApproveTreatmentPlan(): UseMutationResult<
  TreatmentPlan,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => treatmentPlansService.approve(id),
    onSuccess: (plan) => {
      invalidatePlan(queryClient, plan);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Treatment plan approved.');
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useRejectTreatmentPlan(): UseMutationResult<
  TreatmentPlan,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => treatmentPlansService.reject(id),
    onSuccess: (plan) => {
      invalidatePlan(queryClient, plan);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Treatment plan rejected. Replanning requested.');
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useUploadMovementTableImage(): UseMutationResult<
  TreatmentPlan,
  Error,
  { id: string; file: File }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }) =>
      treatmentPlansService.uploadMovementTableImage(id, file),
    onSuccess: (plan) => {
      invalidatePlan(queryClient, plan);
      toast.success('Movement table image uploaded.');
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useDeleteMovementTableImage(): UseMutationResult<
  TreatmentPlan,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      treatmentPlansService.deleteMovementTableImage(id),
    onSuccess: (plan) => {
      invalidatePlan(queryClient, plan);
      toast.success('Movement table image removed.');
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

// ─── Dental treatment table image ("traitement dentaire") ─────────────────
// Same mutation shape as the movement-table-image hooks above; they're
// separated so the success toast and the cache-invalidation key are
// each unambiguous to the planner. Both hooks share `invalidatePlan`
// so the review payload re-fetches and the new image flows into the UI.

export function useUploadDentalTreatmentTableImage(): UseMutationResult<
  TreatmentPlan,
  Error,
  { id: string; file: File }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }) =>
      treatmentPlansService.uploadDentalTreatmentTableImage(id, file),
    onSuccess: (plan) => {
      invalidatePlan(queryClient, plan);
      toast.success('Dental treatment table image uploaded.');
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useDeleteDentalTreatmentTableImage(): UseMutationResult<
  TreatmentPlan,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      treatmentPlansService.deleteDentalTreatmentTableImage(id),
    onSuccess: (plan) => {
      invalidatePlan(queryClient, plan);
      toast.success('Dental treatment table image removed.');
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useSendTreatmentMessage(): UseMutationResult<
  TreatmentMessage,
  Error,
  {
    id: string;
    message?: string;
    files?: File[];
    category?: TreatmentAttachmentCategory;
  }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, message, files, category }) =>
      files && files.length > 0
        ? treatmentPlansService.sendMessageWithAttachments(id, {
            message,
            files,
            category,
          })
        : treatmentPlansService.sendMessage(id, message ?? ''),
    onSuccess: (msg) => {
      queryClient.invalidateQueries({
        queryKey: treatmentPlanKeys.review(msg.treatmentPlanId),
      });
      queryClient.invalidateQueries({
        queryKey: treatmentPlanKeys.messages(msg.treatmentPlanId),
      });
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useGeneratePublicLink(): UseMutationResult<
  TreatmentPlan,
  Error,
  { id: string; validDays?: number }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, validDays }) =>
      treatmentPlansService.generatePublicLink(id, validDays),
    onSuccess: (plan) => {
      invalidatePlan(queryClient, plan);
      toast.success('Public viewer link generated.');
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

// ─── IPR / stripping (per treatment plan) ─────────────────────────────
// Dedicated hooks for the new TreatmentPlanIpr table. Reads come back
// via the parent useTreatmentPlanReview payload (review.iprEntries), so
// these hooks focus on writes. Each mutation invalidates the review so
// the odontogram re-renders with the fresh list.

export const treatmentPlanIprKeys = {
  all: ['treatment-plan-ipr'] as const,
  list: (planId: string) =>
    [...treatmentPlanIprKeys.all, 'list', planId] as const,
};

/**
 * Optional standalone read — most callers should use the iprEntries
 * field on `useTreatmentPlanReview()` to avoid double-fetching.
 */
export function useTreatmentPlanIprList(
  planId: string,
): UseQueryResult<TreatmentPlanIpr[], Error> {
  return useQuery({
    queryKey: treatmentPlanIprKeys.list(planId),
    queryFn: () => treatmentPlansService.listIpr(planId),
    enabled: !!planId,
    staleTime: 30_000,
  });
}

/**
 * Upsert one IPR contact (fromTooth, toTooth, value, optional note).
 * Idempotent on the backend — re-running with the same pair updates
 * the existing row instead of inserting a duplicate. No P2002.
 */
export function useUpsertTreatmentPlanIpr(
  planId: string,
): UseMutationResult<TreatmentPlanIpr, Error, UpsertTreatmentPlanIprDto> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto) => treatmentPlansService.upsertIpr(planId, dto),
    onSuccess: () => {
      // Invalidate both the standalone list and the review payload
      // (which embeds iprEntries) so every consumer sees the new row.
      queryClient.invalidateQueries({
        queryKey: treatmentPlanIprKeys.list(planId),
      });
      queryClient.invalidateQueries({
        queryKey: treatmentPlanKeys.review(planId),
      });
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useRemoveTreatmentPlanIpr(
  planId: string,
): UseMutationResult<
  { deleted: boolean },
  Error,
  { fromTooth: number; toTooth: number }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fromTooth, toTooth }) =>
      treatmentPlansService.removeIpr(planId, fromTooth, toTooth),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: treatmentPlanIprKeys.list(planId),
      });
      queryClient.invalidateQueries({
        queryKey: treatmentPlanKeys.review(planId),
      });
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}
