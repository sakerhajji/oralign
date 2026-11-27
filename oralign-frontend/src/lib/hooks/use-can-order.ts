'use client';

import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { onAccountDormant } from '@/lib/api/client';
import { usersService } from '@/lib/api/users.service';
import { useAuth } from '@/lib/providers/auth-provider';
import { UserRole } from '@/lib/types';
import {
  accountNoticeNeedsRefresh,
  canOrderFor,
  DORMANT_RECHECK_MS,
  isAccountNoticeType,
  ORDERING_OPEN,
  unreadCountRose,
  type CanOrder,
} from '@/lib/account-activity/account-activity';
import { useCachedUnreadNotificationCount } from './use-notifications';
import { userKeys } from './use-users';

export type { CanOrder } from '@/lib/account-activity/account-activity';

/**
 * May an order be started or submitted (spec §5, doctor inactivity)? A
 * dormant doctor (User.inactiveSince set) keeps login, payments, plan
 * approval and chat, but order create / submit answer 403
 * ACCOUNT_DORMANT until an admin reactivates him.
 *
 * Without an argument it answers for the signed-in user, from the
 * /users/me payload (`inactiveSince`): a dormant dentist gets
 * `{ canOrder: false, reason: 'dormant' }`; every other role is open (an
 * admin's own account never orders for itself). Pass the DOCTOR the order
 * is for when it is known (an admin choosing a dentist, an admin opening
 * a doctor's draft): `null` / an account without `inactiveSince` = open.
 *
 * It only steers the UI: the server is the authority (403 ACCOUNT_DORMANT
 * on every create / submit path).
 */
export function useCanOrder(
  doctor?: { inactiveSince?: string | null } | null,
): CanOrder {
  const { user } = useAuth();
  if (doctor !== undefined) return canOrderFor(doctor);
  if (user?.role !== UserRole.DENTIST) return ORDERING_OPEN;
  return canOrderFor(user);
}

/**
 * Re-read /users/me now. `cancelRefetch: false`: several triggers firing
 * together (a page whose requests are refused together, a notice plus a
 * mount) share one request.
 */
function recheckAccount(queryClient: QueryClient): void {
  void queryClient.invalidateQueries(
    { queryKey: userKeys.currentUser() },
    { cancelRefetch: false },
  );
}

/**
 * Mount ONCE, in the dashboard chrome (AppSidebar). It keeps the cached
 * /users/me (10 minutes) in step with the account, both ways:
 * - any request answering 403 ACCOUNT_DORMANT (the account turned dormant
 *   after /users/me was read) refetches it, so every useCanOrder gate,
 *   banner and button closes together; the users lists refetch too, so an
 *   admin acting for the practitioner sees him flagged;
 * - a dentist's unread count rising (the bell polls it every 20 s)
 *   refetches it: the new notice may be « compte réactivé » or « compte
 *   désactivé »;
 * - while the dentist is dormant it is also re-read every minute and on
 *   window focus: a dormant doctor sends no order request, so no 403 would
 *   ever tell him an admin reactivated him.
 */
export function useAccountDormantRefresh(): void {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isDentist = user?.role === UserRole.DENTIST;
  const dormant = isDentist && !canOrderFor(user).canOrder;

  useEffect(
    () =>
      onAccountDormant(() => {
        recheckAccount(queryClient);
        void queryClient.invalidateQueries(
          { queryKey: userKeys.lists() },
          { cancelRefetch: false },
        );
      }),
    [queryClient],
  );

  // An observer of /users/me that polls only while dormant (a
  // refetchInterval runs per observer; AuthProvider's own stays still).
  useQuery({
    queryKey: userKeys.currentUser(),
    queryFn: usersService.getCurrentUser,
    enabled: dormant,
    refetchInterval: DORMANT_RECHECK_MS,
    refetchOnWindowFocus: true,
    staleTime: DORMANT_RECHECK_MS / 2,
  });

  const unread = useCachedUnreadNotificationCount();
  const lastUnread = useRef<number | undefined>(undefined);
  useEffect(() => {
    const previous = lastUnread.current;
    lastUnread.current = unread;
    if (isDentist && unreadCountRose(previous, unread)) recheckAccount(queryClient);
  }, [isDentist, unread, queryClient]);
}

/**
 * Re-read /users/me once when a dormant surface mounts (the new-order
 * gate, the dashboard banner): the doctor lands there from the « compte
 * réactivé » notice, whose link is the new-order page, and must get the
 * wizard at once rather than after the next poll.
 */
export function useRecheckAccountOnMount(enabled = true): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (enabled) recheckAccount(queryClient);
  }, [enabled, queryClient]);
}

/**
 * For the lists of notifications (the bell, the notifications page): an
 * account notice newer than the cached /users/me re-reads it, and so does
 * opening one (`onAccountNotice(type)` from the row's click handler).
 */
export function useAccountNoticeRefresh(
  notifications: readonly { type: string; createdAt: string }[] | undefined,
): (type: string) => void {
  const queryClient = useQueryClient();
  useEffect(() => {
    // Keyed on the list only (structural sharing keeps its reference until
    // a row changes): the refetch below never re-runs this effect.
    const fetchedAt =
      queryClient.getQueryState(userKeys.currentUser())?.dataUpdatedAt ?? 0;
    if (accountNoticeNeedsRefresh(notifications, fetchedAt)) recheckAccount(queryClient);
  }, [notifications, queryClient]);

  return (type: string) => {
    if (isAccountNoticeType(type)) recheckAccount(queryClient);
  };
}
