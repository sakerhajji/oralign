import { PaymentMethod, PaymentRecordStatus, Prisma } from '@prisma/client';
import {
  dec,
  paymentCharge,
  round3,
  toAmount,
  type PaymentCharge,
} from '../../common/billing/tax-split';
import {
  BadRequestException,
  ConflictException,
} from '../../common/exceptions/app.exception';

/**
 * Money rules every payment entry point shares (installments and the
 * treatment fee, card, transfer, cash and cheque): the status groups, the
 * charge of a payment (stamp added, retenue à la source taken off), the
 * "one payment at a time" guard and the JSON a payment is returned as.
 * Pure functions plus guarded queries, no DI, so the orders module
 * (treatment fee) uses the very same rules.
 *
 * Semantics (owner decisions 2026-11-19 and 2026-11-20):
 *   due                       = the installment, or the fee + CBCT (TTC)
 *   Payment.stampAmount       = the droit de timbre added on top (each
 *                               payment has its own facture, so its own
 *                               stamp); 0 on payments made before
 *   Payment.withholdingAmount = what the practitioner kept back, computed
 *                               on the due (stamp excluded)
 *   Payment.amount            = the CASH charged or received
 *                             = due + stampAmount - withholdingAmount
 *   settled on the devis      = amount + withholdingAmount - stampAmount
 *                             = due
 * The same columns exist on the order for the treatment fee
 * (treatmentFeeAmount / ...WithholdingAmount / ...StampAmount).
 */

type NumLike = Prisma.Decimal | number | string | null | undefined;

/** Money in: the only status that counts as received. */
export const RECEIVED_PAYMENT_STATUSES: PaymentRecordStatus[] = [
  PaymentRecordStatus.success,
];

/** Still open: may yet turn into money, so nothing else may start. */
export const IN_FLIGHT_PAYMENT_STATUSES: PaymentRecordStatus[] = [
  PaymentRecordStatus.pending,
  PaymentRecordStatus.unknown,
  PaymentRecordStatus.awaiting_confirmation,
];

/** Over without money. */
export const DEAD_PAYMENT_STATUSES: PaymentRecordStatus[] = [
  PaymentRecordStatus.failed,
  PaymentRecordStatus.rejected,
  PaymentRecordStatus.cancelled,
  PaymentRecordStatus.expired,
];

/**
 * Collected in person: only an admin records them, and a dentist can never
 * mark anything paid that way.
 */
export const ADMIN_RECORDED_METHODS: readonly PaymentMethod[] = [
  PaymentMethod.cash,
  PaymentMethod.cheque,
];

export function isAdminRecordedMethod(method: PaymentMethod): boolean {
  return ADMIN_RECORDED_METHODS.includes(method);
}

// ─── The charge of a payment: stamp added, retenue taken off ─────────

/** The settings a payment's charge reads (the active billing settings). */
export interface ChargeSettings {
  /** Retenue à la source rate (%); 0 = the feature is off. */
  withholdingRate?: NumLike;
  /** Droit de timbre added on top of every payment. */
  stampDuty?: NumLike;
}

/**
 * What a payment of `due` (TTC) charges as the settings stand: their stamp
 * added on top, their retenue (on the due, stamp excluded) taken off when
 * the practitioner applies it. Never throws: a rate of 0 applies none.
 * This is what a new attempt would charge, so it is also what a live one
 * is compared with before it is handed back.
 */
export function expectedCharge(
  apply: boolean | null | undefined,
  due: NumLike,
  settings: ChargeSettings,
): PaymentCharge {
  return paymentCharge(
    due,
    settings.stampDuty,
    apply ? settings.withholdingRate : null,
  );
}

/**
 * The charge a new payment of `due` is created with. The practitioner only
 * says yes or no to the retenue: the rate and the stamp are the company
 * settings at payment time and the due is read server-side, never from
 * the client. A rate of 0 means the retenue is off, so asking for it then
 * is a 400 rather than a silent "not applied" he would not notice.
 *
 *   1 000 due, stamp 1, retenue 1 %  ->  total 1 001, retenue 10, cash 991
 *   1 000 due, stamp 1, no retenue   ->  total 1 001, cash 1 001
 */
