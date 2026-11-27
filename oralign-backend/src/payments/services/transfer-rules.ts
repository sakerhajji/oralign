import {
  type PaymentMethod,
  PaymentRecordStatus,
  type Prisma,
  UserRole,
} from '@prisma/client';
import { isAdmin, type Caller } from '../../common/access/caller';
import type { PaymentTransferAuditMetadata } from '../../common/audit/order-audit-actions';
import { dec, toAmount } from '../../common/billing/tax-split';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../common/exceptions/app.exception';
import {
  TRANSFER_ERROR,
  validReason,
} from '../../common/exceptions/domain-error-codes';
import { paymentSettled, toRate } from './payment-rules';

/**
 * The rules of a bank-transfer declaration and its review (spec §1,
 * DECISIONS §1), for pack installments AND treatment fees. Pure functions,
 * no DI, no I/O: PaymentsService and TreatmentFeeService apply the very
 * same receipt, reason, idempotency and visibility rules, and the specs
 * pin them without a database.
 */

type NumLike = Prisma.Decimal | number | string | null | undefined;

// ─── Idempotency-Key ────────────────────────────────────────────────

/** 8-128 characters of [A-Za-z0-9_-] (a uuid fits). */
export const TRANSFER_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * The Idempotency-Key header of a declaration (POST declare-bank-transfer)
 * or of a treatment-fee receipt upload: null when absent or blank, the key
 * when well formed, otherwise 400 TRANSFER_IDEMPOTENCY_KEY_INVALID (a
 * repeated header arrives joined by ", " and is refused too).
 */
export function parseTransferIdempotencyKey(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw idempotencyKeyInvalid();
  const key = raw.trim();
  if (key === '') return null;
  if (!TRANSFER_IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw idempotencyKeyInvalid();
  }
  return key;
}

function idempotencyKeyInvalid(): BadRequestException {
  return new BadRequestException(
    "L'en-tête Idempotency-Key doit compter de 8 à 128 caractères parmi A-Z, a-z, 0-9, _ et -.",
    TRANSFER_ERROR.IDEMPOTENCY_KEY_INVALID,
  );
}

/** The key was already used by this caller for another installment / order. */
export function idempotencyKeyReused(): ConflictException {
  return new ConflictException(
    'Cette clé Idempotency-Key a déjà servi pour une autre déclaration.',
    TRANSFER_ERROR.IDEMPOTENCY_KEY_REUSED,
  );
}

// ─── Receipts ───────────────────────────────────────────────────────

/**
 * Who may declare without a receipt (DECISIONS §1 "Receipt"): never a
 * dentist (400 PROOF_REQUIRED); an admin declaring for the doctor only
 * with an override note, trimmed, 3-500 characters (400
 * PROOF_OVERRIDE_NOTE_REQUIRED). Returns the note when it is used (no
 * receipt), null when a receipt is attached.
 */
export function assertDeclarationReceipt(args: {
  caller: Caller;
  hasReceipt: boolean;
  overrideNote?: unknown;
}): string | null {
  if (args.hasReceipt) return null;
  if (!isAdmin(args.caller)) throw proofRequired();
  const note = validReason(args.overrideNote);
  if (!note) throw overrideNoteRequired();
  return note;
}

/**
 * Confirming a transfer that has no receipt needs the admin's override
 * note (trimmed, 3-500). Returns the note when it is used, null otherwise.
 */
export function assertConfirmReceipt(
  hasReceipt: boolean,
  overrideNote?: unknown,
): string | null {
  if (hasReceipt) return null;
  const note = validReason(overrideNote);
  if (!note) throw overrideNoteRequired();
  return note;
}

export function proofRequired(): BadRequestException {
  return new BadRequestException(
    'Joignez le reçu du virement (photo ou PDF) pour le déclarer.',
    TRANSFER_ERROR.PROOF_REQUIRED,
  );
}

