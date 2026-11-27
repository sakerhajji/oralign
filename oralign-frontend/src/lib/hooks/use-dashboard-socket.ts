'use client';

import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ensureValidAccessToken, getAccessToken } from '@/lib/api/client';
import {
  refCountedSet,
  statsInvalidationPlan,
} from '@/lib/realtime/dashboard-invalidation';
import { dashboardKeys } from './use-dashboard';
import { notificationKeys } from './use-notifications';
import { paymentKeys, transferQueueKeys, treatmentFeeKeys } from './payment-keys';
import { sliderMediaKeys } from './use-slider-media';

let sharedSocket: Socket | null = null;
let refCount = 0;

/**
 * The React-Query clients the shared socket's listeners refresh, held once
 * per mounted hook. The listeners below are attached ONCE per socket and
 * walk the distinct clients, so an event refetches each key once however
 * many surfaces mounted the hook (the admin sidebar plus a dashboard page,
 * the doctor landing plus its slider).
 */
const clients = refCountedSet<QueryClient>();

function onStatsInvalidate(payload?: { scope?: string }): void {
  const plan = statsInvalidationPlan(payload?.scope);
  for (const queryClient of clients.values()) {
    if (plan.dashboard) {
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    }
    if (plan.money) {
      void queryClient.invalidateQueries({ queryKey: transferQueueKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      void queryClient.invalidateQueries({ queryKey: treatmentFeeKeys.all });
    }
    if (plan.unreadCount) {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    }
  }
}

function onSliderChanged(): void {
  for (const queryClient of clients.values()) {
    void queryClient.invalidateQueries({ queryKey: sliderMediaKeys.all });
  }
}

function getNamespaceUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';
  return apiUrl.replace(/\/api\/?$/, '');
}

function acquireSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  const token = getAccessToken();
  if (!token) return null;
  if (sharedSocket && sharedSocket.connected) {
    refCount += 1;
    return sharedSocket;
  }
  if (!sharedSocket) {
    sharedSocket = io(`${getNamespaceUrl()}/dashboard`, {
      // Async auth re-invoked before every (re)connect. The gateway verifies
      // the JWT on each handshake and the access token expires after 15 min;
      // a stale token is rejected ("jwt expired") and — since a failed socket
      // handshake never hits the axios 401 interceptor — the client would
      // reconnect forever with the dead token (realtime silently dead until
      // reload). ensureValidAccessToken() refreshes an expired token via the
      // refresh token first, so every (re)connect carries a VALID token. The
      // dashboard rooms (`admins:all` / per-doctor) are joined server-side in
      // the gateway's handleConnection, so they re-subscribe automatically on
      // every reconnect — no client-side re-join needed here.
      auth: (cb: (data: { token: string }) => void) => {
        ensureValidAccessToken()
          .then((token) => cb({ token: token ?? '' }))
          .catch(() => cb({ token: getAccessToken() ?? '' }));
      },
      // No reconnection cap — recover from transient outages indefinitely
      // (a fresh token is fetched on each attempt via the async auth above).
      // Always allow the long-polling fallback so the dashboard still gets
      // realtime invalidations when the WS upgrade is blocked (strict
      // proxies, some corporate networks) instead of silently never
      // connecting.
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 8_000,
    });
    // One listener per event for the socket's whole life (see `clients`).
    sharedSocket.on('stats:invalidate', onStatsInvalidate);
    sharedSocket.on('slider:changed', onSliderChanged);
  }
  refCount += 1;
  return sharedSocket;
}

function releaseSocket(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && sharedSocket) {
    sharedSocket.off('stats:invalidate', onStatsInvalidate);
    sharedSocket.off('slider:changed', onSliderChanged);
    sharedSocket.disconnect();
    sharedSocket = null;
  }
}

/**
 * Subscribe a dashboard surface (admin landing, doctor landing, the
 * admin sidebar for the whole admin session) to the `/dashboard` WS
 * namespace. On any `stats:invalidate` or `slider:changed` event we
 * invalidate the relevant React-Query caches and the page re-fetches once
 * (deduplicated; only queries on screen refetch).
 *
 * `stats:invalidate` with scope `all` follows money events (a payment
 * or a treatment fee declared, confirmed, refused, withdrawn,
 * superseded): the payment lists, the pending desk, the sidebar badges
 * and the bell count refetch too. Scope `transfers` (another admin opened
 * a receipt for the first time) refetches only the lists that show a
 * transfer's state. A receipt's bytes are never refetched (their own key
 * root). See lib/realtime/dashboard-invalidation.ts.
 *
 * Idempotent + refcounted — mount it from multiple components
 * safely; the socket and its listeners are shared, so each event
 * refetches a key once.
 */
export function useDashboardSocket(opts: { enabled?: boolean } = {}): void {
  const queryClient = useQueryClient();
  const enabled = opts.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    const socket = acquireSocket();
    if (!socket) return;
    clients.retain(queryClient);

    return () => {
      clients.release(queryClient);
      releaseSocket();
    };
  }, [enabled, queryClient]);
}
