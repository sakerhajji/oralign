/**
 * Read a fetch Response body into an ArrayBuffer while reporting download
 * progress — the missing piece behind every "real" progress bar over
 * `fetch()`, which only exposes `arrayBuffer()` (all-or-nothing).
 *
 * Progress is a percentage in [0, 100] when a byte total is known, or
 * `null` when it isn't, so callers can render an indeterminate bar rather
 * than a fill frozen at 0 %. The total comes from, in order:
 *   1. `Content-Length` — only trusted when the body is NOT
 *      content-encoded (a gzip'd response reports the compressed size,
 *      which would make the bar overshoot past 100 %);
 *   2. `expectedBytes` — the caller's best-known size (e.g. the DB row's
 *      stored size);
 *   3. otherwise unknown → `null` progress until done.
 *
 * Falls back to `response.arrayBuffer()` when the stream API isn't
 * available (old Safari / some in-app webviews). Never throws for
 * progress reasons — a progress bar must not be able to break the load.
 */
export async function readBodyWithProgress(
  response: Response,
  expectedBytes: number | undefined,
  onProgress: (percent: number | null) => void,
): Promise<ArrayBuffer> {
  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    onProgress(null);
    return response.arrayBuffer();
  }

  const encoded = response.headers.get('content-encoding');
  const headerLength = Number(response.headers.get('content-length'));
  const total =
    !encoded && Number.isFinite(headerLength) && headerLength > 0
      ? headerLength
      : expectedBytes && expectedBytes > 0
        ? expectedBytes
        : null;

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  onProgress(total ? 0 : null);

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    if (total) {
      // Cap at 99 until the stream actually closes so the bar never
      // reads "100 %" while bytes are still in flight (an over-estimate
      // of `total` would otherwise do exactly that).
      onProgress(Math.min(99, (received / total) * 100));
    }
  }

  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onProgress(100);
  return out.buffer;
}
