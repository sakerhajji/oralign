'use client';

import { useRouter } from 'next/navigation';
import { useCreateSupplementalOrder } from '@/lib/hooks/use-supplemental-orders';
import { buildSupplementalWizardHref } from '@/lib/orders/order-navigation';
import type { SupplementalKind } from '@/lib/types';

const STORAGE_PREFIX = 'oralign:supplemental-create';
/** Fallback when sessionStorage is blocked (private mode, sandboxed frames). */
const memoryKeys = new Map<string, string>();

function storageKey(parentOrderId: string, kind: SupplementalKind): string {
  return `${STORAGE_PREFIX}:${parentOrderId}:${kind}`;
}

/** `crypto.randomUUID` is missing outside secure contexts (LAN http on a phone). */
function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function readKey(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key) ?? memoryKeys.get(key) ?? null;
  } catch {
    return memoryKeys.get(key) ?? null;
  }
}

function writeKey(key: string, value: string | null): void {
  if (value === null) memoryKeys.delete(key);
  else memoryKeys.set(key, value);
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the in-memory copy still covers retries.
  }
}

/**
 * Creates a draft request from a click, then opens its wizard. The
 * Idempotency-Key is kept per case and kind until the server confirms,
 * so a retry after a dropped connection replays the same creation
 * instead of opening a second request.
 */
export function useCreateSupplementalDraft() {
  const router = useRouter();
  const create = useCreateSupplementalOrder();

  const start = (
    parentOrderId: string,
    kind: SupplementalKind,
    navigation: 'push' | 'replace' = 'push',
  ) => {
    const key = storageKey(parentOrderId, kind);
    const idempotencyKey = readKey(key) ?? newIdempotencyKey();
    writeKey(key, idempotencyKey);
    create.mutate(
      { parentOrderId, type: kind, idempotencyKey },
      {
        onSuccess: (view) => {
          writeKey(key, null);
          const href = buildSupplementalWizardHref({
            parentOrderId,
            type: kind,
            requestId: view.order.id,
          });
          if (navigation === 'replace') router.replace(href);
          else router.push(href);
        },
      },
    );
  };

  return {
    start,
    /** Kind being created right now, if any. */
    pendingKind: create.isPending ? create.variables.type : null,
  };
}
