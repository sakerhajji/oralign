'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { notificationsService } from '@/lib/api/notifications.service';
import { extractApiErrorMessage } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import { dashboardKeys } from './use-dashboard';
import { transferQueueKeys } from './transfer-queue-keys';
import type {
  Notification,
  NotificationFilters,
  PaginatedResponse,
} from '@/lib/types';

/**
 * React-Query hooks for the notification inbox + unread badge.
 *
 * Both the list and the count poll on a short interval so the bell
 * stays close to real-time without a WebSocket. The intervals are
 * tuned to avoid stampedes on the API:
 *
 *   • unread-count: every 20 s (cheap, drives the badge dot)
 *   • list:          on-demand only (refreshed when the popover opens)
 *
 * Markings invalidate both keys atomically so the badge and list
 * stay in lockstep.
 */
export const notificationKeys = {
  all: ['notifications'] as const,
  list: (filters: NotificationFilters) =>
    [...notificationKeys.all, 'list', filters] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
};

const UNREAD_POLL_MS = 20_000;

export function useUnreadNotificationCount(
  enabled = true,
): UseQueryResult<number, Error> {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => notificationsService.unreadCount(),
    enabled,
    refetchInterval: UNREAD_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/**
 * The unread count as the bell last read it, with no poll of its own: a
 * refetchInterval runs per observer, so a second polling observer would
 * double the bell's requests. Undefined until the bell (or the
 * notifications page) has read it once.
 */
export function useCachedUnreadNotificationCount(): number | undefined {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => notificationsService.unreadCount(),
    enabled: false,
  }).data;
}

export function useNotifications(
  filters: NotificationFilters = {},
  enabled = true,
): UseQueryResult<PaginatedResponse<Notification>, Error> {
  return useQuery({
    queryKey: notificationKeys.list(filters),
    queryFn: () => notificationsService.list(filters),
    enabled,
    staleTime: 10_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

/**
 * A row marked read can be an admin's transfer row: his "Nouveau" on the
 * pending desk and the sidebar badge move with it.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  queryClient.invalidateQueries({ queryKey: dashboardKeys.adminSidebarBadges() });
  queryClient.invalidateQueries({ queryKey: transferQueueKeys.lists() });
}

export function useMarkNotificationRead(): UseMutationResult<
  Notification,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => notificationsService.markRead(id),
    onSuccess: () => invalidate(queryClient),
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}

export function useMarkAllNotificationsRead(): UseMutationResult<
  { updated: number },
  Error,
  void
> {
  const queryClient = useQueryClient();
  const { t } = useT();
  return useMutation({
    mutationFn: () => notificationsService.markAllRead(),
    onSuccess: (data) => {
      invalidate(queryClient);
      if (data.updated > 0)
        toast.success(t('toasts.notifications.markedRead', { count: data.updated }));
    },
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}
