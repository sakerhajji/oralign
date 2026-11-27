import type { TransferKind } from './events/notification-events';

/**
 * Notification.subjectKey: the ONE builder and parser of the business
 * subject a notification row is about (spec §2, "Nouveau / Consulté" per
 * admin). Pure functions, no DI, so the emitters, the listener, the badge
 * count, the transfer queue and the migration backfill
 * (20261127000001_spec_model, block 4) agree on one format:
 *
 *   installment:<paymentId>
 *   treatment_fee:<orderId>:<treatmentFeeDeclaredAt epoch ms>
 *
 * A pack transfer is one Payment row, so its id is the subject. A
 * treatment fee has no Payment row: the order plus the declaration instant
 * names one declaration, and a re-upload (new declaredAt) is a new
 * subject. Keys travel in a URL path segment
 * (POST notifications/subject/:subjectKey/read): ':' is allowed there, and
 * ids never contain ':' or '/'.
 */

export const INSTALLMENT_SUBJECT_PREFIX = 'installment';
export const TREATMENT_FEE_SUBJECT_PREFIX = 'treatment_fee';

/** Upper bound of a key: two ids, one prefix, an epoch. */
export const SUBJECT_KEY_MAX_LENGTH = 160;

/** What a transfer subject key decodes to. */
export type TransferSubject =
  | { kind: Extract<TransferKind, 'installment'>; paymentId: string }
  | {
      kind: Extract<TransferKind, 'treatment_fee'>;
      orderId: string;
      /** DentalOrder.treatmentFeeDeclaredAt, epoch milliseconds. */
      declaredAtMs: number;
    };

/** A row id as stored (uuid in practice): no separator, no space. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const EPOCH_PATTERN = /^\d{1,15}$/;

function assertId(value: string, what: string): void {
  if (!ID_PATTERN.test(value)) {
    throw new TypeError(`Invalid ${what} for a notification subject key.`);
  }
}

function epochMsOf(declaredAt: Date | string | number): number {
  const ms =
    declaredAt instanceof Date
      ? declaredAt.getTime()
      : typeof declaredAt === 'number'
        ? declaredAt
        : new Date(declaredAt).getTime();
  if (!Number.isSafeInteger(ms) || ms < 0) {
    throw new TypeError('Invalid declaration instant for a subject key.');
  }
  return ms;
}

/** `installment:<paymentId>`: one pack-installment transfer declaration. */
export function installmentSubjectKey(paymentId: string): string {
  assertId(paymentId, 'payment id');
  return `${INSTALLMENT_SUBJECT_PREFIX}:${paymentId}`;
}

/**
 * `treatment_fee:<orderId>:<epoch ms>`: one treatment-fee declaration,
 * named by DentalOrder.treatmentFeeDeclaredAt (a Date, its ISO string, or
 * epoch milliseconds; all three give the same key).
 */
export function treatmentFeeSubjectKey(
  orderId: string,
  declaredAt: Date | string | number,
): string {
  assertId(orderId, 'order id');
  return `${TREATMENT_FEE_SUBJECT_PREFIX}:${orderId}:${epochMsOf(declaredAt)}`;
}

/** The key of a decoded subject (inverse of parseSubjectKey). */
export function transferSubjectKey(subject: TransferSubject): string {
  return subject.kind === 'installment'
    ? installmentSubjectKey(subject.paymentId)
    : treatmentFeeSubjectKey(subject.orderId, subject.declaredAtMs);
}

/**
 * Decode a key, or null when it is not a well-formed transfer subject (an
 * unknown prefix, a bad id, a non-integer epoch, extra segments). Route
 * handlers answer 400 on null.
 */
export function parseSubjectKey(key: unknown): TransferSubject | null {
  if (typeof key !== 'string' || key.length > SUBJECT_KEY_MAX_LENGTH) {
    return null;
  }
  const parts = key.split(':');
  if (parts[0] === INSTALLMENT_SUBJECT_PREFIX && parts.length === 2) {
    const [, paymentId] = parts;
    return ID_PATTERN.test(paymentId)
      ? { kind: 'installment', paymentId }
      : null;
  }
  if (parts[0] === TREATMENT_FEE_SUBJECT_PREFIX && parts.length === 3) {
    const [, orderId, epoch] = parts;
    if (!ID_PATTERN.test(orderId) || !EPOCH_PATTERN.test(epoch)) return null;
    const declaredAtMs = Number(epoch);
    return Number.isSafeInteger(declaredAtMs)
      ? { kind: 'treatment_fee', orderId, declaredAtMs }
      : null;
  }
  return null;
}

/** True for a well-formed transfer subject key. */
export function isTransferSubjectKey(key: unknown): key is string {
  return parseSubjectKey(key) !== null;
}