function overrideNoteRequired(): BadRequestException {
  return new BadRequestException(
    "Sans reçu, indiquez une note (3 à 500 caractères) qui justifie l'exception.",
    TRANSFER_ERROR.PROOF_OVERRIDE_NOTE_REQUIRED,
  );
}

/**
 * Whether `caller` may read the receipts of an order of `doctorId`: an
 * admin, or the dentist who owns it. Designers and technicians never
 * (they see `hasProof` only).
 */
export function canReadReceipt(
  caller: Caller | null | undefined,
  doctorId: string,
): boolean {
  if (!caller) return false;
  if (isAdmin(caller)) return true;
  return caller.role === UserRole.dentist && caller.userId === doctorId;
}

/** 404 PROOF_NOT_FOUND: no receipt, or one the caller may not read. */
export function proofNotFound(): NotFoundException {
  return new NotFoundException(
    'Aucun reçu disponible.',
    TRANSFER_ERROR.PROOF_NOT_FOUND,
  );
}

// ─── Review transitions ─────────────────────────────────────────────

/** The refusal reason, trimmed, or 400 REJECTION_REASON_INVALID. */
export function rejectionReasonOrThrow(raw: unknown): string {
  const reason = validReason(raw);
  if (!reason) {
    throw new BadRequestException(
      'Indiquez le motif du refus (3 à 500 caractères).',
      TRANSFER_ERROR.REJECTION_REASON_INVALID,
    );
  }
  return reason;
}

/** A withdrawal note: trimmed, at most 500 characters, null when blank. */
export function withdrawalNoteOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const note = raw.trim().slice(0, 500);
  return note === '' ? null : note;
}

/**
 * 409 TRANSFER_ALREADY_PROCESSED: confirm / reject on a transfer that is no
 * longer awaiting confirmation (another admin processed it, or the doctor
 * withdrew or replaced it). The client refetches and says « déjà traité ».
 */
export function transferAlreadyProcessed(
  status: PaymentRecordStatus | null | undefined,
): ConflictException {
  return new ConflictException(
    'Ce virement a déjà été traité ou retiré : actualisez la liste.',
    TRANSFER_ERROR.TRANSFER_ALREADY_PROCESSED,
    { status: status ?? null },
  );
}

/** 409 TRANSFER_NOT_WITHDRAWABLE: withdraw when no longer awaiting. */
export function transferNotWithdrawable(
  status: PaymentRecordStatus | null | undefined,
): ConflictException {
  return new ConflictException(
    "Ce virement n'attend plus de vérification : il ne peut plus être retiré.",
    TRANSFER_ERROR.TRANSFER_NOT_WITHDRAWABLE,
    { status: status ?? null },
  );
}

/** True when two instants name the same declaration (to the millisecond). */
export function sameInstant(
  a: Date | string | null | undefined,
  b: Date | string | null | undefined,
): boolean {
  if (!a || !b) return false;
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  return Number.isFinite(left) && left === right;
}

/**
 * True when two declaration instants name the same declaration: equal to
 * the millisecond, or both absent (a legacy declaration without its
 * instant is told apart by nothing else).
 */
export function sameDeclarationInstant(
  a: Date | string | null | undefined,
  b: Date | string | null | undefined,
): boolean {
  if (!a && !b) return true;
  return sameInstant(a, b);
}

/**
 * The declaration a confirm / reject is about, when the admin's screen
 * named one (optional `declaredAt`): a fee receipt replaced since he
 * opened it is a 409, never confirmed unseen.
 */
export function assertSameDeclaration(
  current: Date | null | undefined,
  expected: string | null | undefined,
  status: PaymentRecordStatus | null | undefined,
): void {
  if (expected && !sameInstant(current, expected)) {
    throw transferAlreadyProcessed(status);
  }
}

// ─── Audit metadata ─────────────────────────────────────────────────

