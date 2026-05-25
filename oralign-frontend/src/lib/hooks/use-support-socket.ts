'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { getAccessToken } from '@/lib/api/client';
import { supportKeys } from './use-support';
import type { SupportMessage } from '@/lib/types';

/**
 * Lazy singleton socket connection to /support-chat. We keep one
 * shared socket per browser tab so multiple components (the bubble +
 * the admin page open at the same time) re-use it instead of opening
 * two parallel WS connections.
 */
let sharedSocket: Socket | null = null;
let refCount = 0;

function getNamespaceUrl(): string {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';
  // The Nest app prefixes routes with /api but the socket.io server
  // mounts the namespace at /support-chat without that prefix.
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
    sharedSocket = io(`${getNamespaceUrl()}/support-chat`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1500,
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
 * Subscribe a component to the support WS stream. Invalidates the
 * matching React-Query cache entries when a message lands so the UI
 * refreshes without polling.
 *
 * Optionally joins a specific conversation room when `conversationId`
 * is provided — used by the doctor bubble + admin chat view to get
 * real-time message:new events for the conversation they're viewing.
 */
export function useSupportSocket(opts: {
  conversationId?: string | null;
  enabled?: boolean;
  /** Called whenever a `message:new` event lands. */
  onNewMessage?: (message: SupportMessage) => void;
  /** Called when the open conversation is admin-deleted. */
  onConversationDeleted?: (conversationId: string) => void;
}): void {
  const queryClient = useQueryClient();
  const enabled = opts.enabled ?? true;
  const handlersRef = useRef(opts);
  handlersRef.current = opts;

  useEffect(() => {
    if (!enabled) return;
    const socket = acquireSocket();
    if (!socket) return;

    const onMessageNew = (msg: SupportMessage) => {
      // Always invalidate caches — both the conversation thread + the
      // list + the unread count.
      queryClient.invalidateQueries({
        queryKey: supportKeys.detail(msg.conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: supportKeys.conversations(),
      });
      queryClient.invalidateQueries({ queryKey: supportKeys.unread() });
      handlersRef.current.onNewMessage?.(msg);
    };

    const onConvTouched = () => {
      queryClient.invalidateQueries({ queryKey: supportKeys.conversations() });
      queryClient.invalidateQueries({ queryKey: supportKeys.unread() });
    };

    const onConvUpdated = ({ conversationId }: { conversationId: string }) => {
      queryClient.invalidateQueries({
        queryKey: supportKeys.detail(conversationId),
      });
      queryClient.invalidateQueries({ queryKey: supportKeys.conversations() });
    };

    const onConvDeleted = ({ conversationId }: { conversationId: string }) => {
      queryClient.invalidateQueries({ queryKey: supportKeys.conversations() });
      queryClient.removeQueries({
        queryKey: supportKeys.detail(conversationId),
      });
      handlersRef.current.onConversationDeleted?.(conversationId);
    };

    socket.on('message:new', onMessageNew);
    socket.on('conversation:created', onConvTouched);
    socket.on('conversation:touched', onConvTouched);
    socket.on('conversation:updated', onConvUpdated);
    socket.on('conversation:deleted', onConvDeleted);

    // Optional room join for the focused conversation
    if (opts.conversationId) {
      socket.emit('join', { conversationId: opts.conversationId });
    }

    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('conversation:created', onConvTouched);
      socket.off('conversation:touched', onConvTouched);
      socket.off('conversation:updated', onConvUpdated);
      socket.off('conversation:deleted', onConvDeleted);
      if (opts.conversationId) {
        socket.emit('leave', { conversationId: opts.conversationId });
      }
      releaseSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, opts.conversationId, queryClient]);
}
