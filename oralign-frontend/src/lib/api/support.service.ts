import apiClient from './client';
import type {
  PaginatedResponse,
  SupportConversation,
  SupportConversationFilters,
  SupportConversationStatus,
  SupportMessage,
  SupportPriority,
} from '@/lib/types';

/**
 * Build the absolute URL for streaming an attachment through the
 * RBAC-gated controller route. Components render `<img src={...} />`
 * directly against this — the browser sends the auth cookie set by
 * `client.ts`, so the API gate honours it.
 */
export function supportAttachmentUrl(
  conversationId: string,
  messageId: string,
): string {
  const base =
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';
  return `${base}/support/attachments/${conversationId}/${messageId}`;
}

/**
 * Same serialisation pattern as paymentsService: arrays become comma
 * strings on the wire; the backend DTO @Transform handles them.
 */
function serialiseFilters(
  filters: SupportConversationFilters,
): Record<string, unknown> {
  const params: Record<string, unknown> = { ...filters };
  if (Array.isArray(filters.statuses)) {
    if (filters.statuses.length > 0) {
      params.statuses = filters.statuses.join(',');
    } else {
      delete params.statuses;
    }
  }
  if (Array.isArray(filters.priorities)) {
    if (filters.priorities.length > 0) {
      params.priorities = filters.priorities.join(',');
    } else {
      delete params.priorities;
    }
  }
  for (const k of Object.keys(params)) {
    const v = params[k];
    if (v === undefined || v === null || v === '') delete params[k];
  }
  return params;
}

export const supportService = {
  // ─── Conversations ──────────────────────────────────────────────

  listConversations: async (
    filters: SupportConversationFilters = {},
  ): Promise<PaginatedResponse<SupportConversation>> => {
    const res = await apiClient.get<PaginatedResponse<SupportConversation>>(
      '/support/conversations',
      { params: serialiseFilters(filters) },
    );
    return res.data;
  },

  unreadCount: async (): Promise<number> => {
    const res = await apiClient.get<{ count: number }>(
      '/support/conversations/unread-count',
    );
    return res.data.count;
  },

  getConversation: async (
    id: string,
  ): Promise<{
    conversation: SupportConversation;
    messages: SupportMessage[];
  }> => {
    const res = await apiClient.get<{
      conversation: SupportConversation;
      messages: SupportMessage[];
    }>(`/support/conversations/${id}`);
    return res.data;
  },

  // ─── Doctor: open thread + send ─────────────────────────────────

  /**
   * Open a new conversation. Multipart body — backend accepts
   * `subject`, `body`, and an optional `attachment` file. At least
   * one of `body` or `attachment` must be present (service-side
   * validation).
   */
  createConversation: async (args: {
    subject?: string;
    body?: string;
    attachment?: File | Blob;
  }): Promise<{
    conversation: SupportConversation;
    firstMessage: SupportMessage;
  }> => {
    const form = new FormData();
    if (args.subject) form.append('subject', args.subject);
    if (args.body) form.append('body', args.body);
    if (args.attachment) form.append('attachment', args.attachment);
    const res = await apiClient.post<{
      conversation: SupportConversation;
      firstMessage: SupportMessage;
    }>('/support/conversations', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  /**
   * Send a message to an existing conversation. Same multipart
   * shape as create; body OR attachment required.
   */
  sendMessage: async (args: {
    conversationId: string;
    body?: string;
    attachment?: File | Blob;
  }): Promise<SupportMessage> => {
    const form = new FormData();
    if (args.body) form.append('body', args.body);
    if (args.attachment) form.append('attachment', args.attachment);
    const res = await apiClient.post<SupportMessage>(
      `/support/conversations/${args.conversationId}/messages`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return res.data;
  },

  /** Mark every unread message from the OTHER side as read. */
  markRead: async (
    conversationId: string,
  ): Promise<{ updated: number }> => {
    const res = await apiClient.post<{ updated: number }>(
      `/support/conversations/${conversationId}/read`,
      {},
    );
    return res.data;
  },

  // ─── Admin lifecycle ────────────────────────────────────────────

  updateStatus: async (
    conversationId: string,
    status: SupportConversationStatus,
  ): Promise<SupportConversation> => {
    const res = await apiClient.patch<SupportConversation>(
      `/support/conversations/${conversationId}/status`,
      { status },
    );
    return res.data;
  },

  updatePriority: async (
    conversationId: string,
    priority: SupportPriority,
  ): Promise<SupportConversation> => {
    const res = await apiClient.patch<SupportConversation>(
      `/support/conversations/${conversationId}/priority`,
      { priority },
    );
    return res.data;
  },

  assign: async (
    conversationId: string,
    assignedAdminId: string | null,
  ): Promise<SupportConversation> => {
    const res = await apiClient.patch<SupportConversation>(
      `/support/conversations/${conversationId}/assign`,
      { assignedAdminId },
    );
    return res.data;
  },

  softDelete: async (conversationId: string): Promise<{ id: string }> => {
    const res = await apiClient.delete<{ id: string }>(
      `/support/conversations/${conversationId}`,
    );
    return res.data;
  },

  restore: async (
    conversationId: string,
  ): Promise<SupportConversation> => {
    const res = await apiClient.post<SupportConversation>(
      `/support/conversations/${conversationId}/restore`,
      {},
    );
    return res.data;
  },
};