export function resolvePaymentCharge(
  apply: boolean | null | undefined,
  due: NumLike,
  settings: ChargeSettings,
): PaymentCharge {
  // gt(0), not isPositive(): Decimal.js counts 0 as positive.
  if (apply && !dec(settings.withholdingRate).gt(0)) {
    throw new BadRequestException(
      "La retenue à la source n'est pas activée : le montant dû doit être payé en entier.",
      'WITHHOLDING_DISABLED',
    );
  }
  return expectedCharge(apply, due, settings);
}

/** The active billing settings' retenue rate and stamp (0 when none). */
export async function readChargeSettings(
  db: Pick<Prisma.TransactionClient, 'companyBillingSettings'>,
): Promise<{ withholdingRate: Prisma.Decimal; stampDuty: Prisma.Decimal }> {
  const settings = await db.companyBillingSettings.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: { withholdingRate: true, stampDuty: true },
  });
  return {
    withholdingRate: dec(settings?.withholdingRate),
    stampDuty: dec(settings?.stampDuty),
  };
}

/** The Payment columns a charge is stored in. */
export function paymentChargeData(charge: PaymentCharge) {
  return {
    amount: charge.cash,
    withholdingRate: charge.withholdingRate,
    withholdingAmount: charge.withholding,
    stampAmount: charge.stamp,
  };
}

/**
 * True when `payment` charges exactly `charge`: the same cash, retenue and
 * stamp, to the millime. A live card attempt opened before the stamp or
 * the retenue rate changed fails it, and must not be handed back as if it
 * charged what the practitioner is shown now.
 */
export function chargesTheSame(
  payment: {
    amount: NumLike;
    withholdingAmount?: NumLike;
    stampAmount?: NumLike;
  },
  charge: PaymentCharge,
): boolean {
  return (
    round3(payment.amount).equals(charge.cash) &&
    round3(payment.withholdingAmount).equals(charge.withholding) &&
    round3(payment.stampAmount).equals(charge.stamp)
  );
}

/**
 * The treatment fee due (TTC): the configured fee plus the order's CBCT
 * supplement snapshot. Decimal end to end so card, cash, cheque and
 * transfer all bill the same millime. The stamp is added on top by the
 * payment's charge.
 */
export function treatmentFeeDue(
  defaultTreatmentFee: NumLike,
  cbctFeeAmount: NumLike,
): Prisma.Decimal {
  return round3(dec(defaultTreatmentFee).plus(dec(cbctFeeAmount)));
}

/**
 * The total of a payment's facture: the cash plus what the practitioner
 * kept back (stamp included). Not what it settles: see paymentSettled.
 */
export function paymentGross(payment: {
  amount: NumLike;
  withholdingAmount?: NumLike;
}): Prisma.Decimal {
  return round3(dec(payment.amount).plus(dec(payment.withholdingAmount)));
}

/**
 * What a payment settles on the devis (or of the fee): cash + retenue -
 * stamp, i.e. the installment amount. A payment made before the stamp was
 * added has stampAmount 0, and the formula still holds.
 */
export function paymentSettled(payment: {
  amount: NumLike;
  withholdingAmount?: NumLike;
  stampAmount?: NumLike;
}): Prisma.Decimal {
  return round3(
    dec(payment.amount)
      .plus(dec(payment.withholdingAmount))
      .minus(dec(payment.stampAmount)),
  );
}

/**
 * The treatment fee an order's payment settled (or declared): the cash +
 * the retenue - the stamp. Fees paid before the stamp was added have no
 * stamp (null / 0).
 */
export function treatmentFeeSettled(order: {
  treatmentFeeAmount: NumLike;
  treatmentFeeWithholdingAmount?: NumLike;
  treatmentFeeStampAmount?: NumLike;
}): Prisma.Decimal {
  return paymentSettled({
    amount: order.treatmentFeeAmount,
    withholdingAmount: order.treatmentFeeWithholdingAmount,
    stampAmount: order.treatmentFeeStampAmount,
  });
}

/** Whether the practitioner applied the retenue on this payment. */
export function appliesWithholding(payment: {
  withholdingRate?: NumLike;
  withholdingAmount?: NumLike;
}): boolean {
  return (
    (payment.withholdingRate !== null &&
      payment.withholdingRate !== undefined) ||
    dec(payment.withholdingAmount).gt(0)
  );
}

/** A rate (%) as a JSON number with at most 2 decimals; null stays null. */
export function toRate(value: NumLike): number | null {
  if (value === null || value === undefined) return null;
  return Number(dec(value).toDecimalPlaces(2).toFixed(2));
}

export type PaymentJson<T> = Omit<
  T,
  'withholdingRate' | 'withholdingAmount' | 'stampAmount'
