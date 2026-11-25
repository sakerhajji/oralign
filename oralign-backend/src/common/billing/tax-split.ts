import { Prisma } from '@prisma/client';

/**
 * Billing arithmetic shared by quotes, payments and invoices.
 *
 * The company's prices are TTC: TVA is already inside them, so every
 * document derives HT and TVA BACKWARDS from the price. The fiscal stamp
 * is ADDED on top of each payment, since each payment gets its own
 * facture (owner decision 2026-11-20):
 *
 *     HT + TVA = TTC (the price)      TTC + timbre = total of the facture
 *
 * A retenue à la source, when the practitioner applies one, is taken on
 * the TTC (stamp excluded) and comes off what he pays:
 *
 *     retenue = round(TTC x rate %)      net payé = total - retenue
 *
 * All maths is Decimal, rounded half-up to 3 places (TND millimes). The
 * remainder trick (TVA = taxable - HT, net = total - retenue) is what keeps
 * every sum exact; never round those two separately.
 */

export type Money = Prisma.Decimal;
type NumLike = Prisma.Decimal | number | string | null | undefined;

export const dec = (value: NumLike): Prisma.Decimal => {
  if (value === null || value === undefined || value === '') {
    return new Prisma.Decimal(0);
  }
  const d = new Prisma.Decimal(value as Prisma.Decimal.Value);
  return d.isFinite() ? d : new Prisma.Decimal(0);
};

export const round3 = (value: NumLike): Prisma.Decimal =>
  dec(value).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);

/** Decimal → JS number with 3 decimals, for DTOs and Float columns. */
export const toAmount = (value: NumLike): number => Number(round3(value).toFixed(3));

const nonNegative = (value: NumLike): Prisma.Decimal => {
  const d = dec(value);
  return d.isNegative() ? new Prisma.Decimal(0) : d;
};

const clampRate = (rate: NumLike): Prisma.Decimal => {
  const r = nonNegative(rate);
  return r.greaterThan(100) ? new Prisma.Decimal(100) : r;
};

/**
 * The TVA rate a document uses: its own stored rate when it has one above
 * 0, otherwise the company default. A stored 0 is treated as "never set",
 * because pack quotes used to be written at 0 % although their price
 * includes TVA.
 */
export function resolveTvaRate(
  stored: NumLike,
  companyDefault: NumLike,
): number {
  const own = Number(stored ?? 0);
  if (Number.isFinite(own) && own > 0) return Math.min(own, 100);
  const fallback = Number(companyDefault ?? 19);
  return Number.isFinite(fallback) ? Math.max(0, Math.min(fallback, 100)) : 19;
}

/**
 * A remise typed as a percentage: `percent` % of `gross`, rounded half-up
 * to the millime. The percent is clamped to 0..100, so the remise never
 * exceeds the gross.
 */
export function percentOf(gross: NumLike, percent: NumLike): Money {
  return round3(nonNegative(gross).mul(clampRate(percent)).div(100));
}

export interface InclusiveSplit {
  /** The amount as charged: TVA and stamp included. */
  total: Money;
  /** The stamp carved out of `total` (never more than `total`). */
  stamp: Money;
  /** total - stamp: the part TVA applies to, TVA included. */
  taxable: Money;
  ht: Money;
  /** taxable - ht, so ht + tva + stamp === total. */
  tva: Money;
}

/** Split an amount that already includes TVA (and the stamp, if any). */
export function splitInclusive(
  total: NumLike,
  tvaRatePercent: NumLike,
  stamp: NumLike = 0,
): InclusiveSplit {
  const t = round3(nonNegative(total));
  const rawStamp = round3(nonNegative(stamp));
  const s = rawStamp.greaterThan(t) ? t : rawStamp;
  const taxable = t.minus(s);
  const rate = clampRate(tvaRatePercent);
  const ht = round3(taxable.div(rate.div(100).plus(1)));
  return { total: t, stamp: s, taxable, ht, tva: taxable.minus(ht) };
}

export interface WithholdingSplit {
  /** The rate actually applied, null when none. */
  rate: Money | null;
  /** The amount the withholding is computed on (the TTC due). */
  base: Money;
  amount: Money;
  /** base - amount: what the practitioner actually pays. */
  net: Money;
}

/**
 * Retenue à la source on `base`. A missing or zero rate means "not
 * applied": amount 0, net = base. The rate is capped below 100 so the net
 * stays positive (the card gateway refuses a zero charge).
 */
export function computeWithholding(
  base: NumLike,
  ratePercent: NumLike,
): WithholdingSplit {
  const b = round3(nonNegative(base));
  const rate = clampRate(ratePercent);
  if (rate.isZero() || b.isZero()) {
    return { rate: null, base: b, amount: new Prisma.Decimal(0), net: b };
  }
  const capped = rate.greaterThanOrEqualTo(100) ? new Prisma.Decimal(99.99) : rate;
  const amount = round3(b.mul(capped).div(100));
  return { rate: capped, base: b, amount, net: b.minus(amount) };
}

/**
 * Spread `total` over `weights` proportionally, rounded to the millime,
 * the last non-zero weight absorbing the rounding so the parts add up to
 * `total` exactly. All-zero weights give all-zero parts.
 */
