'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { communitySubmissionsService } from '@/lib/api/community-submissions.service';
import { extractApiErrorMessage } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import type {
  CommunitySubmission,
  CommunitySubmissionFilters,
  CommunitySubmissionStatus,
  CreateCommunitySubmissionInput,
  PaginatedResponse,
} from '@/lib/types';

type AdminCreateCommunitySubmissionInput = CreateCommunitySubmissionInput & {
  status?: CommunitySubmissionStatus;
};

export const communitySubmissionKeys = {
  all: ['community-submissions'] as const,
  approved: () => ['community-submissions', 'approved'] as const,
  admin: (filters: CommunitySubmissionFilters) => ['community-submissions', 'admin', filters] as const,
};

export function useApprovedCommunitySubmissions(): UseQueryResult<CommunitySubmission[], Error> {
  return useQuery({
    queryKey: communitySubmissionKeys.approved(),
    queryFn: communitySubmissionsService.listApproved,
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

export function useCommunitySubmissionsAdmin(filters: CommunitySubmissionFilters = {}, enabled = true) {
  return useQuery<PaginatedResponse<CommunitySubmission>, Error>({
    queryKey: communitySubmissionKeys.admin(filters),
    queryFn: () => communitySubmissionsService.listAdmin(filters),
    enabled,
    staleTime: 10_000,
  });
}

function invalidateCommunity(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: communitySubmissionKeys.all });
}

export function useCreateCommunitySubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, onProgress }: { input: CreateCommunitySubmissionInput; onProgress?: (progress: number) => void }) => communitySubmissionsService.create(input, onProgress),
    onSuccess: () => {
      invalidateCommunity(queryClient);
    },
    onError: (error) => toast.error(extractApiErrorMessage(error)),
  });
}

export function useApproveCommunitySubmission() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id: string) => communitySubmissionsService.approve(id),
    onSuccess: () => {
      invalidateCommunity(queryClient);
      toast.success(t('communityAdmin.toastApproved'));
    },
    onError: (error) => toast.error(extractApiErrorMessage(error)),
  });
}

export function useCreateCommunitySubmissionAdmin() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (input: AdminCreateCommunitySubmissionInput) => communitySubmissionsService.createAdmin(input),
    onSuccess: () => {
      invalidateCommunity(queryClient);
      toast.success(t('communityAdmin.toastCreated'));
    },
    onError: (error) => toast.error(extractApiErrorMessage(error)),
  });
}

export function useUpdateCommunitySubmissionAdmin() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateCommunitySubmissionInput> }) => communitySubmissionsService.updateAdmin(id, input),
    onSuccess: () => {
      invalidateCommunity(queryClient);
      toast.success(t('communityAdmin.toastUpdated'));
    },
    onError: (error) => toast.error(extractApiErrorMessage(error)),
  });
}

export function useRejectCommunitySubmission() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, reviewNote }: { id: string; reviewNote?: string }) => communitySubmissionsService.reject(id, reviewNote),
    onSuccess: () => {
      invalidateCommunity(queryClient);
      toast.success(t('communityAdmin.toastRejected'));
    },
    onError: (error) => toast.error(extractApiErrorMessage(error)),
  });
}

export function useDeleteCommunitySubmission() {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: (id: string) => communitySubmissionsService.remove(id),
    onSuccess: () => {
      invalidateCommunity(queryClient);
      toast.success(t('communityAdmin.toastDeleted'));
    },
    onError: (error) => toast.error(extractApiErrorMessage(error)),
  });
}
