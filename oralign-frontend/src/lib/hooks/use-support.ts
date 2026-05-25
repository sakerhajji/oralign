'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { supportService } from '@/lib/api/support.service';
import { extractApiErrorMessage } from '@/lib/api/error';
import type {
  PaginatedResponse,
  SupportConversation,
  SupportConversationFilters,
  SupportConversationStatus,
  SupportMessage,
  SupportPriority,
} from '@/lib/types';

export const supportKeys = {
  all: ['support'] as const,
  conversations: () => [...supportKeys.all, 'conversations'] as const,
  list: (filters: SupportConversationFilters) =>
    [...supportKeys.conversations(), 'list', filters] as const,
  detail: (id: string) =>
    [...supportKeys.conversations(), 'detail', id] as const,
  unread: () => [...supportKeys.all, 'unread-count'] as const,
};

// 20 s polling for the doctor's unread badge. WS messages will
// invalidate sooner — this is the fallback.
const UNREAD_POLL_MS = 20_000;

export function useSupportConversations(
  filters: SupportConversationFilters = {},
  enabled = true,
): UseQueryResult<PaginatedResponse<SupportConversation>, Error> {
  return useQuery({
    queryKey: supportKeys.list(filters),
    queryFn: () => supportService.listConversations(filters),
    enabled,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
}

export function useSupportConversation(
  id: string | null,
): UseQueryResult<
  { conversation: SupportConversation; messages: SupportMessage[] },
  Error
> {
  return useQuery({
    queryKey: id ? supportKeys.detail(id) : ['support', 'detail', 'none'],
    queryFn: () => {
      if (!id) throw new Error('Conversation id required');
      return supportService.getConversation(id);
    },
    enabled: !!id,
    staleTime: 5_000,
  });
}

export function useSupportUnreadCount(
  enabled = true,
): UseQueryResult<number, Error> {
  return useQuery({
    queryKey: supportKeys.unread(),
    queryFn: () => supportService.unreadCount(),
    enabled,
    refetchInterval: UNREAD_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

function invalidateConversation(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId?: string,
) {
  queryClient.invalidateQueries({ queryKey: supportKeys.conversations() });
  queryClient.invalidateQueries({ queryKey: supportKeys.unread() });
  if (conversationId) {
    queryClient.invalidateQueries({
      queryKey: supportKeys.detail(conversationId),
    });
  }
}

export function useCreateSupportConversation(): UseMutationResult<
  { conversation: SupportConversation; firstMessage: SupportMessage },
  Error,
  { subject?: string; body?: string; attachment?: File | Blob }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args) => supportService.createConversation(args),
    onSuccess: (data) => {
      invalidateConversation(queryClient, data.conversation.id);
      toast.success('Support conversation opened.');
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useSendSupportMessage(): UseMutationResult<
  SupportMessage,
  Error,
  { conversationId: string; body?: string; attachment?: File | Blob }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args) => supportService.sendMessage(args),
    onSuccess: (_data, vars) => {
      invalidateConversation(queryClient, vars.conversationId);
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useMarkSupportRead(): UseMutationResult<
  { updated: number },
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => supportService.markRead(id),
    onSuccess: (_data, id) => {
      invalidateConversation(queryClient, id);
    },
  });
}

export function useUpdateSupportStatus(): UseMutationResult<
  SupportConversation,
  Error,
  { id: string; status: SupportConversationStatus }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => supportService.updateStatus(id, status),
    onSuccess: (conv) => {
      invalidateConversation(queryClient, conv.id);
      toast.success(`Conversation marked ${conv.status}.`);
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useUpdateSupportPriority(): UseMutationResult<
  SupportConversation,
  Error,
  { id: string; priority: SupportPriority }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, priority }) =>
      supportService.updatePriority(id, priority),
    onSuccess: (conv) => {
      invalidateConversation(queryClient, conv.id);
      toast.success(`Priority set to ${conv.priority}.`);
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useDeleteSupportConversation(): UseMutationResult<
  { id: string },
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => supportService.softDelete(id),
    onSuccess: (data) => {
      invalidateConversation(queryClient, data.id);
      toast.success('Conversation moved to trash.');
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useRestoreSupportConversation(): UseMutationResult<
  SupportConversation,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => supportService.restore(id),
    onSuccess: (conv) => {
      invalidateConversation(queryClient, conv.id);
      toast.success('Conversation restored.');
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}
