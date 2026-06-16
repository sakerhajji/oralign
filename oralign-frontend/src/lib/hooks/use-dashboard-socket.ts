'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { ensureValidAccessToken, getAccessToken } from '@/lib/api/client';
import { dashboardKeys } from './use-dashboard';
import { sliderMediaKeys } from './use-slider-media';

let sharedSocket: Socket | null = null;
let refCount = 0;

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
  }
  refCount += 1;
  return sharedSocket;
}

function releaseSocket(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && sharedSocket) {
    sharedSocket.disconnect();
    sharedSocket = null;
  }
}

/**
 * Subscribe a dashboard surface (admin landing, doctor landing) to
 * the `/dashboard` WS namespace. On any `stats:invalidate` or
 * `slider:changed` event we invalidate the relevant React-Query
 * caches and the page re-fetches once (deduplicated).
 *
 * Idempotent + refcounted — mount it from multiple components
 * safely; the socket is shared.
 */
export function useDashboardSocket(opts: { enabled?: boolean } = {}): void {
  const queryClient = useQueryClient();
  const enabled = opts.enabled ?? true;
  const refOpts = useRef(opts);
  refOpts.current = opts;

  useEffect(() => {
    if (!enabled) return;
    const socket = acquireSocket();
    if (!socket) return;

    const onStatsInvalidate = (_payload: { scope?: string }) => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    };

    const onSliderChanged = () => {
      queryClient.invalidateQueries({ queryKey: sliderMediaKeys.all });
    };

    socket.on('stats:invalidate', onStatsInvalidate);
    socket.on('slider:changed', onSliderChanged);

    return () => {
      socket.off('stats:invalidate', onStatsInvalidate);
      socket.off('slider:changed', onSliderChanged);
      releaseSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, queryClient]);
}
