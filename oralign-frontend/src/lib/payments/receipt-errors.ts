/**
 * What a failed receipt upload (or withdrawal) means for the doctor, keyed
 * by the API's stable errorCode (TRANSFER_ERROR / WITHHOLDING_ERROR in
 * lib/types/billing.ts, CONTRACT §3), never by its French message. Each
 * case says whether trying again as is makes sense and whether the screen
 * should refetch (the transfer moved on the server meanwhile).
 *
 * Pure (no axios, no React): the caller classifies the error first
 * (classifyApiError in lib/api/error.ts) and passes its status, errorCode
 * and kind. Tested by receipt-errors.test.mjs.
 */
import type { ReceiptRefusal } from './compress-receipt';

export type ReceiptErrorKind =
  | 'empty'
  | 'type'
  | 'heic_unsupported'
  | 'too_large'
  | 'proof_required'
  | 'in_flight'
  | 'not_withdrawable'
  | 'already_processed'
  | 'withholding'
  | 'nothing_due'
  | 'network'
  | 'timeout'
  | 'throttled'
  | 'server';

export interface ReceiptErrorView {
  kind: ReceiptErrorKind;
  /** Dictionary key of the explanation (transfers.errors.<kind>). */
  messageKey: string;
  /** The same request may simply be sent again (the Idempotency-Key makes it safe). */
  retryable: boolean;
  /** The transfer changed on the server: the screen should reload it. */
  refetch: boolean;
  /** A fresh Idempotency-Key is needed before another attempt. */
  newKey: boolean;
}

/** The failed request, as lib/api/error.ts classifies it. */
export interface ReceiptErrorInput {
  status: number | null;
  errorCode: string | null;
  /** ApiErrorKind: offline, timeout, network, upstream, throttled, validation… */
  kind: string;
}

function view(
  kind: ReceiptErrorKind,
  flags: Partial<Pick<ReceiptErrorView, 'retryable' | 'refetch' | 'newKey'>> = {},
): ReceiptErrorView {
  return {
    kind,
    messageKey: `transfers.errors.${kind}`,
    retryable: flags.retryable ?? false,
    refetch: flags.refetch ?? false,
    newKey: flags.newKey ?? false,
  };
}

const BY_CODE: Readonly<Record<string, () => ReceiptErrorView>> = {
  RECEIPT_TYPE: () => view('type'),
  RECEIPT_TOO_LARGE: () => view('too_large'),
  PROOF_REQUIRED: () => view('proof_required'),
  // Another payment of this installment is open (a card attempt, or a
  // transfer of another kind): the panel must show it.
  PAYMENT_ATTEMPT_IN_PROGRESS: () => view('in_flight', { refetch: true }),
  TRANSFER_NOT_WITHDRAWABLE: () => view('not_withdrawable', { refetch: true }),
  TRANSFER_ALREADY_PROCESSED: () => view('already_processed', { refetch: true }),
  // The installment was paid meanwhile (the transfer confirmed while the
  // doctor was replacing its receipt): nothing is left to declare.
  INSTALLMENT_ALREADY_PAID: () => view('already_processed', { refetch: true }),
  // A key the server refuses: the next attempt goes with a new one.
  TRANSFER_IDEMPOTENCY_KEY_INVALID: () => view('server', { retryable: true, newKey: true }),
  TRANSFER_IDEMPOTENCY_KEY_REUSED: () => view('server', { retryable: true, newKey: true }),
  // The retenue choice no longer holds (switched off, below the
  // threshold, an open card attempt with the other choice, a new charge).
  WITHHOLDING_DISABLED: () => view('withholding', { refetch: true }),
  WITHHOLDING_BELOW_THRESHOLD: () => view('withholding', { refetch: true }),
  WITHHOLDING_CHOICE_CONFLICT: () => view('withholding', { refetch: true }),
  PAYMENT_CHARGE_CHANGED: () => view('withholding', { refetch: true }),
  WELCOME_GIFT_NOTHING_DUE: () => view('nothing_due', { refetch: true }),
};

/** The doctor-facing meaning of a failed upload. */
export function receiptUploadError(input: ReceiptErrorInput): ReceiptErrorView {
  const byCode = input.errorCode ? BY_CODE[input.errorCode] : undefined;
  if (byCode) return byCode();
  if (input.status === 413 || input.kind === 'payload_too_large') return view('too_large');
  switch (input.kind) {
    case 'offline':
    case 'network':
    case 'upstream':
      return view('network', { retryable: true });
    case 'timeout':
      // The upload may have landed: the same key makes the replay safe.
      return view('timeout', { retryable: true, refetch: true });
    case 'throttled':
      return view('throttled', { retryable: true });
    case 'conflict':
      return view('already_processed', { refetch: true });
    default:
      return view('server', { retryable: input.status === null || input.status >= 500 });
  }
}

/**
 * The doctor-facing meaning of a file refused before any upload.
 * `camera`: the picker offers « Prendre une photo » (a coarse pointer, the
 * same media query that shows the button); without it, the HEIC advice
 * names the remedies a desktop has (convert it, a screenshot, a PDF).
 */
export function receiptRefusalError(
  reason: ReceiptRefusal,
  options: { camera?: boolean } = {},
): ReceiptErrorView {
  const refused = view(reason);
  if (reason === 'heic_unsupported' && options.camera === false) {
    return { ...refused, messageKey: 'transfers.errors.heic_unsupported_desktop' };
  }
  return refused;
}
