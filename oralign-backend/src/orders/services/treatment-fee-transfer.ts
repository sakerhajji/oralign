import { PaymentMethod, PaymentRecordStatus, Prisma } from '@prisma/client';
import type { TreatmentFeeAuditMetadata } from '../../common/audit/order-audit-actions';
import { dec, toAmount } from '../../common/billing/tax-split';
import {
  toRate,
  treatmentFeeSettled,
} from '../../payments/services/payment-rules';

/**
 * The treatment-fee transfer columns (spec §1; the fee stays on
 * DentalOrder, no Payment row), as pure data builders shared by the
 * TreatmentFeeService transitions: what a new declaration resets, what a
 * withdrawal clears, and what the audit rows say. No I/O.
 */

type NumLike = Prisma.Decimal | number | string | null | undefined;

/**
 * The columns a NEW declaration starts from (receipt upload, or an admin's
 * declaration without one): its own instant (the subject's identity), no
 * review yet, no refusal. The declared amounts, method and receipt are
 * written beside it by the caller.
 */
export function newDeclarationData(
  declaredAt: Date,
  declarationKey: string | null,
): Prisma.DentalOrderUncheckedUpdateInput {
  return {
    treatmentFeeDeclaredAt: declaredAt,
    treatmentFeeReviewOpenedAt: null,
    treatmentFeeRejectedAt: null,
    treatmentFeeRejectedById: null,
    treatmentFeeRejectedByName: null,
    treatmentFeeRejectionReason: null,
    treatmentFeeDeclarationKey: declarationKey,
  };
}

/**
 * A withdrawn declaration leaves the fee payable again, as before any
 * declaration: no method, status, amounts, receipt pointer or review. The
 * receipt FILE is kept on disk (DECISIONS §1); the declaration key is kept
 * too, so a late repeat of the withdrawn upload answers the order as it
 * stands instead of declaring again.
 */
export const WITHDRAWN_FEE_DATA = {
  treatmentFeePaymentMethod: null,
  treatmentFeePaymentStatus: null,
  treatmentFeeProofPath: null,
  treatmentFeeAmount: null,
  treatmentFeeWithholdingRate: null,
  treatmentFeeWithholdingAmount: null,
  treatmentFeeStampAmount: null,
  treatmentFeeWithholdingThreshold: null,
  treatmentFeeDeclaredAt: null,
  treatmentFeeReviewOpenedAt: null,
  treatmentFeeRejectedAt: null,
  treatmentFeeRejectedById: null,
  treatmentFeeRejectedByName: null,
  treatmentFeeRejectionReason: null,
} satisfies Prisma.DentalOrderUncheckedUpdateInput;

/**
 * What a payment received in person (cash / cheque, recorded by an admin)
 * clears: the fee columns then describe THAT payment, not an earlier
 * transfer the admin refused (its instant, review, refusal and receipt
 * pointer). The refused receipt FILE is kept on disk and the refusal stays
 * in the order history (OrderAuditLog). A transfer still awaiting is never
 * overwritten this way: the cash path refuses it first (409).
 */
export const SETTLED_IN_PERSON_FEE_DATA = {
  treatmentFeeProofPath: null,
  treatmentFeeDeclaredAt: null,
  treatmentFeeReviewOpenedAt: null,
  treatmentFeeRejectedAt: null,
  treatmentFeeRejectedById: null,
  treatmentFeeRejectedByName: null,
  treatmentFeeRejectionReason: null,
} satisfies Prisma.DentalOrderUncheckedUpdateInput;

/** The declared fee columns an audit row describes. */
export interface DeclaredFee {
  treatmentFeePaymentMethod: PaymentMethod | null;
  treatmentFeeAmount: NumLike;
  treatmentFeeWithholdingRate?: NumLike;
  treatmentFeeWithholdingAmount?: NumLike;
  treatmentFeeStampAmount?: NumLike;
  treatmentFeeProofPath?: string | null;
}

/**
 * TreatmentFeeAuditMetadata of a declared fee, read from its order
 * columns: the fee due (cash + retenue - stamp, the existing meaning of
 * `amount`), the cash when it differs, the stamp and the retenue when
 * there are any, whether a receipt is attached (never its path), plus the
 * declaration instant and the reason / note of the transition.
 */
export function declaredFeeAuditMetadata(
  fee: DeclaredFee,
  extra: {
    declaredAt?: Date | null;
    reason?: string | null;
    overrideNote?: string | null;
  } = {},
): TreatmentFeeAuditMetadata {
  const due = treatmentFeeSettled(fee);
  const cash = dec(fee.treatmentFeeAmount);
  const stamp = dec(fee.treatmentFeeStampAmount);
  const withholding = dec(fee.treatmentFeeWithholdingAmount);
  const rate = toRate(fee.treatmentFeeWithholdingRate);
  return {
    method: fee.treatmentFeePaymentMethod ?? PaymentMethod.bank_transfer,
    amount: toAmount(due),
    ...(cash.equals(due) ? {} : { cashAmount: toAmount(cash) }),
    ...(stamp.gt(0) ? { stampAmount: toAmount(stamp) } : {}),
    ...(rate !== null && withholding.gt(0)
      ? { withholdingRate: rate, withholdingAmount: toAmount(withholding) }
      : {}),
    hasProof: Boolean(fee.treatmentFeeProofPath),
    ...(extra.declaredAt ? { declaredAt: extra.declaredAt.toISOString() } : {}),
    ...(extra.reason ? { reason: extra.reason } : {}),
    ...(extra.overrideNote ? { overrideNote: extra.overrideNote } : {}),
  };
}

/** The fee columns a transfer transition reads under the order lock. */
export const LOCKED_FEE_SELECT = {
  treatmentFeePaidAt: true,
  treatmentFeePaymentStatus: true,
  treatmentFeeDeclaredAt: true,
  treatmentFeeDeclarationKey: true,
  treatmentFeeProofPath: true,
  treatmentFeeReviewOpenedAt: true,
} satisfies Prisma.DentalOrderSelect;

export type LockedFee = Prisma.DentalOrderGetPayload<{
  select: typeof LOCKED_FEE_SELECT;
}>;

/** A declaration still awaiting the admin (not paid, awaiting_confirmation). */
export function isAwaitingFee(fee: {
  treatmentFeePaidAt: Date | null;
  treatmentFeePaymentStatus: PaymentRecordStatus | null;
}): boolean {
  return (
    !fee.treatmentFeePaidAt &&
    fee.treatmentFeePaymentStatus === PaymentRecordStatus.awaiting_confirmation
  );
}

/**
 * The refusal of the fee's CURRENT declaration, or nulls: a refusal is
 * only shown while the fee stands refused (not paid since, not declared
 * again). Every reader of the fee (the order DTO, the fee lists) shows it
 * through this one rule.
 */
export function currentFeeRefusal(fee: {
  treatmentFeePaidAt: Date | null;
  treatmentFeePaymentStatus: PaymentRecordStatus | null;
  treatmentFeeRejectedAt: Date | null;
  treatmentFeeRejectionReason: string | null;
}): { rejectedAt: Date | null; rejectionReason: string | null } {
  const refused =
    !fee.treatmentFeePaidAt &&
    fee.treatmentFeePaymentStatus === PaymentRecordStatus.rejected &&
    fee.treatmentFeeRejectedAt !== null;
  return refused
    ? {
        rejectedAt: fee.treatmentFeeRejectedAt,
        rejectionReason: fee.treatmentFeeRejectionReason ?? null,
      }
    : { rejectedAt: null, rejectionReason: null };
}