export function spreadProportionally(total: NumLike, weights: NumLike[]): Money[] {
  const t = round3(total);
  const w = weights.map((x) => nonNegative(x));
  const sum = w.reduce((acc, x) => acc.plus(x), new Prisma.Decimal(0));
  if (w.length === 0) return [];
  if (sum.isZero()) return w.map(() => new Prisma.Decimal(0));
  let lastIndex = -1;
  w.forEach((x, i) => {
    if (!x.isZero()) lastIndex = i;
  });
  const parts = w.map((x) => round3(t.mul(x).div(sum)));
  const others = parts.reduce(
    (acc, p, i) => (i === lastIndex ? acc : acc.plus(p)),
    new Prisma.Decimal(0),
  );
  parts[lastIndex] = t.minus(others);
  return parts;
}

export interface PaymentCharge {
  /** The amount due, TTC (an installment, or the treatment fee + CBCT). */
  due: Money;
  /** The stamp added on top: the payment's facture carries it. */
  stamp: Money;
  /** due + stamp: the total of the facture. */
  total: Money;
  /** The retenue rate applied, null when none. */
  withholdingRate: Money | null;
  /** round(due x rate %): kept back by the practitioner. */
  withholding: Money;
  /** total - withholding: the cash charged or received. */
  cash: Money;
}

/**
 * What one payment of `due` (TTC) charges: the stamp is added, the
 * retenue (on the TTC, stamp excluded) comes off. What the payment
 * settles on the devis is always `due` (= cash + withholding - stamp).
 */
export function paymentCharge(
  due: NumLike,
  stamp: NumLike,
  withholdingRatePercent?: NumLike,
): PaymentCharge {
  const d = round3(nonNegative(due));
  const s = d.isZero() ? new Prisma.Decimal(0) : round3(nonNegative(stamp));
  const w = computeWithholding(d, withholdingRatePercent);
  const total = d.plus(s);
  return {
    due: d,
    stamp: s,
    total,
    withholdingRate: w.rate,
    withholding: w.amount,
    cash: total.minus(w.amount),
  };
}

export interface InclusiveLineInput {
  quantity?: NumLike;
  /** Unit price as typed, TVA included (the stamp is added to the total). */
  unitPriceTtc?: NumLike;
  /** Per-line rate override; null/undefined = the invoice rate. */
  tvaRate?: NumLike;
}

export interface InclusiveTotals {
  /** quantity x unit TTC, per line. */
  lineTtc: Money[];
  /** The HT each line carries once the discount is taken out. */
  lineHt: Money[];
  /** lineHt / quantity, per line (0 when the quantity is 0). */
  unitHt: Money[];
  grossTtc: Money;
  /** The TTC discount actually applied (clamped to the gross). */
  discountApplied: Money;
  /** The stamp added on top (0 when the invoice is worth nothing). */
  stamp: Money;
  subTotalHt: Money;
  tvaAmount: Money;
  /** grossTtc - discount + stamp: HT + TVA + stamp. */
  totalTtc: Money;
  withholdingRate: Money | null;
  withholdingAmount: Money;
  netPayable: Money;
}

/**
 * Totals of an invoice whose lines are typed TTC (TVA included).
 *
 * The discount (TTC) comes off the gross; what remains is spread back
 * over the lines in proportion to their TTC, and each line's HT is
 * derived at its own rate. TVA is the remainder. The stamp is added on
 * top, and the retenue is taken on the TTC without the stamp, so the
 * stored figures always add up: subTotalHt + tvaAmount + stamp = totalTtc
 * and netPayable = totalTtc - withholdingAmount.
 */
export function inclusiveInvoiceTotals(
  lines: InclusiveLineInput[],
  invoiceRatePercent: NumLike,
  discountTtc: NumLike,
  stamp: NumLike,
  withholdingRatePercent?: NumLike,
): InclusiveTotals {
  const lineTtc = lines.map((l) =>
    round3(nonNegative(l.quantity ?? 1).mul(nonNegative(l.unitPriceTtc))),
  );
  const grossTtc = lineTtc.reduce((acc, x) => acc.plus(x), new Prisma.Decimal(0));
  const rawDiscount = round3(nonNegative(discountTtc));
  const discountApplied = rawDiscount.greaterThan(grossTtc) ? grossTtc : rawDiscount;
  // TTC of the lines after the discount: what TVA applies to.
  const taxable = grossTtc.minus(discountApplied);
  const s = taxable.isZero() ? new Prisma.Decimal(0) : round3(nonNegative(stamp));
  const totalTtc = taxable.plus(s);

  const shares = spreadProportionally(taxable, lineTtc);
  const lineHt = shares.map((share, i) => {
    const rate = clampRate(
      lines[i].tvaRate === null || lines[i].tvaRate === undefined
        ? invoiceRatePercent
        : lines[i].tvaRate,
    );
    return round3(share.div(rate.div(100).plus(1)));
  });
  const unitHt = lineHt.map((ht, i) => {
    const q = nonNegative(lines[i].quantity ?? 1);
    return q.isZero() ? new Prisma.Decimal(0) : round3(ht.div(q));
  });
  const subTotalHt = lineHt.reduce((acc, x) => acc.plus(x), new Prisma.Decimal(0));
  const withholding = computeWithholding(taxable, withholdingRatePercent);

  return {
    lineTtc,
    lineHt,
    unitHt,
    grossTtc,
    discountApplied,
    stamp: s,
    subTotalHt,
    tvaAmount: taxable.minus(subTotalHt),
    totalTtc,
    withholdingRate: withholding.rate,
    withholdingAmount: withholding.amount,
    netPayable: totalTtc.minus(withholding.amount),
  };
}
