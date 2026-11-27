import { Prisma } from '@prisma/client';
import { dec } from '../../common/billing/tax-split';
import { settleQuote } from '../../quotations/quote-money';

type MoneyLike = Prisma.Decimal | number | string | null | undefined;

/** A successful payment of a devis, as the balance reads it. */
export interface SettledQuotePayment {
  id: string;
  /** What it settled on the devis: cash + retenue - stamp (TTC). */
  settled: MoneyLike;
  /** When the money landed (paidAt, else createdAt). */
  at: Date;
}

/** Chronological order of payments: their date, the id breaking ties. */
function comesNoLaterThan(
  payment: SettledQuotePayment,
  current: SettledQuotePayment,
): boolean {
  const delta = payment.at.getTime() - current.at.getTime();
  if (delta !== 0) return delta < 0;
  return payment.id <= current.id;
}

/**
 * "Reste à payer" on the devis right after `current` (spec §4, frozen on
 * the installment facture at issue in Invoice.quoteRemainingAfter): the
 * devis total minus what the payments up to and including this one
 * settled. Payments made AFTER it never count, so a facture minted late
 * (backfill, a download) states the balance of its own moment, not
 * today's. Same tolerance as the settlement itself (settleQuote): a plan
 * one millime short of the total leaves nothing to pay. Never negative.
 */
export function quoteRemainingAfter(
  total: MoneyLike,
  payments: SettledQuotePayment[],
  current: SettledQuotePayment,
): Prisma.Decimal {
  const seen = new Set<string>();
  let received = new Prisma.Decimal(0);
  for (const payment of [current, ...payments]) {
    if (seen.has(payment.id)) continue;
    seen.add(payment.id);
    if (payment.id !== current.id && !comesNoLaterThan(payment, current)) {
      continue;
    }
    received = received.plus(dec(payment.settled));
  }
  return settleQuote(total, received).remainingAmount;
}
