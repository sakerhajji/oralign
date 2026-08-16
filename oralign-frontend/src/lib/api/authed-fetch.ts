import { ensureValidAccessToken } from './client';

/**
 * THE way to call the API with `fetch` when axios is the wrong tool
 * (streamed downloads with progress, blobs, AbortSignal-driven cancels).
 *
 * Why not sprinkle `fetch(url, { headers: { Authorization: ... } })`
 * around? Two reasons that bit us:
 *   1. Those sites read `getAccessToken()` — the RAW stored token — so a
 *      tab left open past the 15-minute access-token life sent a dead
 *      token and got a 401 that no interceptor could rescue. This helper
 *      goes through `ensureValidAccessToken()`, which refreshes first
 *      when the token is expired or about to be.
 *   2. Every copy re-derived the header shape and the "no token → no
 *      header" branch. One implementation, one place to fix.
 *
 * Returns the raw `Response` so callers keep full control over streaming
 * (`response.body.getReader()`), status handling and content-type checks.
 */
export async function authedFetch(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = await ensureValidAccessToken();
  const headers = new Headers(init.headers ?? undefined);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}

/**
 * Convenience for the common "download a protected file as a Blob" case:
 * authenticated GET, throws on any non-2xx status with the HTTP code in
 * the message so the UI can show something more useful than "failed".
 */
export async function fetchAuthedBlob(
  url: string | URL,
  init: { signal?: AbortSignal } = {},
): Promise<Blob> {
  const response = await authedFetch(url, { signal: init.signal });
  if (!response.ok) {
    throw new Error(`Download failed (HTTP ${response.status})`);
  }
  return response.blob();
}
