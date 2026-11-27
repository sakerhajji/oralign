import { InstallmentStatus, PaymentRecordStatus } from '@prisma/client';

/**
 * The five spec states of a bank transfer (DECISIONS §1), DERIVED: the
 * PaymentRecordStatus enum stays unchanged, so the in-flight guard, the
 * summaries and the takings rules are untouched. Pure functions shared by
 * the pack panel DTO (latestTransfer), the transfer queue and the history;
 * mirrored in oralign-frontend/src/lib/payments/transfer-state.ts.
 *
 *   awaiting_receipt  payable, no declaration in flight
 *   receipt_sent      awaiting_confirmation, no admin opened the receipt
 *   to_verify         awaiting_confirmation, reviewOpenedAt set
 *   paid              success
 *   refused           rejected (the reason is on the row)
 *
 * Every other status (none, cancelled = withdrawn / superseded, failed,
 * expired, a card attempt pending / unknown) reads as awaiting_receipt:
 * the doctor may (re)declare.
 */
export const TRANSFER_STATES = [
  'awaiting_receipt',
  'receipt_sent',
  'to_verify',
  'paid',
  'refused',
] as const;
export type TransferState = (typeof TRANSFER_STATES)[number];

/** The latest declaration as the derivation reads it. */
export interface TransferStateInput {
  /** Payment.status, or DentalOrder.treatmentFeePaymentStatus; null = none. */
  status: PaymentRecordStatus | null | undefined;
  /** Payment.reviewOpenedAt, or DentalOrder.treatmentFeeReviewOpenedAt. */
  reviewOpenedAt: Date | string | null | undefined;
}

/** The state of one declaration (or of none). */
export function transferStateOf(input: TransferStateInput): TransferState {
  switch (input.status) {
    case PaymentRecordStatus.success:
      return 'paid';
    case PaymentRecordStatus.rejected:
      return 'refused';
    case PaymentRecordStatus.awaiting_confirmation:
      return input.reviewOpenedAt ? 'to_verify' : 'receipt_sent';
    default:
      return 'awaiting_receipt';
  }
}

/**
 * A pack installment: paid whatever the method once the installment is
 * paid; null when nothing is owed any more (cancelled at 0 by a quote
 * edit); otherwise the state of its LATEST bank-transfer declaration
 * (by createdAt), or awaiting_receipt when it has none.
 */
export function installmentTransferState(
  installmentStatus: InstallmentStatus,
  latestTransfer: TransferStateInput | null,
): TransferState | null {
  if (installmentStatus === InstallmentStatus.paid) return 'paid';
  if (installmentStatus === InstallmentStatus.cancelled) return null;
  return transferStateOf(
    latestTransfer ?? { status: null, reviewOpenedAt: null },
  );
}

/**
 * A treatment fee (its DentalOrder columns): paid once treatmentFeePaidAt
 * is set, whatever the method. The caller decides first whether a fee is
 * owed at all (welcome gift, fee not configured, supplemental order).
 */
export function treatmentFeeTransferState(order: {
  treatmentFeePaidAt: Date | string | null | undefined;
  treatmentFeePaymentStatus: PaymentRecordStatus | null | undefined;
  treatmentFeeReviewOpenedAt: Date | string | null | undefined;
}): TransferState {
  if (order.treatmentFeePaidAt) return 'paid';
  return transferStateOf({
    status: order.treatmentFeePaymentStatus,
    reviewOpenedAt: order.treatmentFeeReviewOpenedAt,
  });
}

/**
 * Per installment on the payment plan (InstallmentLatestTransfer,
 * CONTRACT §2.1): its latest bank-transfer declaration, null when it has
 * none. `state` is the state of THAT declaration (a withdrawn one reads
 * awaiting_receipt); the installment's own state is
 * installmentTransferState(installment.status, latestTransfer). Never a
 * file path: `hasProof` only.
 */
export interface InstallmentLatestTransfer {
  paymentId: string;
  status: PaymentRecordStatus;
  state: TransferState;
  declaredAt: Date | null;
  reviewOpenedAt: Date | null;
  rejectionReason: string | null;
  hasProof: boolean;
}

/** The Payment columns latestTransferOf reads. */
export interface LatestTransferRow {
  id: string;
  status: PaymentRecordStatus;
  declaredAt: Date | null;
  reviewOpenedAt: Date | null;
  rejectionReason: string | null;
  proofUrl: string | null;
}

/** The InstallmentLatestTransfer of one declaration row (the path dropped). */
export function latestTransferOf(
  row: LatestTransferRow,
): InstallmentLatestTransfer {
  return {
    paymentId: row.id,
    status: row.status,
    state: transferStateOf(row),
    declaredAt: row.declaredAt,
    reviewOpenedAt: row.reviewOpenedAt,
    // The reason is the admin's, written for the doctor: only on a refusal.
    rejectionReason:
      row.status === PaymentRecordStatus.rejected ? row.rejectionReason : null,
    hasProof: Boolean(row.proofUrl),
  };
}
