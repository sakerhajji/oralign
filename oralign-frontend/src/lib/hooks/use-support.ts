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
import { useT } from '@/lib/i18n/lang-context';
import { useAuth } from '@/lib/providers/auth-provider';
import type {
  PaginatedResponse,
  SupportConversation,
  SupportConversationFilters,
  SupportConversationStatus,
  SupportMessage,
  SupportPriority,
} from '@/lib/types';

type ConversationDetail = {
  conversation: SupportConversation;
  messages: SupportMessage[];
};

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
  const { t } = useT();
  return useMutation({
    mutationFn: (args) => supportService.createConversation(args),
    onSuccess: (data) => {
      invalidateConversation(queryClient, data.conversation.id);
      toast.success(t('toasts.support.opened'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useSendSupportMessage(): UseMutationResult<
  SupportMessage,
  Error,
  { conversationId: string; body?: string; attachment?: File | Blob },
  { key: readonly unknown[]; previous?: ConversationDetail; tempId: string }
> {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (args) => supportService.sendMessage(args),
    // Optimistically append the message so the sender sees it INSTANTLY,
    // instead of waiting for the POST and then a second detail-refetch
    // round-trip (the old onSuccess invalidate → refetch was the lag).
    onMutate: async (vars) => {
      const key = supportKeys.detail(vars.conversationId);
      // Random suffix so two sends in the same millisecond can't collide on
      // the React key or the onSuccess de-dupe filter.
      const tempId = `optimistic-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ConversationDetail>(key);
      // Only optimistically render text sends — an attachment-only message
      // can't preview its image before upload, so we skip the placeholder
      // (it still lands via the no-refetch onSuccess below, one round-trip).
      if (previous && user && vars.body?.trim()) {
        const optimistic: SupportMessage = {
          id: tempId,
          conversationId: vars.conversationId,
          senderId: user.id,
          senderRole: user.role,
          body: vars.body,
          attachmentRelativePath: null,
          attachmentMime: null,
          attachmentName: null,
          attachmentSize: null,
          readAt: null,
          createdAt: new Date().toISOString(),
          sender: null,
        };
        queryClient.setQueryData<ConversationDetail>(key, {
          ...previous,
          messages: [...previous.messages, optimistic],
        });
      }
      return { key, previous, tempId };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous);
      toast.error(extractApiErrorMessage(err));
    },
    onSuccess: (data, vars, ctx) => {
      // Swap the placeholder for the real server message (correct id,
      // attachment path, timestamps) directly in the cache — NO detail
      // refetch, so nothing blocks the message from showing.
      const key = supportKeys.detail(vars.conversationId);
      queryClient.setQueryData<ConversationDetail>(key, (old) => {
        if (!old) return old;
        const withoutDupes = old.messages.filter(
          (m) => m.id !== ctx?.tempId && m.id !== data.id,
        );
        // Insert by createdAt rather than blindly appending: if the OTHER
        // party's message arrived (via socket refetch) while our POST was
        // in flight, a blind append would render our older message BELOW
        // their newer one. ISO timestamps sort chronologically.
        const merged = [...withoutDupes, data].sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt),
        );
        return { ...old, messages: merged };
      });
      // Refresh the queue list preview + unread badge (cheap; the open
      // thread is already up to date from the cache write above).
      queryClient.invalidateQueries({ queryKey: supportKeys.conversations() });
      queryClient.invalidateQueries({ queryKey: supportKeys.unread() });
    },
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
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, status }) => supportService.updateStatus(id, status),
    onSuccess: (conv) => {
      invalidateConversation(queryClient, conv.id);
      toast.success(
        t('toasts.support.statusChanged', {
          status: t(`toasts.support.status.${conv.status}`),
        }),
      );
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
  const { t } = useT();
  return useMutation({
    mutationFn: ({ id, priority }) =>
      supportService.updatePriority(id, priority),
    onSuccess: (conv) => {
      invalidateConversation(queryClient, conv.id);
      toast.success(
        t('toasts.support.prioritySet', {
          priority: t(`toasts.support.priority.${conv.priority}`),
        }),
      );
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
  const { t } = useT();
  return useMutation({
    mutationFn: (id) => supportService.softDelete(id),
    onSuccess: (data) => {
      invalidateConversation(queryClient, data.id);
      toast.success(t('toasts.support.trashed'));
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
  const { t } = useT();
  return useMutation({
    mutationFn: (id) => supportService.restore(id),
    onSuccess: (conv) => {
      invalidateConversation(queryClient, conv.id);
      toast.success(t('toasts.support.restored'));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}
