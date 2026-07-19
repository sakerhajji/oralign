import apiClient from './client';
import { OrderFile, OrderFileCategory } from '@/lib/types';

/**
 * Chunked / resumable upload client for large order files (CBCT ZIP
 * bundles). Counterpart of the backend's /orders/:id/files/chunked
 * endpoints:
 *
 *   • one small request per chunk (server-owned chunk size, 8 MiB) so a
 *     network blip costs ONE chunk, not the whole gigabyte;
 *   • each chunk retries up to 3 times with backoff before giving up;
 *   • init is resume-aware — re-calling it for the same (name, size,
 *     category) returns the existing session with the chunks already
 *     received, so an interrupted upload continues where it stopped;
 *   • progress is real bytes-on-the-wire, already-received chunks
 *     included, capped at 99% until the server confirms assembly.
 *
 * The single-shot ordersService.uploadFiles stays the right tool for
 * small files — callers switch to this above CHUNKED_UPLOAD_THRESHOLD.
 */

/** Files larger than this go through the chunked path. */
export const CHUNKED_UPLOAD_THRESHOLD_BYTES = 32 * 1024 * 1024; // 32 MiB

export type ChunkedUploadPhase = 'preparing' | 'uploading' | 'finalizing';

export interface ChunkedUploadOptions {
  onProgress?: (percent: number) => void;
  onPhase?: (phase: ChunkedUploadPhase) => void;
  signal?: AbortSignal;
}

interface ChunkedSessionState {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: number[];
  status: 'active' | 'assembling' | 'completed' | 'failed';
}

/** Error with a resume hint — the server session survives, so calling
 *  uploadFileChunked again with the same file picks up where it left off. */
export interface ResumableUploadError extends Error {
  resumable?: boolean;
}

const CHUNK_RETRIES = 3;
const CHUNK_TIMEOUT_MS = 120_000;
const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000];

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/** 4xx responses (except 408/429) are deterministic — retrying is noise. */
function isRetryable(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  if (status === undefined) return true; // network / timeout
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

async function putChunkWithRetry(
  orderId: string,
  uploadId: string,
  index: number,
  blob: Blob,
  signal?: AbortSignal,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= CHUNK_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const form = new FormData();
      form.append('chunk', blob, `part-${index}`);
      await apiClient.put(
        `/orders/${orderId}/files/chunked/${uploadId}/chunks/${index}`,
        form,
        { timeout: CHUNK_TIMEOUT_MS, signal },
      );
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === CHUNK_RETRIES) throw error;
      await sleep(RETRY_BACKOFF_MS[attempt] ?? 4_000, signal);
    }
  }
  throw lastError;
}

/**
 * Upload one large file through the chunked pipeline. Returns the
 * registered OrderFile wrapped in an array so callers can swap it in
 * for ordersService.uploadFiles without reshaping their handlers.
 */
export async function uploadFileChunked(
  orderId: string,
  file: File,
  category: OrderFileCategory,
  opts: ChunkedUploadOptions = {},
): Promise<OrderFile[]> {
  const { onProgress, onPhase, signal } = opts;

  onPhase?.('preparing');
  const init = await apiClient.post<ChunkedSessionState>(
    `/orders/${orderId}/files/chunked`,
    {
      fileName: file.name,
      size: file.size,
      mimeType: file.type || undefined,
      category,
    },
    { signal },
  );
  const session = init.data;
  const received = new Set(session.receivedChunks);

  const chunkBytes = (index: number) =>
    index < session.totalChunks - 1
      ? session.chunkSize
      : file.size - session.chunkSize * (session.totalChunks - 1);

  let bytesDone = session.receivedChunks.reduce(
    (sum, index) => sum + chunkBytes(index),
    0,
  );
  const report = () =>
    onProgress?.(
      Math.min(99, Math.round((bytesDone * 100) / Math.max(1, file.size))),
    );

  onPhase?.('uploading');
  report();

  let uploadedAny = false;
  try {
    for (let index = 0; index < session.totalChunks; index++) {
      if (received.has(index)) continue;
      const start = index * session.chunkSize;
      const blob = file.slice(start, start + chunkBytes(index));
      await putChunkWithRetry(orderId, session.uploadId, index, blob, signal);
      uploadedAny = true;
      bytesDone += blob.size;
      report();
    }

    onPhase?.('finalizing');
    const complete = await apiClient.post<OrderFile>(
      `/orders/${orderId}/files/chunked/${session.uploadId}/complete`,
      undefined,
      // Assembly + scan of a 1 GB file is disk-bound — allow a few minutes.
      { timeout: 10 * 60_000, signal },
    );
    onProgress?.(100);
    return [complete.data];
  } catch (error) {
    // The session (and every uploaded chunk) survives server-side —
    // flag the error so the UI can offer "Resume" instead of restarting.
    const resumable = error as ResumableUploadError;
    if (uploadedAny || received.size > 0) resumable.resumable = true;
    throw resumable;
  }
}

/** Abort an in-flight session and reclaim its server-side parts. */
export async function abortChunkedUpload(
  orderId: string,
  uploadId: string,
): Promise<void> {
  await apiClient.delete(`/orders/${orderId}/files/chunked/${uploadId}`);
}
