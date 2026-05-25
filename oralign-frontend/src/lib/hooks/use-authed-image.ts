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
 * URL. The lightbox + chat bubble share the same blob URL — only one
 * round-trip per image.
 *
 * Lifecycle:
 *   • On `url` change → revoke the previous object URL and fetch the
 *     new one. Prevents memory leaks even if the user scrolls through
 *     dozens of images.
 *   • On unmount → revoke the active object URL.
 *   • Stale fetches (url changed mid-flight) are dropped via a local
 *     `cancelled` flag so the older response can never overwrite the
 *     newer one.
 */
export function useAuthedImage(url: string | null | undefined): {
  src: string | null;
  loading: boolean;
  error: Error | null;
} {
  const [state, setState] = useState<{
    src: string | null;
    loading: boolean;
    error: Error | null;
  }>({ src: null, loading: !!url, error: null });

  useEffect(() => {
    let cancelled = false;
    let createdObjectUrl: string | null = null;

    if (!url) {
      setState({ src: null, loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    apiClient
      .get<Blob>(url, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        createdObjectUrl = URL.createObjectURL(res.data);
        setState({ src: createdObjectUrl, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({ src: null, loading: false, error: err });
      });

    return () => {
      cancelled = true;
      // The object URL we created in this effect run can be revoked
      // safely — the React reconciler has already swapped the <img>
      // away by the time cleanup runs.
      if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
    };
  }, [url]);

  return state;
}