> & {
  withholdingRate: number | null;
  withholdingAmount: number;
  /** The droit de timbre charged on top with this payment (0 before 2026-11-20). */
  stampAmount: number;
  /** amount + withholdingAmount: the total of its facture, stamp included. */
  grossAmount: number;
  /** amount + withholdingAmount - stampAmount: what it settles (the installment). */
  settledAmount: number;
};

/**
 * A payment as the API returns it. `amount` keeps its historic shape (the
 * Decimal string, the cash); the retenue and stamp fields are numbers, and
 * grossAmount / settledAmount spare every screen the arithmetic.
 */
export function toPaymentJson<
  T extends {
    amount: NumLike;
    withholdingRate?: NumLike;
    withholdingAmount?: NumLike;
    stampAmount?: NumLike;
  },
>(payment: T): PaymentJson<T> {
  return {
    ...payment,
    withholdingRate: toRate(payment.withholdingRate),
    withholdingAmount: toAmount(payment.withholdingAmount),
    stampAmount: toAmount(payment.stampAmount),
    grossAmount: toAmount(paymentGross(payment)),
    settledAmount: toAmount(paymentSettled(payment)),
  };
}

// ─── One payment at a time ──────────────────────────────────────────

/** The two kinds of payment that stay open while money is on its way. */
const OPEN_KINDS: readonly PaymentMethod[] = [
  PaymentMethod.card,
  PaymentMethod.bank_transfer,
];

/** Shared wording for "another payment is already open". */
export const PAYMENT_ATTEMPT_IN_PROGRESS = 'PAYMENT_ATTEMPT_IN_PROGRESS';

/**
 * A live card attempt was opened with the other retenue choice. Its own
 * code, apart from PAYMENT_ATTEMPT_IN_PROGRESS: the client explains this
 * one (finish that card payment or let it expire), while a card or a
 * transfer of another kind in flight is told by the server message.
 */
export const WITHHOLDING_CHOICE_CONFLICT = 'WITHHOLDING_CHOICE_CONFLICT';

/**
 * A live card attempt, with the same retenue choice, charges another
 * amount than a new attempt would now: it was opened before the stamp,
 * the retenue rate or the amount due changed. Handing it back would
 * charge a figure the practitioner is no longer shown. Its own code, like
 * WITHHOLDING_CHOICE_CONFLICT: finish that card payment or let it expire.
 */
export const PAYMENT_CHARGE_CHANGED = 'PAYMENT_CHARGE_CHANGED';

export const CARD_IN_FLIGHT_MESSAGE =
  "Un paiement par carte est déjà en cours pour ce montant. Terminez-le, ou attendez son expiration (une quinzaine de minutes), avant d'utiliser un autre mode de paiement.";

export const TRANSFER_IN_FLIGHT_MESSAGE =
  "Un virement a déjà été déclaré pour ce montant et attend la confirmation de l'équipe Oralign. Attendez sa validation ou son rejet avant d'utiliser un autre mode de paiement.";

/**
 * Refuse a new installment payment while that installment already has an
 * open payment of ANOTHER kind: a card attempt not yet decided, or a
 * transfer awaiting the admin. Two kinds in flight is how an installment
 * gets paid twice (the second one would be cancelled after the money was
 * taken). Same-kind rows are the caller's business: a card attempt is
 * resumed by the ClicToPay logic, a transfer re-declaration replaces the
 * previous one. Cash and cheque rows are settled in the transaction that
 * creates them, so they are never in flight and never block.
 *
 * Must run under the installment's FOR UPDATE lock: that lock is what
 * makes the check and the insert one step.
 */
export async function assertNoOtherPaymentInFlight(
  tx: Pick<Prisma.TransactionClient, 'payment'>,
  installmentId: string,
  method: PaymentMethod,
): Promise<void> {
  const others = OPEN_KINDS.filter((kind) => kind !== method);
  const open = await tx.payment.findFirst({
    where: {
      installmentId,
      status: { in: IN_FLIGHT_PAYMENT_STATUSES },
      paymentMethod: { in: others },
    },
    select: { paymentMethod: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!open) return;
  throw new ConflictException(
    open.paymentMethod === PaymentMethod.card
      ? CARD_IN_FLIGHT_MESSAGE
      : TRANSFER_IN_FLIGHT_MESSAGE,
    PAYMENT_ATTEMPT_IN_PROGRESS,
  );
}