/** The Payment columns a transfer audit row describes. */
export interface TransferAuditPayment {
  paymentMethod: PaymentMethod;
  amount: NumLike;
  withholdingRate?: NumLike;
  withholdingAmount?: NumLike;
  stampAmount?: NumLike;
  proofUrl?: string | null;
}

/**
 * PaymentTransferAuditMetadata of a pack-transfer row: what the transfer
 * settles on the devis (the installment), the cash when it differs, the
 * stamp and the retenue when there are any, and whether a receipt is
 * attached (never its path). `extra` carries the reason, the override note
 * or the replaced declaration.
 */
export function paymentTransferAuditMetadata(
  payment: TransferAuditPayment,
  installmentNumber: number | null | undefined,
  extra: {
    reason?: string | null;
    overrideNote?: string | null;
    replacedPaymentId?: string | null;
  } = {},
): PaymentTransferAuditMetadata {
  const settled = paymentSettled(payment);
  const cash = dec(payment.amount);
  const stamp = dec(payment.stampAmount);
  const withholding = dec(payment.withholdingAmount);
  const rate = toRate(payment.withholdingRate);
  return {
    installmentNumber: installmentNumber ?? null,
    method: payment.paymentMethod,
    amount: toAmount(settled),
    ...(cash.equals(settled) ? {} : { cashAmount: toAmount(cash) }),
    ...(stamp.gt(0) ? { stampAmount: toAmount(stamp) } : {}),
    ...(rate !== null && withholding.gt(0)
      ? { withholdingRate: rate, withholdingAmount: toAmount(withholding) }
      : {}),
    hasProof: Boolean(payment.proofUrl),
    ...(extra.reason ? { reason: extra.reason } : {}),
    ...(extra.overrideNote ? { overrideNote: extra.overrideNote } : {}),
    ...(extra.replacedPaymentId
      ? { replacedPaymentId: extra.replacedPaymentId }
      : {}),
  };
}

// ─── What a caller reads of a Payment ───────────────────────────────

/**
 * Payment columns a dentist never reads (history, one payment, a
 * declaration's answer): the admin's notes, which admin recorded,
 * confirmed, rejected, opened or cancelled it, and both idempotency keys.
 * Admins keep every column.
 */
export const HIDDEN_FROM_DENTISTS = {
  notes: true,
  idempotencyKey: true,
  initiatedById: true,
  confirmedById: true,
  rejectedById: true,
  reviewOpenedById: true,
  reviewOpenedByName: true,
  cancelledById: true,
  cancelledByName: true,
  declarationKey: true,
} satisfies Prisma.PaymentOmit;

type HiddenKey = keyof typeof HIDDEN_FROM_DENTISTS;

/** A payment as a viewer reads it: `hasProof` added, maybe columns dropped. */
export type PaymentForViewer<T> = Omit<T, HiddenKey | 'proofUrl'> & {
  proofUrl?: string | null;
  hasProof: boolean;
};

/**
 * A payment as `caller` may read it, `hasProof` always added:
 *   - an admin: every column;
 *   - a dentist: the hidden columns dropped. Every route that hands a
 *     payment to a dentist has already scoped it to his own orders
 *     (getPayment, the lists, his declaration), so he is the owner and
 *     keeps the receipt path (to read through GET payments/:id/proof);
 *   - anyone else (a designer, a technician): hidden columns AND the
 *     receipt path dropped. They never reach a payment today (403
 *     upstream); this is the backstop of the contract.
 */
export function paymentForViewer<T extends object>(
  payment: T,
  caller: Caller,
): PaymentForViewer<T> {
  const visible = { ...payment } as Record<string, unknown>;
  visible.hasProof = Boolean(visible.proofUrl);
  if (isAdmin(caller)) return visible as PaymentForViewer<T>;
  for (const key of Object.keys(HIDDEN_FROM_DENTISTS)) delete visible[key];
  if (caller.role !== UserRole.dentist) delete visible.proofUrl;
  return visible as PaymentForViewer<T>;
}
