/**
 * The words of the payment refusals the API writes in French only
 * (CONTRACT §0: `errorCode` is the contract, the message may change), for
 * the payments that are not receipt uploads (those are explained inline by
 * lib/payments/receipt-errors.ts):
 *
 *   • 400 WITHHOLDING_DISABLED / WITHHOLDING_BELOW_THRESHOLD (spec §4):
 *     the retenue à la source is switched off, or the payment is below the
 *     threshold (the body carries `withholdingThreshold`);
 *   • 409 PAYMENT_ATTEMPT_IN_PROGRESS on a card start or on cash / cheque
 *     received by an admin: another payment of the same installment or fee
 *     is open. A card start is refused only for a bank transfer awaiting
 *     the admin (assertNoOtherPaymentInFlight, the fee's card session);
 *     cash / cheque for that transfer OR for a card attempt not yet
 *     decided, which the caller tells apart from the data read afresh.
 *
 * Pure (no runtime import), so `node --test` runs it as is: see
 * payment-refusals.test.mjs. The caller classifies the error first.
 */

export type RefusalTranslate = (key: string, vars?: Record<string, string | number>) => string;

/** Who reads the refusal: the admin recording it, or the paying doctor. */
export type RefusalAudience = 'admin' | 'doctor';

/** What holds the payment back; `unknown` when the fresh data cannot tell. */
export type InFlightPayment = 'transfer' | 'card' | 'unknown';

/** How the new payment was to be made. */
export type RefusedMethod = 'card' | 'cash' | 'cheque';

export const PAYMENT_ATTEMPT_IN_PROGRESS = 'PAYMENT_ATTEMPT_IN_PROGRESS';
const WITHHOLDING_DISABLED = 'WITHHOLDING_DISABLED';
const WITHHOLDING_BELOW_THRESHOLD = 'WITHHOLDING_BELOW_THRESHOLD';

/** The threshold a 400 WITHHOLDING_BELOW_THRESHOLD carries in its body. */
export function thresholdOfBody(body: unknown): number | null {
  if (!body || typeof body !== 'object') return null;
  const value = (body as Record<string, unknown>).withholdingThreshold;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * The retenue refusal in the user's language (the threshold formatted by
 * `money` when the body carries it); null for any other error.
 */
export function withholdingRefusalText(
  errorCode: string | null | undefined,
  body: unknown,
  t: RefusalTranslate,
  money: (value: number) => string,
): string | null {
  if (errorCode === WITHHOLDING_DISABLED) return t('withholdingRules.errors.disabled');
  if (errorCode !== WITHHOLDING_BELOW_THRESHOLD) return null;
  const threshold = thresholdOfBody(body);
  return threshold === null
    ? t('withholdingRules.errors.belowThresholdNoAmount')
    : t('withholdingRules.errors.belowThreshold', { threshold: money(threshold) });
}

export function isPaymentAttemptInProgress(errorCode: string | null | undefined): boolean {
  return errorCode === PAYMENT_ATTEMPT_IN_PROGRESS;
}

/**
 * What a 409 PAYMENT_ATTEMPT_IN_PROGRESS means for this method: a card
 * start is only ever refused for a transfer awaiting the admin; cash or a
 * cheque for that transfer when the fresh data shows one in flight, else
 * for a card attempt (`transferAwaiting` null: the data could not be read).
 */
export function inFlightPaymentOf(
  method: RefusedMethod,
  transferAwaiting: boolean | null,
): InFlightPayment {
  if (method === 'card') return 'transfer';
  if (transferAwaiting === null) return 'unknown';
  return transferAwaiting ? 'transfer' : 'card';
}

/** Dictionary key of the in-flight refusal (transfers.inFlight.*). */
export function inFlightRefusalKey(audience: RefusalAudience, payment: InFlightPayment): string {
  return payment === 'unknown'
    ? 'transfers.inFlight.unknown'
    : `transfers.inFlight.${audience}.${payment}`;
}
