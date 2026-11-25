import { ProductionNoticeStatus } from '@prisma/client';
import {
  NOTICE_MAX_ATTEMPTS,
  NOTICE_RETRY_BACKOFF_MS,
} from '../production.constants';

/**
 * The dispatcher's decisions, as pure functions (CONTRACT.md §3.5), so the
 * retry and correction rules are tested without a database or a clock.
 */

/** ProductionNotice.lastError is kept short: an admin reads it in a table cell. */
export const LAST_ERROR_MAX_LENGTH = 500;

/** A row whose attempts reached this is failed for good (no automatic retry). */
export function isFinalAttempt(attempts: number): boolean {
  return attempts >= NOTICE_MAX_ATTEMPTS;
}

/**
 * Wait before the next try after the `attempts`-th failure (1-based):
 * NOTICE_RETRY_BACKOFF_MS[attempts - 1], its last value repeating.
 */
export function retryDelayMs(attempts: number): number {
  const index = Math.min(
    Math.max(attempts, 1) - 1,
    NOTICE_RETRY_BACKOFF_MS.length - 1,
  );
  return NOTICE_RETRY_BACKOFF_MS[index];
}

/** The text stored in lastError: the error's message, one line, bounded. */
export function errorText(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message || error.name
      : typeof error === 'string'
        ? error
        : 'Unknown error';
  const line = raw.replace(/\s+/g, ' ').trim() || 'Unknown error';
  return line.length > LAST_ERROR_MAX_LENGTH
    ? `${line.slice(0, LAST_ERROR_MAX_LENGTH - 1)}…`
    : line;
}

/** What to do with a claimed correction, given its delivered notice on the same channel. */
export type CorrectionDecision =
  /** The original reached the practitioner: send the correction. */
  | 'send'
  /** The original will never reach them (skipped, failed for good, or never written). */
  | 'skip'
  /** The original is still in flight: wait for it, without spending an attempt. */
  | 'wait';

export function correctionDecision(
  original: { status: ProductionNoticeStatus; attempts: number } | null,
): CorrectionDecision {
  if (!original) return 'skip';
  switch (original.status) {
    case ProductionNoticeStatus.sent:
      return 'send';
    case ProductionNoticeStatus.skipped:
      return 'skip';
    case ProductionNoticeStatus.failed:
      return isFinalAttempt(original.attempts) ? 'skip' : 'wait';
    case ProductionNoticeStatus.pending:
    case ProductionNoticeStatus.sending:
      // Rendered before the cancel and accepted later, it must still be
      // corrected: keep the correction until it settles.
      return 'wait';
  }
}
