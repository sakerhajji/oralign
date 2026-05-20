'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/api';
import { treatmentPlanKeys } from './use-treatment-plans';
import { orderKeys } from './use-orders';
import type { TreatmentMessage } from '@/lib/types';

/**
 * Subscribes to an ORDER's chat + plan-lifecycle room and updates the React
 * Query cache as events arrive. The conversation lives at the order level
 * (one thread per order, shared across every plan version), so the room is
 * keyed by orderId — not by treatmentPlanId as before.
 *
 * Listens for three event types:
 *   • message:new     — append to every review payload under this order
 *   • message:deleted — invalidate plan reviews so deletion shows up
 *   • plan:changed    — invalidate the plan list (and the affected
 *                       review) so a new / updated / approved / rejected
 *                       plan appears without a hard refresh.
 *
 * The REST endpoints remain the source of truth; sockets are a push
 * channel that keeps open tabs in sync.
 */
export function useTreatmentChatSocket(orderId: string | null) {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    const token = getAccessToken();
    if (!token) return;

    const apiBase =
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';
    // Strip the trailing /api (and any sub-path) — socket.io connects to
    // the server origin, not the REST prefix.
    const origin = apiBase.replace(/\/api\/?$/, '');

    const socket = io(`${origin}/treatment-chat`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 8_000,
    });
    socketRef.current = socket;

    const joinRoom = () => {
      socket.emit('join', { orderId });
    };

    socket.on('connect', () => {
      setConnected(true);
      joinRoom();
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('message:new', (msg: TreatmentMessage) => {
      // The conversation is order-scoped, but each plan's `review`
      // payload carries the same message list (server returns the full
      // order thread on every review fetch). We append the new message
      // to EVERY review cache entry under this order. Simplest correct
      // implementation: invalidate all review queries — TanStack Query
      // will refetch only the ones that have active observers.
      queryClient.invalidateQueries({
        queryKey: treatmentPlanKeys.all,
        predicate: (q) => q.queryKey[0] === 'treatment-plans',
      });
    });

    socket.on('message:deleted', () => {
      queryClient.invalidateQueries({
        queryKey: treatmentPlanKeys.all,
        predicate: (q) => q.queryKey[0] === 'treatment-plans',
      });
    });

    socket.on(
      'plan:changed',
      (evt: {
        orderId: string;
        type: 'created' | 'updated' | 'ready' | 'approved' | 'rejected';
        planId: string;
      }) => {
        // Refresh the list of plans under this order so a newly-created
        // plan appears in the tab strip without a hard refresh, and
        // status transitions update the badges.
        queryClient.invalidateQueries({
          queryKey: treatmentPlanKeys.byOrder(evt.orderId),
        });
        // Also refresh the affected plan's review so the open tab picks
        // up the new status / fields immediately.
        queryClient.invalidateQueries({
          queryKey: treatmentPlanKeys.review(evt.planId),
        });
        // The orders list shows a "latestPlanStatus" badge — refresh it
        // so the dashboard list is in sync too.
        queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
        queryClient.invalidateQueries({
          queryKey: orderKeys.detail(evt.orderId),
        });
      },
    );

    return () => {
      socket.emit('leave', { orderId });
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [queryClient, orderId]);

  return { connected };
}
