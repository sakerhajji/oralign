import apiClient from './client';
import type {
  Notification,
  NotificationFilters,
  PaginatedResponse,
} from '@/lib/types';

/**
 * Notification API client — mirrors the backend's
 * `/api/notifications/*` routes. Every endpoint operates on the
 * caller's own inbox; the backend refuses cross-user reads even
 * for admins, so there's no need to pass a user id.
 */
export const notificationsService = {
  list: async (
    filters: NotificationFilters = {},
  ): Promise<PaginatedResponse<Notification>> => {
    const res = await apiClient.get<PaginatedResponse<Notification>>(
      '/notifications',
      { params: filters },
    );
    return res.data;
  },

  unreadCount: async (): Promise<number> => {
    const res = await apiClient.get<{ count: number }>(
      '/notifications/unread-count',
    );
    return res.data.count;
  },

  markRead: async (id: string): Promise<Notification> => {
    const res = await apiClient.post<Notification>(
      `/notifications/${id}/read`,
      {},
    );
    return res.data;
  },

  markAllRead: async (): Promise<{ updated: number }> => {
    const res = await apiClient.post<{ updated: number }>(
      '/notifications/read-all',
      {},
    );
    return res.data;
  },
};
