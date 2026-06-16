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

/**
 * Conversation rooms the tab currently wants to be in, ref-counted so
 * two components viewing the SAME conversation don't leave the room
 * when only one of them unmounts. The single `connect` handler
 * installed in `acquireSocket` replays every room here on (re)connect,
 * so a network blip / server restart / reconnection never silently
 * drops us out of `conv:<id>` and stops `message:new` from arriving.
 * This was the core "not real-time" bug: the old hook emitted `join`
 * exactly once and never re-joined after a reconnect.
 */
const roomRefs = new Map<string, number>();

function getNamespaceUrl(): string {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';
  // The Nest app prefixes routes with /api but the socket.io server
  // mounts the namespace at /support-chat without that prefix.
  return apiUrl.replace(/\/api\/?$/, '');
}

function joinRoom(id: string): void {
  if (sharedSocket?.connected) {
    sharedSocket.emit('join', { conversationId: id });
  }
  // If not yet connected, the `connect` handler below replays the
  // whole roomRefs set once the connection is up.
}

function acquireSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  const token = getAccessToken();
  if (!token) return null;

  refCount += 1;

  if (sharedSocket) return sharedSocket;

  const socket = io(`${getNamespaceUrl()}/support-chat`, {
    // Pass auth as a FUNCTION, not a frozen `{ token }` object: socket.io
    // re-sends whatever is here on every (re)connect, and the access token
    // expires after 15 min. A captured token would be dead on the first
    // reconnect after expiry, the gateway would reject the handshake, and
    // (with reconnection on) the client would retry forever with the same
    // stale token — realtime silently dead until a full page reload.
    // Re-reading live localStorage here means every reconnect carries a
    // fresh token (the axios refresh interceptor keeps it current).
    auth: (cb) => cb({ token: getAccessToken() ?? '' }),
    // Keep the websocket transport first for low latency, but ALWAYS
    // allow the long-polling fallback so the chat still works when the
    // WS upgrade is blocked (strict proxies, some corporate networks).
    // Websocket-only used to make the socket silently never connect in
    // those environments — and with no realtime, every message needed
    // a manual page refresh.
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 8_000,
    // No attempt cap — recover from transient outages indefinitely
    // instead of giving up permanently after a handful of tries.
  });

  // Re-join every wanted room on EVERY (re)connect. socket.io's `join`
  // is idempotent server-side, so replaying on the first connect (when
  // a room was registered while still handshaking) is harmless.
  socket.on('connect', () => {
    for (const id of roomRefs.keys()) {
      socket.emit('join', { conversationId: id });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    socket.on('connect_error', (err) => {
      // Surfaced only in dev so a broken handshake (bad token, CORS,
      // blocked transport) is visible instead of failing silently.
      // eslint-disable-next-line no-console
      console.warn('[support-socket] connect_error:', err.message);
    });
  }

  sharedSocket = socket;
  return sharedSocket;
}

function releaseSocket(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && sharedSocket) {
    sharedSocket.removeAllListeners();
    sharedSocket.disconnect();
    sharedSocket = null;
    roomRefs.clear();
  }
}

function retainRoom(id: string): void {
  const next = (roomRefs.get(id) ?? 0) + 1;
  roomRefs.set(id, next);
  if (next === 1) joinRoom(id); // first viewer of this conversation
}

function releaseRoom(id: string): void {
  const current = roomRefs.get(id) ?? 0;
  if (current <= 1) {
    roomRefs.delete(id);
    if (sharedSocket?.connected) {
      sharedSocket.emit('leave', { conversationId: id });
    }
  } else {
    roomRefs.set(id, current - 1);
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

    // The other side marked the thread read → refresh the open thread so
    // our sent bubbles flip to "read" live.
    const onReadBy = ({ conversationId }: { conversationId: string }) => {
      queryClient.invalidateQueries({
        queryKey: supportKeys.detail(conversationId),
      });
    };

    socket.on('message:new', onMessageNew);
    socket.on('conversation:created', onConvTouched);
    socket.on('conversation:touched', onConvTouched);
    socket.on('conversation:updated', onConvUpdated);
    socket.on('conversation:deleted', onConvDeleted);
    socket.on('read:by', onReadBy);

    // Join the focused conversation room (ref-counted + replayed on
    // every reconnect via the `connect` handler in acquireSocket).
    const room = opts.conversationId ?? null;
    if (room) retainRoom(room);

    return () => {
      socket.off('message:new', onMessageNew);
      socket.off('conversation:created', onConvTouched);
      socket.off('conversation:touched', onConvTouched);
      socket.off('conversation:updated', onConvUpdated);
      socket.off('conversation:deleted', onConvDeleted);
      socket.off('read:by', onReadBy);
      if (room) releaseRoom(room);
      releaseSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, opts.conversationId, queryClient]);
}
