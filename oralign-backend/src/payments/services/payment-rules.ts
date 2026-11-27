import { PaymentMethod, PaymentRecordStatus, Prisma } from '@prisma/client';
import {
  dec,
  paymentCharge,
  round3,
  toAmount,
  withholdingIneligibility,
  type PaymentCharge,
  type WithholdingIneligibility,
  type WithholdingRule,
} from '../../common/billing/tax-split';
import {
  BadRequestException,
  ConflictException,
} from '../../common/exceptions/app.exception';
import { WITHHOLDING_ERROR } from '../../common/exceptions/domain-error-codes';

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
  /** Retenue à la source rate (%); 0 = the retenue cannot apply. */
  withholdingRate?: NumLike;
  /** Droit de timbre added on top of every payment. */
  stampDuty?: NumLike;
  /**
   * Master switch of the retenue (CompanyBillingSettings.withholdingEnabled,
   * spec §4). Anything but true is off: the retenue is never applied and
   * asking for it is a 400 WITHHOLDING_DISABLED.
   */
  withholdingEnabled?: boolean | null;
  /**
   * Base (TTC, stamp excluded) from which the retenue may apply: a payment
   * below it is a 400 WITHHOLDING_BELOW_THRESHOLD. null / undefined = no
   * threshold. Also snapshotted on the charge (PaymentCharge
   * .withholdingThreshold).
   */
  withholdingThreshold?: NumLike;
}

/** The retenue rule the charge settings describe. */
export function withholdingRuleOf(settings: ChargeSettings): WithholdingRule {
  return {
    enabled: settings.withholdingEnabled,
    rate: settings.withholdingRate,
    threshold: settings.withholdingThreshold,
  };
}

/**
 * Why the retenue cannot apply to a payment of `due` under `settings`
 * (null when it can): switched off / rate 0, or `due` (the installment, or
 * the fee + CBCT: TTC, stamp excluded) below the threshold.
 */
export function chargeWithholdingIneligibility(
  due: NumLike,
  settings: ChargeSettings,
): WithholdingIneligibility | null {
  return withholdingIneligibility(due, withholdingRuleOf(settings));
}

const thresholdFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

/**
 * Refuse the retenue on a payment it cannot apply to: 400
 * WITHHOLDING_DISABLED (switched off or rate 0), 400
 * WITHHOLDING_BELOW_THRESHOLD (with `withholdingThreshold`, a 3-decimal
 * number, in the error body). Called only when the practitioner asked for
 * it: a payment without the retenue is always allowed.
 */
export function assertWithholdingAllowed(
  due: NumLike,
  settings: ChargeSettings,
): void {
  const why = chargeWithholdingIneligibility(due, settings);
  if (why === 'disabled') {
    throw new BadRequestException(
      "La retenue à la source n'est pas activée : le montant dû doit être payé en entier.",
      WITHHOLDING_ERROR.WITHHOLDING_DISABLED,
    );
  }
  if (why === 'below_threshold') {
    const threshold = round3(settings.withholdingThreshold);
    throw new BadRequestException(
      `La retenue à la source ne s'applique qu'aux paiements d'au moins ${thresholdFormat.format(
        threshold.toNumber(),
      )} TND (TTC, hors droit de timbre) : ce montant doit être payé en entier.`,
      WITHHOLDING_ERROR.WITHHOLDING_BELOW_THRESHOLD,
      { withholdingThreshold: toAmount(threshold) },
    );
  }
}

/**
 * What a payment of `due` (TTC) charges as the settings stand: their stamp
 * added on top, their retenue (on the due, stamp excluded) taken off when
 * the practitioner applies it AND the rule lets it apply (switched on,
 * rate above 0, `due` at or above the threshold). Never throws: an
 * ineligible retenue is simply not applied. This is what a new attempt
 * would charge, so it is also what a live one is compared with before it
 * is handed back (a live attempt with a retenue that no longer applies
 * fails that comparison). The settings' threshold rides along as the
 * charge's snapshot.
 */
export function expectedCharge(
  apply: boolean | null | undefined,
  due: NumLike,
  settings: ChargeSettings,
): PaymentCharge {
  const applied =
    apply === true && chargeWithholdingIneligibility(due, settings) === null;
  return paymentCharge(
    due,
    settings.stampDuty,
    applied ? settings.withholdingRate : null,
    settings.withholdingThreshold,
  );
}

/**
 * The charge a new payment of `due` is created with: the ONE rule of the
 * five payment entry points (card and transfer of an installment, cash /
 * cheque of an installment, card of the treatment fee, the treatment
 * fee's cash / cheque / transfer). The practitioner only says yes or no to
 * the retenue: the rate, the switch, the threshold and the stamp are the
 * company settings at payment time and the due is read server-side, never
 * from the client. Asking for a retenue that cannot apply is a 400
 * (assertWithholdingAllowed) rather than a silent "not applied" he would
 * not notice.
 *
 *   1 000 due, stamp 1, retenue 1 %  ->  total 1 001, retenue 10, cash 991
 *   1 000 due, stamp 1, no retenue   ->  total 1 001, cash 1 001
 *     999 due, threshold 1 000, retenue asked -> 400 BELOW_THRESHOLD
 */
export function resolvePaymentCharge(
  apply: boolean | null | undefined,
  due: NumLike,
  settings: ChargeSettings,
): PaymentCharge {
  if (apply === true) assertWithholdingAllowed(due, settings);
  return expectedCharge(apply, due, settings);
}

