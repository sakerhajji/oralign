import { AxiosError } from 'axios';
import { toast } from 'sonner';

/** Backend error envelope (see AllExceptionsFilter). */
export interface ApiErrorInfo {
  status: number | null;
  message: string;
  errorCode: string | null;
}

/** Error code the backend uses when a permanent delete is refused. */
export const DELETION_BLOCKED = 'DELETION_BLOCKED';

/**
 * Normalise anything a mutation can throw into {status, message, errorCode}.
 * The backend's own `message` always wins over the generic per-status
 * fallback — for a 409 that message is the explanation the user needs
 * ("cannot be permanently deleted because 3 orders depend on it").
 */
export function extractApiError(error: unknown): ApiErrorInfo {
  if (error instanceof AxiosError) {
    const data = error.response?.data as
      | { message?: unknown; errorCode?: unknown }
      | undefined;
    const status = error.response?.status ?? null;
    const errorCode =
      typeof data?.errorCode === 'string' ? data.errorCode : null;
    let message: string | null = null;
    if (Array.isArray(data?.message)) message = String(data.message[0] ?? '');
    else if (typeof data?.message === 'string') message = data.message;
    if (!message) {
      if (status === 401) message = 'You are not authenticated. Please log in again.';
      else if (status === 403) message = 'You do not have permission to perform this action.';
      else if (status === 404) message = 'The requested resource was not found.';
      else if (status === 409) message = 'A conflict occurred. This record may already exist.';
      else if (status === 422) message = 'Validation failed. Please check your input.';
      else if (status && status >= 500) message = 'Server error. Please try again later.';
      else if (error.message === 'Network Error') message = 'Network error. Please check your connection.';
    }
    return { status, message: message ?? 'An unexpected error occurred.', errorCode };
  }
  if (error instanceof Error) return { status: null, message: error.message, errorCode: null };
  return { status: null, message: 'An unexpected error occurred.', errorCode: null };
}

export function extractApiErrorMessage(error: unknown): string {
  return extractApiError(error).message;
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
