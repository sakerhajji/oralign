import { Prisma } from '@prisma/client';
import {
  computeWithholding,
  round3,
  withholdingIneligibility,
  type WithholdingRule,
} from '../../common/billing/tax-split';
import { settleQuote } from '../quote-money';

/**
 * The money rows a devis prints under its total (spec §4): an estimated
 * « Retenue si appliquée » and its net, then « Déjà réglé / Reste à
 * payer ». Pure: QuotationPdfService reads the figures, these rules decide
 * what they are, and the admin quote summary (quote-review.tsx, through
 * components/orders/quote-retenue-estimate.ts) mirrors them.
 */

type NumLike = Prisma.Decimal | number | string | null | undefined;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asMoney(value: unknown): NumLike {
  if (Prisma.Decimal.isDecimal(value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (
    typeof value === 'string' &&
    value.trim() !== '' &&
    Number.isFinite(Number(value))
  ) {
    return value;
  }
  return null;
}

/**
 * The retenue rule a devis states: the three keys its companySnapshot
 * froze at send time (withholdingEnabled / withholdingRate /
 * withholdingThreshold, written since 2026-11-27), else the live rule, as
 * every reader of an older snapshot does (like the stamp). null when
 * neither is known: no estimate.
 */
export function quoteWithholdingRule(
  companySnapshot: unknown,
  live: WithholdingRule | null,
): WithholdingRule | null {
  const snapshot = asRecord(companySnapshot);
  if (snapshot && typeof snapshot.withholdingEnabled === 'boolean') {
    return {
      enabled: snapshot.withholdingEnabled,
      rate: asMoney(snapshot.withholdingRate),
      threshold: asMoney(snapshot.withholdingThreshold),
    };
  }
  return live;
}

/**
 * The base of each payment the devis will be paid in: every planned
 * installment (cancelled ones excluded by the caller), or the whole total
 * while there is no plan yet (one payment).
 */
export function quotePaymentBases(
  installmentAmounts: NumLike[],
  total: NumLike,
): Prisma.Decimal[] {
  const planned = installmentAmounts.map((amount) => round3(amount));
  return planned.length > 0 ? planned : [round3(total)];
}

export interface QuoteWithholdingEstimate {
  /** The rate the retenue would be taken at (%). */
  rate: Prisma.Decimal;
  /** Σ of the retenue on every payment it may apply to. */
  amount: Prisma.Decimal;
  /** How many payments it may apply to, out of `payments`. */
  eligiblePayments: number;
  payments: number;
  /** The threshold in the rule (null: none), for the devis' note. */
  threshold: Prisma.Decimal | null;
}

/**
 * The retenue the practitioner may keep back if he applies it (an
 * estimate: he opts in at each payment): the rule's rate on every payment
 * that the rule lets it apply to (P-D1's withholdingIneligibility: switched
 * on, a rate above 0, the payment's base at or above the threshold; each
 * payment is its own base). null when it applies to none: the devis then
 * prints no retenue row at all.
 */
export function estimateQuoteWithholding(
  bases: NumLike[],
  rule: WithholdingRule | null,
): QuoteWithholdingEstimate | null {
  if (!rule) return null;
  const payments = bases
    .map((base) => round3(base))
    .filter((base) => base.greaterThan(0));
  let amount = new Prisma.Decimal(0);
  let rate: Prisma.Decimal | null = null;
  let eligiblePayments = 0;
  for (const base of payments) {
    if (withholdingIneligibility(base, rule) !== null) continue;
    const withholding = computeWithholding(base, rule.rate);
    if (!withholding.rate || withholding.amount.isZero()) continue;
    amount = amount.plus(withholding.amount);
    rate = withholding.rate;
    eligiblePayments += 1;
  }
  if (!rate || eligiblePayments === 0) return null;
  const threshold = asMoney(rule.threshold);
  return {
    rate,
    amount,
    eligiblePayments,
    payments: payments.length,
    threshold:
      threshold === null || threshold === undefined ? null : round3(threshold),
  };
}

export interface QuoteBalance {
  /** Settled so far (QuoteMoney.received: cash + retenue - stamps). */
  paid: Prisma.Decimal;
  /** What the devis still asks for, with the settlement's tolerance. */
  remaining: Prisma.Decimal;
}

/**
 * « Déjà réglé / Reste à payer » of a devis: null while nothing was
 * received (no rows). Same rule and tolerance as the settlement
 * (settleQuote), so the devis and the quote's own paymentStatus agree.
 */
export function quoteBalance(
  total: NumLike,
  received: NumLike,
): QuoteBalance | null {
  const settlement = settleQuote(total, received);
  if (!settlement.paidAmount.greaterThan(0)) return null;
  return {
    paid: settlement.paidAmount,
    remaining: settlement.remainingAmount,
  };
}