/** The charge settings as read: Decimals, 0 / false / null when unset. */
export interface ResolvedChargeSettings {
  withholdingRate: Prisma.Decimal;
  stampDuty: Prisma.Decimal;
  withholdingEnabled: boolean;
  /** null when there is no active settings row (nothing to snapshot). */
  withholdingThreshold: Prisma.Decimal | null;
}

/** The settings columns every payment's charge reads, in ONE place. */
export const CHARGE_SETTINGS_SELECT = {
  withholdingRate: true,
  stampDuty: true,
  withholdingEnabled: true,
  withholdingThreshold: true,
} satisfies Prisma.CompanyBillingSettingsSelect;

type ChargeSettingsRow = {
  withholdingRate?: NumLike;
  stampDuty?: NumLike;
  withholdingEnabled?: boolean | null;
  withholdingThreshold?: NumLike;
} | null;

function resolveChargeSettings(row: ChargeSettingsRow): ResolvedChargeSettings {
  return {
    withholdingRate: dec(row?.withholdingRate),
    stampDuty: dec(row?.stampDuty),
    withholdingEnabled: row?.withholdingEnabled === true,
    withholdingThreshold:
      row?.withholdingThreshold === null ||
      row?.withholdingThreshold === undefined
        ? null
        : round3(row.withholdingThreshold),
  };
}

/**
 * The active billing settings' retenue (rate, switch, threshold) and stamp:
 * the ONE read of the charge settings (0 / off / null when none).
 */
export async function readChargeSettings(
  db: Pick<Prisma.TransactionClient, 'companyBillingSettings'>,
): Promise<ResolvedChargeSettings> {
  const settings = await db.companyBillingSettings.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: CHARGE_SETTINGS_SELECT,
  });
  return resolveChargeSettings(settings);
}

/**
 * The treatment fee's settings: the charge settings plus the configured
 * fee, in the same single read (the treatment-fee service and the card
 * checkout price the fee the same way).
 */
export async function readTreatmentFeeSettings(
  db: Pick<Prisma.TransactionClient, 'companyBillingSettings'>,
): Promise<
  ResolvedChargeSettings & {
    defaultTreatmentFee: Prisma.Decimal;
    defaultCurrency: string | null;
  }
> {
  const settings = await db.companyBillingSettings.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: {
      ...CHARGE_SETTINGS_SELECT,
      defaultTreatmentFee: true,
      defaultCurrency: true,
    },
  });
  return {
    ...resolveChargeSettings(settings),
    defaultTreatmentFee: dec(settings?.defaultTreatmentFee),
    defaultCurrency: settings?.defaultCurrency ?? null,
  };
}

/** The Payment columns a charge is stored in. */
export function paymentChargeData(charge: PaymentCharge) {
  return {
    amount: charge.cash,
    withholdingRate: charge.withholdingRate,
    withholdingAmount: charge.withholding,
    stampAmount: charge.stamp,
    withholdingThreshold: charge.withholdingThreshold,
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

/**
 * A retenue threshold snapshot (Decimal(12,3)) as a JSON number with 3
 * decimals; null stays null (a payment taken before the threshold
 * existed, 2026-11-27). The one conversion for every payment response.
 */
export function toThreshold(value: NumLike): number | null {
  if (value === null || value === undefined) return null;
  return toAmount(value);
}

/** `withholdingThreshold` as a number, only on rows that selected it. */
type ThresholdJson<T> = 'withholdingThreshold' extends keyof T
  ? { withholdingThreshold: number | null }
  : unknown;

export type PaymentJson<T> = Omit<
  T,
  | 'withholdingRate'
  | 'withholdingAmount'
  | 'stampAmount'
  | 'withholdingThreshold'
> & {
  withholdingRate: number | null;
  withholdingAmount: number;
  /** The droit de timbre charged on top with this payment (0 before 2026-11-20). */
  stampAmount: number;
  /** amount + withholdingAmount: the total of its facture, stamp included. */
  grossAmount: number;
  /** amount + withholdingAmount - stampAmount: what it settles (the installment). */
  settledAmount: number;
} & ThresholdJson<T>;

/**
 * A payment as the API returns it. `amount` keeps its historic shape (the
 * Decimal string, the cash); the retenue and stamp fields are numbers, and
 * grossAmount / settledAmount spare every screen the arithmetic. The
 * retenue threshold snapshot, when the row carries it, is a 3-decimal
 * number (toThreshold), null kept.
 */
export function toPaymentJson<
  T extends {
    amount: NumLike;
    withholdingRate?: NumLike;
    withholdingAmount?: NumLike;
    stampAmount?: NumLike;
  },
>(payment: T): PaymentJson<T> {
  const threshold =
    'withholdingThreshold' in payment
      ? {
          withholdingThreshold: toThreshold(
            (payment as { withholdingThreshold?: NumLike })
              .withholdingThreshold,
          ),
        }
      : {};
  return {
    ...payment,
    ...threshold,
    withholdingRate: toRate(payment.withholdingRate),
    withholdingAmount: toAmount(payment.withholdingAmount),
    stampAmount: toAmount(payment.stampAmount),
    grossAmount: toAmount(paymentGross(payment)),
    settledAmount: toAmount(paymentSettled(payment)),
  } as PaymentJson<T>;
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
