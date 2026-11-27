import type { BatchUnlockSource, PaymentMethod } from '@prisma/client';

/**
 * OrderAuditLog.action keys of the transfer, treatment-fee and step-batch
 * transitions (frozen in P0, CONTRACT.md §5). The frontend owns the labels
 * (orderDetail.history.actions.* in dict.ts, order-history.tsx). Every
 * transition writes ONE row through common/audit/order-audit-entry.ts,
 * inside the transaction of the transition, with OrderAuditLog.paymentId
 * set when a Payment row is concerned.
 *
 * Metadata NEVER holds a file path or URL: assigned designers read the
 * order history (order-access.policy.ts). orderAuditEntry() strips any key
 * ending in "path" or "url" as a backstop; a receipt is described by
 * `hasProof` only.
 *
 * The derived history entries OrderAuditService.list() builds from Payment
 * rows (payment_started / payment_succeeded / payment_rejected /
 * payment_cancelled) and from batches (batch_unlocked / batch_delivered)
 * are deduplicated against these persisted rows by list().
 */
export const ORDER_AUDIT_ACTION = {
  // ── Pack-installment transfers (paymentId = the Payment) ──────────
  /** A transfer was declared (doctor, or an admin for him). */
  PAYMENT_TRANSFER_DECLARED: 'payment_transfer_declared',
  /** A new declaration replaced one still awaiting confirmation (the old Payment is cancelled; paymentId = the NEW one, metadata.replacedPaymentId the old). */
  PAYMENT_PROOF_REPLACED: 'payment_proof_replaced',
  /** The declaration was withdrawn while awaiting confirmation (status cancelled, file kept). */
  PAYMENT_TRANSFER_WITHDRAWN: 'payment_transfer_withdrawn',
  /** The FIRST admin opened the receipt (reviewOpenedAt stamped). Later openings write nothing. */
  PAYMENT_REVIEW_OPENED: 'payment_review_opened',
  /** An admin confirmed the transfer (status success). */
  PAYMENT_CONFIRMED: 'payment_confirmed',
  /** An admin refused the transfer with a reason (status rejected). */
  PAYMENT_REJECTED: 'payment_rejected',

  // ── Step batches (production/batch-unlock.ts) ─────────────────────
  /** A batch went locked → unlocked; paymentId = the settled payment for source payment. */
  BATCH_UNLOCKED: 'batch_unlocked',

  // ── Treatment fee (no Payment row; paymentId = the card attempt for a card fee, else null) ──
  /** Existing: the fee was declared as a bank transfer without a receipt (admin path). */
  TREATMENT_FEE_DECLARED: 'treatment_fee_declared',
  /** Existing: a receipt was uploaded and the fee awaits confirmation. */
  TREATMENT_FEE_PROOF_UPLOADED: 'treatment_fee_proof_uploaded',
  /** A new receipt replaced one still awaiting confirmation. */
  TREATMENT_FEE_PROOF_REPLACED: 'treatment_fee_proof_replaced',
  /** The doctor removed the receipt while awaiting confirmation (DELETE orders/:id/treatment-fee/proof). */
  TREATMENT_FEE_PROOF_REMOVED: 'treatment_fee_proof_removed',
  /** The FIRST admin opened the fee receipt (treatmentFeeReviewOpenedAt stamped). */
  TREATMENT_FEE_REVIEW_OPENED: 'treatment_fee_review_opened',
  /** Existing: an admin confirmed the fee transfer. */
  TREATMENT_FEE_CONFIRMED: 'treatment_fee_confirmed',
  /** An admin refused the fee transfer with a reason. */
  TREATMENT_FEE_REJECTED: 'treatment_fee_rejected',
  /** Existing: the fee was paid in person (cash / cheque). */
  TREATMENT_FEE_PAID: 'treatment_fee_paid',
} as const;

export type OrderAuditAction =
  (typeof ORDER_AUDIT_ACTION)[keyof typeof ORDER_AUDIT_ACTION];

/**
 * Metadata of the pack-transfer rows (payment_transfer_declared,
 * payment_proof_replaced, payment_transfer_withdrawn, payment_review_opened,
 * payment_confirmed, payment_rejected). Amounts are JSON numbers, 3 dp.
 */
export interface PaymentTransferAuditMetadata {
  installmentNumber: number | null;
  method: PaymentMethod;
  /** What the transfer settles on the devis (the installment amount). */
  amount: number;
  /** The cash, when it differs from `amount` (stamp added, retenue kept). */
  cashAmount?: number;
  stampAmount?: number;
  withholdingRate?: number;
  withholdingAmount?: number;
  /** Whether a receipt is attached (never its path). */
  hasProof: boolean;
  /** payment_rejected: the refusal reason; payment_transfer_withdrawn: optional note. */
  reason?: string;
  /** payment_confirmed without a receipt / admin declaration without one: the override note. */
  overrideNote?: string;
  /** payment_proof_replaced: the cancelled declaration. */
  replacedPaymentId?: string;
}

/**
 * Metadata of the treatment-fee rows. `amount` keeps its existing meaning
 * (the fee due, feeAuditMetadata in treatment-fee.service.ts).
 */
export interface TreatmentFeeAuditMetadata {
  method: PaymentMethod;
  amount: number;
  cashAmount?: number;
  stampAmount?: number;
  withholdingRate?: number;
  withholdingAmount?: number;
  hasProof?: boolean;
  /** The declaration's identity (treatmentFeeDeclaredAt, ISO 8601). */
  declaredAt?: string;
  /** treatment_fee_rejected: the refusal reason. */
  reason?: string;
  overrideNote?: string;
}

/** Metadata of a batch_unlocked row (production/batch-unlock.ts writes it). */
export interface BatchUnlockedAuditMetadata {
  batchId: string;
  batchNumber: number;
  fromStep: number;
  toStep: number;
  source: BatchUnlockSource;
  installmentNumber: number | null;
  /** source manual only: the admin's reason. */
  reason?: string;
}
