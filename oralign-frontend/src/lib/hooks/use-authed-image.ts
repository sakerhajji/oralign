'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/lib/api/client';

/**
 * Fetch a JWT-gated image URL (e.g. `/api/support/attachments/...`)
 * via the authenticated axios instance, convert the response to a
 * blob, and expose it as an `object:` URL the browser can render with
 * a plain `<img src>`.
 *
 * The native `<img src>` tag does NOT send Authorization headers, so
 * pointing it at a Bearer-protected route returns 401. This hook
 * sidesteps that by doing the fetch in JS (where axios attaches the
 * token), then handing the resulting blob to the browser as a local
 * URL.
 *
 * Module-level LRU cache
 * ──────────────────────
 * Phone-camera clinical photos are 4–12 MB each. The previous
 * implementation refetched every time the component remounted (e.g.
 * the user navigates away and back, or React strict-mode unmounts a
 * dev render), turning every revisit into a multi-second wait. We
 * now keep an in-memory map from URL → blob-URL. A repeat
 * `useAuthedImage(url)` for the same URL hands back the cached blob
 * URL synchronously — the browser only sees the network hit once
 * per session per image.
 *
 * Eviction: hard cap at MAX_CACHE_ENTRIES. When full we drop the
 * least-recently-accessed entry and revoke its blob URL. That keeps
 * the page memory bounded even if a clinic uploads 100+ photos in
 * one session. The cap is generous enough (50) that the same set of
 * images rendered across the wizard + detail view never thrash.
 *
 * In-flight dedupe: when two components request the same URL at the
 * same time, we cache the Promise so only one axios call goes out.
 */

const MAX_CACHE_ENTRIES = 50;
type CacheEntry = { promise: Promise<string>; blobUrl?: string };
const blobCache = new Map<string, CacheEntry>();

function touchCacheKey(key: string): void {
  // Re-inserting moves to the end (most-recent). Map preserves
  // insertion order, so the first key is always the LRU candidate.
  const entry = blobCache.get(key);
  if (!entry) return;
  blobCache.delete(key);
  blobCache.set(key, entry);
}

function evictIfNeeded(): void {
  while (blobCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = blobCache.keys().next().value;
    if (!oldestKey) break;
    const entry = blobCache.get(oldestKey);
    if (entry?.blobUrl) URL.revokeObjectURL(entry.blobUrl);
    blobCache.delete(oldestKey);
  }
}

function fetchBlobUrl(url: string): Promise<string> {
  const existing = blobCache.get(url);
  if (existing) {
    touchCacheKey(url);
    return existing.promise;
  }
  const promise = apiClient
    .get<Blob>(url, { responseType: 'blob' })
    .then((res) => {
      const objectUrl = URL.createObjectURL(res.data);
      const entry = blobCache.get(url);
      if (entry) entry.blobUrl = objectUrl;
      return objectUrl;
    })
    .catch((err: Error) => {
      // Failed fetches shouldn't poison the cache — drop the entry
      // so the next call retries instead of replaying the rejection.
      blobCache.delete(url);
      throw err;
    });
  blobCache.set(url, { promise });
  evictIfNeeded();
  return promise;
}

export function useAuthedImage(url: string | null | undefined): {
  src: string | null;
  loading: boolean;
  error: Error | null;
} {
  const [state, setState] = useState<{
    url: string | null;
    src: string | null;
    loading: boolean;
    error: Error | null;
  }>(() => {
    // Synchronously hand back the cached blob URL on first render
    // when the image is already in cache — avoids the brief skeleton
    // flash on every re-mount of an already-loaded photo.
    if (!url) return { url: null, src: null, loading: false, error: null };
    const entry = blobCache.get(url);
    if (entry?.blobUrl) {
      touchCacheKey(url);
      return { url, src: entry.blobUrl, loading: false, error: null };
    }
    return { url, src: null, loading: true, error: null };
  });

  useEffect(() => {
    let cancelled = false;

    if (!url) return;

    // Cached + ready → done.
    const entry = blobCache.get(url);
    const cachedBlobUrl = entry?.blobUrl;
    if (cachedBlobUrl) {
      queueMicrotask(() => {
        if (cancelled) return;
        touchCacheKey(url);
        setState({ url, src: cachedBlobUrl, loading: false, error: null });
      });
      return;
    }

    fetchBlobUrl(url)
      .then((blobUrl) => {
        if (cancelled) return;
        setState({ url, src: blobUrl, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({ url, src: null, loading: false, error: err });
      });

    return () => {
      cancelled = true;
      // IMPORTANT: do NOT revoke the blob URL here. With caching it
      // lives at module scope and may still be in use by another
      // mount. Eviction handles revocation when the cache is full.
    };
  }, [url]);

  const hasCurrentState = !!url && state.url === url;
  return {
    src: hasCurrentState ? state.src : null,
    loading: url ? (hasCurrentState ? state.loading : true) : false,
    error: hasCurrentState ? state.error : null,
  };
}
