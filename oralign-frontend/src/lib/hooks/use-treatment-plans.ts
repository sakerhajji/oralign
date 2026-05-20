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
  TreatmentPlanReview,
} from '@/lib/types';

export const treatmentPlanKeys = {
  all: ['treatment-plans'] as const,
  byOrder: (orderId: string) =>
    [...treatmentPlanKeys.all, 'order', orderId] as const,
  detail: (id: string) => [...treatmentPlanKeys.all, 'detail', id] as const,
  review: (id: string) => [...treatmentPlanKeys.all, 'review', id] as const,
  messages: (id: string) => [...treatmentPlanKeys.all, 'messages', id] as const,
};

// ─── Queries ────────────────────────────────────────────────────────────────

export function useTreatmentPlansByOrder(
  orderId: string,
): UseQueryResult<TreatmentPlan[], Error> {
  return useQuery({
    queryKey: treatmentPlanKeys.byOrder(orderId),
    queryFn: () => treatmentPlansService.listByOrder(orderId),
    enabled: !!orderId,
    // List is cheap (no relations, ~1KB) but flipping tabs shouldn't refire.
    staleTime: 1000 * 60 * 5,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useTreatmentPlanReview(
  id: string,
): UseQueryResult<TreatmentPlanReview, Error> {
  // The review payload is HEAVY — it pulls the full plan + grouped odontogram
  // + every chat message with its attachments + senders. Before this fix the
  // Order detail tab flip refetched it on every mount, plus on every window
  // focus, holding two copies in memory while the new one came in. That's
  // most of the ~824 MB the user reported.
  //
  // The WebSocket gateway (`useTreatmentChatSocket`) is the source of truth
  // for new messages anyway — it updates this cache in-place — so we can
  // safely disable auto-refetch entirely and let the socket drive updates.
  return useQuery({
    queryKey: treatmentPlanKeys.review(id),
    queryFn: () => treatmentPlansService.getReview(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 5,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
