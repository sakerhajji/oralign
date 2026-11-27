/**
 * The five spec states of a bank transfer (DECISIONS §1), DERIVED from the
 * stored status: frontend mirror of
 * oralign-backend/src/payments/services/transfer-state.ts. The server
 * sends `state` where it can (InstallmentLatestTransfer, the transfer
 * queue, the treatment-fee rows); these helpers derive it from the raw
 * columns everywhere else, with the same rules, so a screen never
 * disagrees with the API.
 *
 *   awaiting_receipt  payable, no declaration in flight
 *   receipt_sent      awaiting_confirmation, no admin opened the receipt
 *   to_verify         awaiting_confirmation, an admin opened it
 *   paid              success
 *   refused           rejected (the reason is on the row)
 *
 * Pure and dependency-free (type imports only), so `node --test` runs it
 * as is: see transfer-state.test.mjs.
 */
import type {
  InstallmentLatestTransfer,
  InstallmentStatus,
  PaymentRecordStatus,
  TransferState,
} from '@/lib/types';

/** Every state, in workflow order. */
export const TRANSFER_STATES: readonly TransferState[] = [
  'awaiting_receipt',
  'receipt_sent',
  'to_verify',
  'paid',
  'refused',
];

/** A status as it crosses the wire (the enum's string values). */
type StatusValue = PaymentRecordStatus | `${PaymentRecordStatus}`;

/** The latest declaration as the derivation reads it. */
export interface TransferStateInput {
  /** Payment.status, or DentalOrder.treatmentFeePaymentStatus; null = none. */
  status: StatusValue | null | undefined;
  /** Payment.reviewOpenedAt, or DentalOrder.treatmentFeeReviewOpenedAt. */
  reviewOpenedAt?: string | null;
}

/** The state of one declaration (or of none). */
export function transferStateOf(input: TransferStateInput): TransferState {
  switch (input.status) {
    case 'success':
      return 'paid';
    case 'rejected':
      return 'refused';
    case 'awaiting_confirmation':
      return input.reviewOpenedAt ? 'to_verify' : 'receipt_sent';
    default:
      // none, cancelled (withdrawn / superseded), failed, expired, a card
      // attempt pending / unknown: the doctor may (re)declare.
      return 'awaiting_receipt';
  }
}

/**
 * A pack installment: paid once the installment is paid, whatever the
 * method; null when nothing is owed any more (cancelled by a quote edit);
 * otherwise the state of its LATEST bank-transfer declaration, or
 * awaiting_receipt when it has none.
 */
export function installmentTransferState(
  installmentStatus: InstallmentStatus | `${InstallmentStatus}`,
  latestTransfer: TransferStateInput | null | undefined,
): TransferState | null {
  if (installmentStatus === 'paid') return 'paid';
  if (installmentStatus === 'cancelled') return null;
  return transferStateOf(latestTransfer ?? { status: null, reviewOpenedAt: null });
}

/** The fee columns of a DentalOrder the derivation reads. */
export interface TreatmentFeeTransferInput {
  treatmentFeePaidAt?: string | null;
  treatmentFeePaymentStatus?: StatusValue | null;
  treatmentFeeReviewOpenedAt?: string | null;
}

/**
 * A treatment fee: paid once treatmentFeePaidAt is set, whatever the
 * method. The caller decides first whether a fee is owed at all (welcome
 * gift, no fee configured, supplemental order).
 */
export function treatmentFeeTransferState(order: TreatmentFeeTransferInput): TransferState {
  if (order.treatmentFeePaidAt) return 'paid';
  return transferStateOf({
    status: order.treatmentFeePaymentStatus,
    reviewOpenedAt: order.treatmentFeeReviewOpenedAt,
  });
}

/**
 * A declaration waits on the lab: the doctor may still replace its
 * receipt or withdraw it, and must not declare the same payment twice.
 */
export function isTransferInFlight(state: TransferState | null | undefined): boolean {
  return state === 'receipt_sent' || state === 'to_verify';
}

/** The doctor may (re)declare: nothing in flight, nothing settled. */
export function isTransferPayable(state: TransferState | null | undefined): boolean {
  return state === 'awaiting_receipt' || state === 'refused';
}

/**
 * A pack installment's latest transfer and state, from the quote response.
 * `latestTransfer` is the server's (P-A); while an older API omits it, the
 * state falls back to the installment status alone (paid / cancelled /
 * awaiting_receipt), which is what the panel showed before.
 */
export function installmentTransferOf(inst: {
  status: InstallmentStatus | `${InstallmentStatus}`;
  latestTransfer?: InstallmentLatestTransfer | null;
}): { state: TransferState | null; transfer: InstallmentLatestTransfer | null } {
  const transfer = inst.latestTransfer ?? null;
  return {
    state: installmentTransferState(inst.status, transfer),
    // A paid or cancelled installment keeps no actionable declaration.
    transfer: inst.status === 'paid' || inst.status === 'cancelled' ? null : transfer,
  };
}

/** How a state is coloured on a badge: never by colour alone (each has its label). */
export type TransferTone = 'neutral' | 'waiting' | 'review' | 'success' | 'danger';

export const TRANSFER_STATE_TONE: Readonly<Record<TransferState, TransferTone>> = {
  awaiting_receipt: 'neutral',
  receipt_sent: 'waiting',
  to_verify: 'review',
  paid: 'success',
  refused: 'danger',
};

/**
 * Whose words a state is told in: the doctor reads « Reçu envoyé » →
 * « En cours de vérification »; the lab reads « Reçu envoyé » → « À
 * vérifier » → « Validé ». (« Nouveau / Consulté » is each admin's own
 * read state, from the notifications, never this global state.)
 */
export type TransferAudience = 'doctor' | 'admin';

/** The dictionary key of a state's label (transfers.state.<audience>.<state>). */
export function transferStateLabelKey(
  state: TransferState,
  audience: TransferAudience = 'doctor',
): string {
  return `transfers.state.${audience}.${state}`;
}

/**
 * A refusal reason ready to print, or null: trimmed, never blank. The
 * server already trims it (3-500 characters); older rows may carry spaces.
 */
export function refusalReasonOf(reason: string | null | undefined): string | null {
  if (typeof reason !== 'string') return null;
  const trimmed = reason.trim();
  return trimmed.length > 0 ? trimmed : null;
}
