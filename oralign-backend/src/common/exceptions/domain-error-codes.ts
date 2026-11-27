/**
 * Stable `errorCode` values of the programme "paiements / production /
 * retenue / inactivité / profil" (frozen in P0, CONTRACT.md §3). The HTTP
 * status is in each comment; the message is human French text and may
 * change, the code never does. The frontend mirrors these one to one
 * (oralign-frontend/src/lib/types/billing.ts and entities.ts) and maps
 * them to copy; it never parses messages.
 *
 * Codes that already existed keep their home and their value:
 * INSTALLMENT_ALREADY_PAID (409, payments.service.ts),
 * PAYMENT_ATTEMPT_IN_PROGRESS / WITHHOLDING_CHOICE_CONFLICT /
 * PAYMENT_CHARGE_CHANGED (409, payment-rules.ts), STEPS_NOT_RELEASED (409,
 * production.contract.ts). WITHHOLDING_DISABLED (400) is re-exported here
 * with its existing value.
 */

/** Bank-transfer declarations, receipts and their review (spec §1-§2). */
export const TRANSFER_ERROR = {
  /** 400. A dentist declared a transfer (pack or fee) without a receipt, or called POST orders/:id/treatment-fee/pay with bank_transfer. */
  PROOF_REQUIRED: 'PROOF_REQUIRED',
  /** 400. An admin declared for a doctor without a receipt, or confirmed a transfer that has none, without the override note. */
  PROOF_OVERRIDE_NOTE_REQUIRED: 'PROOF_OVERRIDE_NOTE_REQUIRED',
  /** 400. The receipt is not JPEG, PNG, WebP or PDF (magic bytes, declared type, extension), or failed scanUploadContent. HEIC is refused here. */
  RECEIPT_TYPE: 'RECEIPT_TYPE',
  /** 400. The receipt is over 10 MB (raw upload, both flows). */
  RECEIPT_TOO_LARGE: 'RECEIPT_TOO_LARGE',
  /** 400. The refusal reason is not 3-500 characters once trimmed. */
  REJECTION_REASON_INVALID: 'REJECTION_REASON_INVALID',
  /** 409. The transfer is no longer awaiting confirmation and the call is not an idempotent repeat (another admin processed it, or the doctor withdrew / replaced it); also a treatment-fee receipt sent once the fee is paid (an admin confirmed the transfer being replaced). The client refetches and shows « déjà traité ». The installment counterpart of the latter is INSTALLMENT_ALREADY_PAID. */
  TRANSFER_ALREADY_PROCESSED: 'TRANSFER_ALREADY_PROCESSED',
  /** 409. The doctor tried to replace or withdraw a transfer that is no longer awaiting confirmation. */
  TRANSFER_NOT_WITHDRAWABLE: 'TRANSFER_NOT_WITHDRAWABLE',
  /** 400. The Idempotency-Key header is present but not 8-128 characters of [A-Za-z0-9_-]. */
  IDEMPOTENCY_KEY_INVALID: 'TRANSFER_IDEMPOTENCY_KEY_INVALID',
  /** 409. The Idempotency-Key was already used by this caller for another installment / order. */
  IDEMPOTENCY_KEY_REUSED: 'TRANSFER_IDEMPOTENCY_KEY_REUSED',
  /** 404. No receipt on this transfer, or the caller may not read it (designers and technicians always get 404). */
  PROOF_NOT_FOUND: 'PROOF_NOT_FOUND',
  /** 400. POST notifications/subject/:subjectKey/read with a key notification-subject.ts cannot parse. */
  SUBJECT_KEY_INVALID: 'NOTIFICATION_SUBJECT_INVALID',
} as const;
export type TransferErrorCode =
  (typeof TRANSFER_ERROR)[keyof typeof TRANSFER_ERROR];

/** Retenue à la source (spec §4). */
export const WITHHOLDING_ERROR = {
  /** 400. The retenue was asked for while CompanyBillingSettings.withholdingEnabled is off (or the rate is 0). Existing value. */
  WITHHOLDING_DISABLED: 'WITHHOLDING_DISABLED',
  /** 400. The retenue was asked for on a payment whose base (TTC, stamp excluded) is below withholdingThreshold. */
  WITHHOLDING_BELOW_THRESHOLD: 'WITHHOLDING_BELOW_THRESHOLD',
} as const;
export type WithholdingErrorCode =
  (typeof WITHHOLDING_ERROR)[keyof typeof WITHHOLDING_ERROR];

/** Step-batch release (spec §3, production/batch-unlock.ts). */
export const BATCH_UNLOCK_ERROR = {
  /** 400. A manual unlock without a reason (3-500 characters once trimmed). */
  UNLOCK_REASON_REQUIRED: 'UNLOCK_REASON_REQUIRED',
  /** 404. The batch is not on this quotation (or the quotation is archived). */
  BATCH_NOT_FOUND: 'BATCH_NOT_FOUND',
} as const;
export type BatchUnlockErrorCode =
  (typeof BATCH_UNLOCK_ERROR)[keyof typeof BATCH_UNLOCK_ERROR];

/** Doctor inactivity (spec §5, users/activity). */
export const ACCOUNT_ACTIVITY_ERROR = {
  /** 403. Order create / submit (initial and supplemental, admins acting for the doctor included) on a dormant account (User.inactiveSince set). */
  ACCOUNT_DORMANT: 'ACCOUNT_DORMANT',
  /** 400. POST users/:id/reactivate without a reason (3-500 characters once trimmed). */
  REACTIVATION_REASON_REQUIRED: 'REACTIVATION_REASON_REQUIRED',
  /** 400. POST users/:id/reactivate on an account that is not a dentist. */
  NOT_A_DOCTOR: 'ACCOUNT_ACTIVITY_NOT_A_DOCTOR',
} as const;
export type AccountActivityErrorCode =
  (typeof ACCOUNT_ACTIVITY_ERROR)[keyof typeof ACCOUNT_ACTIVITY_ERROR];

/** Trimmed length bounds shared by every free-text reason of the programme. */
export const REASON_MIN_LENGTH = 3;
export const REASON_MAX_LENGTH = 500;

/** The trimmed reason when it is 3-500 characters long, otherwise null. */
export function validReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= REASON_MIN_LENGTH &&
    trimmed.length <= REASON_MAX_LENGTH
    ? trimmed
    : null;
}
