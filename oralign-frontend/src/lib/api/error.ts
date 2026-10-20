import { AxiosError } from 'axios';
import { toast } from '@/lib/toast';
import {
  apiErrorCopy,
  currentErrorLang,
  type ApiErrorKind,
} from './error-copy';

export type { ApiErrorKind } from './error-copy';

/** Backend error envelope (see AllExceptionsFilter). */
export interface ApiErrorInfo {
  status: number | null;
  message: string;
  errorCode: string | null;
}

/** Everything the UI needs to know about a failed request. */
export interface ClassifiedApiError extends ApiErrorInfo {
  kind: ApiErrorKind;
  /** The backend's own words, when it produced any (already localised). */
  serverMessage: string | null;
  /**
   * Safe to try again without changing anything: the request never
   * reached the API, or the API refused to run it. A timeout is NOT
   * retryable — the request may have been executed.
   */
  retryable: boolean;
}

/** Error code the backend uses when a permanent delete is refused. */
export const DELETION_BLOCKED = 'DELETION_BLOCKED';

/** Error codes nginx stamps on the responses it produces itself. */
const UPSTREAM_CODES = new Set([
  'UPSTREAM_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
  'UPSTREAM_TIMEOUT',
]);

function serverMessageOf(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const message = (data as { message?: unknown }).message;
  if (Array.isArray(message)) return String(message[0] ?? '') || null;
  return typeof message === 'string' && message.trim() ? message : null;
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Sort a failed request into what actually happened. Every kind maps to a
 * distinct situation with a distinct remedy, and the two that used to be
 * confused — "the phone has no signal" and "the API is down" — are now told
 * apart from the evidence the browser gives us:
 *
 *   no response + navigator.onLine false  → offline
 *   no response + axios timeout code       → timeout (request may have run)
 *   no response, online                    → network: DNS, TLS, a dropped
 *                                            connection, or a response the
 *                                            browser refused to expose (CORS)
 *   502 / 503 / 504 from nginx             → upstream: the API is restarting
 *   429                                    → throttled
 */
export function classifyApiError(error: unknown): ClassifiedApiError {
  if (error instanceof AxiosError) {
    const status = error.response?.status ?? null;
    const data = error.response?.data as
      | { message?: unknown; errorCode?: unknown }
      | undefined;
    const errorCode =
      typeof data?.errorCode === 'string' ? data.errorCode : null;
    const serverMessage = serverMessageOf(data);

    if (status === null) {
      if (isOffline()) return build('offline', null, null, null, true);
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return build('timeout', null, null, null, false);
      }
      return build('network', null, null, null, true);
    }

    let kind: ApiErrorKind;
    let retryable = false;
    if (
      status === 502 ||
      status === 503 ||
      status === 504 ||
      (errorCode !== null && UPSTREAM_CODES.has(errorCode))
    ) {
      kind = 'upstream';
      retryable = status !== 504;
    } else if (status === 429) kind = 'throttled';
    else if (status === 401) kind = 'auth';
    else if (status === 403) kind = 'forbidden';
    else if (status === 404) kind = 'not_found';
    else if (status === 409) kind = 'conflict';
    else if (status === 413) kind = 'payload_too_large';
    else if (status === 400 || status === 422) kind = 'validation';
    else if (status >= 500) kind = 'server';
    else kind = 'unknown';

    // nginx's envelope says "the API is temporarily unreachable" — true,
    // but the localised copy says the same thing AND what to do. The
    // throttler's text is a class name; same treatment.
    const useServerMessage =
      serverMessage !== null && kind !== 'upstream' && kind !== 'throttled';
    return build(kind, status, errorCode, useServerMessage ? serverMessage : null, retryable);
  }

  if (error instanceof Error && error.message.trim()) {
    return {
      kind: 'unknown',
      status: null,
      errorCode: null,
      serverMessage: null,
      message: error.message,
      retryable: false,
    };
  }
  return build('unknown', null, null, null, false);
}

function build(
  kind: ApiErrorKind,
  status: number | null,
  errorCode: string | null,
  serverMessage: string | null,
  retryable: boolean,
): ClassifiedApiError {
  return {
    kind,
    status,
    errorCode,
    serverMessage,
    message: serverMessage ?? apiErrorCopy(kind, currentErrorLang()),
    retryable,
  };
}

/**
 * Normalise anything a mutation can throw into {status, message, errorCode}.
 * The backend's own `message` wins over the generic per-kind copy — for a
 * 409 that message is the explanation the user needs ("cannot be
 * permanently deleted because 3 orders depend on it").
 */
export function extractApiError(error: unknown): ApiErrorInfo {
  const { status, message, errorCode } = classifyApiError(error);
  return { status, message, errorCode };
}

export function extractApiErrorMessage(error: unknown): string {
  return classifyApiError(error).message;
}

/**
 * Whether a failed request can be repeated without risk. Used by the
 * query client's retry policy — and only for reads: a mutation that timed
 * out may have been applied, so it is never replayed automatically.
 */
export function isRetryableApiError(error: unknown): boolean {
  return classifyApiError(error).retryable;
}

/** True when the backend refused a permanent delete because history depends on the row. */
export function isDeletionBlocked(error: unknown): boolean {
  const info = extractApiError(error);
  return info.status === 409 && info.errorCode === DELETION_BLOCKED;
}

/**
 * The one way delete / restore / permanent-delete hooks report failure.
 * A 409 (blocked by dependencies, or "still has active orders") is not a
 * transient glitch — it is an explanation — so it stays on screen longer
 * instead of flashing by as a generic error toast.
 */
export function toastMutationError(error: unknown): void {
  const info = extractApiError(error);
  if (info.status === 409) {
    toast.error(info.message, { duration: 9000 });
    return;
  }
  toast.error(info.message);
}
