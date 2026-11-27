/**
 * Display-side mirror of the backend billing maths
 * (oralign-backend/src/common/billing/tax-split.ts).
 *
 * Prices are TTC (TVA included): HT and TVA are derived backwards from
 * them. The fiscal stamp is ADDED to every payment (each payment gets its
 * own facture), and a retenue à la source is taken on the TTC without the
 * stamp: total = TTC + timbre, net = total - retenue. The server always
 * recomputes and stores the real figures; these
 * helpers only preview them, with the same rounding (half-up, millimes),
 * so what a dialog announces is what the invoice prints.
 *
 * Everything runs on integer millimes to avoid floating-point drift.
 */

const toMillimes = (value: number | string | null | undefined): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 1000) : 0;
};

const fromMillimes = (m: number): number => m / 1000;

/** Percent with at most 2 decimals, as an integer in hundredths (1.5 → 150). */
const toBasisPoints = (rate: number | string | null | undefined): number => {
  const n = Number(rate ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(Math.min(n, 100) * 100);
};

/**
 * A remise typed as a percentage: `percent` % of `gross`, half-up to the
 * millime, clamped to 0..100 (mirrors the server's percentOf).
 */
export function previewPercentOf(
  gross: number | string | null | undefined,
  percent: number | string | null | undefined,
): number {
  const grossM = Math.max(0, toMillimes(gross));
  const bp = toBasisPoints(percent);
  return fromMillimes(Math.round((grossM * bp) / 10000));
}

export interface WithholdingPreview {
  /** The rate applied, 0 when none. */
  rate: number;
  due: number;
  amount: number;
  /** due - amount: what is actually paid. */
  net: number;
}

/** Retenue à la source on `due`; a rate of 0 (or off) leaves `net = due`. */
export function previewWithholding(
  due: number | string | null | undefined,
  ratePercent: number | string | null | undefined,
  apply = true,
): WithholdingPreview {
  const dueM = Math.max(0, toMillimes(due));
  let bp = apply ? toBasisPoints(ratePercent) : 0;
  if (bp >= 10000) bp = 9999;
  if (bp === 0 || dueM === 0) {
    return { rate: 0, due: fromMillimes(dueM), amount: 0, net: fromMillimes(dueM) };
  }
  const amountM = Math.round((dueM * bp) / 10000);
  return {
    rate: bp / 100,
    due: fromMillimes(dueM),
    amount: fromMillimes(amountM),
    net: fromMillimes(dueM - amountM),
  };
}

/**
 * The retenue à la source rule in force (spec §4), as the billing
 * settings (or a document's snapshot) describe it.
 */
export interface WithholdingRulePreview {
  /** The master switch; anything but true is off. */
  enabled?: boolean | null;
  /** The rate (%); 0 or unset means the retenue cannot apply. */
  rate?: number | string | null;
  /** Base (TTC, stamp excluded) from which it may apply; null = no threshold. */
  threshold?: number | string | null;
}

/** Why the retenue cannot apply to a payment; null when it can. */
export type WithholdingIneligibility = 'disabled' | 'below_threshold';

/**
 * Mirror of the server's withholdingIneligibility (common/billing/
 * tax-split.ts): switched on, a rate above 0, and the payment's base (the
 * installment, or the fee + CBCT: TTC, stamp excluded) at or above the
 * threshold, compared in millimes. Each payment is its own base: a 2 380
 * devis paid as 3 x 793,333 never qualifies at a 1 000 threshold.
 */
export function withholdingIneligibility(
  base: number | string | null | undefined,
  rule: WithholdingRulePreview,
): WithholdingIneligibility | null {
  if (rule.enabled !== true || toBasisPoints(rule.rate) === 0) return 'disabled';
  if (rule.threshold === null || rule.threshold === undefined || rule.threshold === '') {
    return null;
  }
  const baseM = Math.max(0, toMillimes(base));
  const thresholdM = Math.max(0, toMillimes(rule.threshold));
  return baseM < thresholdM ? 'below_threshold' : null;
}

/** True when the retenue may be applied to a payment of `base`. */
export function isWithholdingEligible(
  base: number | string | null | undefined,
  rule: WithholdingRulePreview,
): boolean {
  return withholdingIneligibility(base, rule) === null;
}

export interface InclusiveSplitPreview {
  total: number;
  stamp: number;
  ht: number;
  tva: number;
}

/** Split an amount that already includes TVA (and the stamp, if any). */
export function previewInclusiveSplit(
  total: number | string | null | undefined,
  tvaRatePercent: number | string | null | undefined,
  stamp: number | string | null | undefined = 0,
): InclusiveSplitPreview {
  const totalM = Math.max(0, toMillimes(total));
  const stampM = Math.min(Math.max(0, toMillimes(stamp)), totalM);
  const taxableM = totalM - stampM;
  const bp = toBasisPoints(tvaRatePercent);
  const htM = Math.round((taxableM * 10000) / (10000 + bp));
  return {
    total: fromMillimes(totalM),
    stamp: fromMillimes(stampM),
    ht: fromMillimes(htM),
    tva: fromMillimes(taxableM - htM),
  };
}

export interface InclusiveLinePreview {
  quantity?: number | string | null;
  /** Unit price as typed, TVA included (the stamp is added to the total). */
  unitPriceTtc?: number | string | null;
  /** Per-line rate; null/undefined = the invoice rate. */
  tvaRate?: number | string | null;
}

export interface InclusiveTotalsPreview {
  lineTtc: number[];
  lineHt: number[];
  grossTtc: number;
  discountApplied: number;
  stamp: number;
  subTotalHt: number;
  tvaAmount: number;
  totalTtc: number;
  withholdingAmount: number;
  netPayable: number;
}

/** Totals of an invoice whose lines are typed TTC; the stamp is added on top. */
export function previewInclusiveInvoice(
  lines: InclusiveLinePreview[],
  invoiceRatePercent: number | string | null | undefined,
  discountTtc: number | string | null | undefined,
  stamp: number | string | null | undefined,
  withholdingRatePercent?: number | string | null,
): InclusiveTotalsPreview {
  const lineTtcM = lines.map((l) => {
    const q = Math.max(0, Number(l.quantity ?? 1) || 0);
    const u = Math.max(0, toMillimes(l.unitPriceTtc));
    return Math.round(q * u);
  });
  const grossM = lineTtcM.reduce((a, b) => a + b, 0);
  const discountM = Math.min(Math.max(0, toMillimes(discountTtc)), grossM);
  // TTC after the discount (what TVA applies to); the stamp is added.
  const taxableM = grossM - discountM;
  const stampM = taxableM > 0 ? Math.max(0, toMillimes(stamp)) : 0;
  const totalM = taxableM + stampM;

  // Proportional spread of the taxable amount, the last weighted line
  // absorbing the rounding (same rule as the server).
  let last = -1;
  lineTtcM.forEach((w, i) => {
    if (w > 0) last = i;
  });
  const shares = lineTtcM.map((w) => (grossM > 0 ? Math.round((taxableM * w) / grossM) : 0));
  if (last >= 0) {
    const others = shares.reduce((a, s, i) => (i === last ? a : a + s), 0);
    shares[last] = taxableM - others;
  }
  const lineHtM = shares.map((share, i) => {
    const rate = lines[i].tvaRate ?? invoiceRatePercent;
    const bp = toBasisPoints(rate);
    return Math.round((share * 10000) / (10000 + bp));
  });
  const htM = lineHtM.reduce((a, b) => a + b, 0);
  const withholding = previewWithholding(fromMillimes(taxableM), withholdingRatePercent);

  return {
    lineTtc: lineTtcM.map(fromMillimes),
    lineHt: lineHtM.map(fromMillimes),
    grossTtc: fromMillimes(grossM),
    discountApplied: fromMillimes(discountM),
    stamp: fromMillimes(stampM),
    subTotalHt: fromMillimes(htM),
    tvaAmount: fromMillimes(taxableM - htM),
    totalTtc: fromMillimes(totalM),
    withholdingAmount: withholding.amount,
    netPayable: fromMillimes(totalM - toMillimes(withholding.amount)),
  };
}

export interface PaymentChargePreview {
  /** The amount due, TTC (an installment, or the fee + CBCT). */
  due: number;
  /** The stamp added on top of the payment. */
  stamp: number;
  /** due + stamp: the total of the payment's facture. */
  total: number;
  /** The retenue rate applied, 0 when none. */
  rate: number;
  /** Retenue on the TTC (stamp excluded). */
  withholding: number;
  /** total - withholding: what is charged or handed over. */
  cash: number;
}

/**
 * What one payment of `due` charges (mirror of the server's
 * paymentCharge): the stamp is added, the retenue on the TTC comes off.
 */
export function previewPaymentCharge(
  due: number | string | null | undefined,
  stamp: number | string | null | undefined,
  withholdingRatePercent: number | string | null | undefined,
  applyWithholding = true,
): PaymentChargePreview {
  const dueM = Math.max(0, toMillimes(due));
  const stampM = dueM > 0 ? Math.max(0, toMillimes(stamp)) : 0;
  const w = previewWithholding(fromMillimes(dueM), withholdingRatePercent, applyWithholding);
  const withholdingM = toMillimes(w.amount);
  return {
    due: fromMillimes(dueM),
    stamp: fromMillimes(stampM),
    total: fromMillimes(dueM + stampM),
    rate: w.rate,
    withholding: w.amount,
    cash: fromMillimes(dueM + stampM - withholdingM),
  };
}

export interface PaymentChargesPreview extends PaymentChargePreview {
  /** How many payments the figures add up (each one its own facture and stamp). */
  count: number;
  /**
   * The smallest due among those payments (0 when there are none): the
   * retenue threshold applies payment by payment, so one retenue choice
   * for all of them is only possible when this one reaches it.
   */
  smallestDue: number;
}

/**
 * Several payments added up, exact to the millime: each one keeps its own
 * stamp and its own retenue, so 3 installments carry 3 stamps and their
 * retenues are rounded one by one (never taken on the sum).
 */
export function sumPaymentCharges(charges: PaymentChargePreview[]): PaymentChargesPreview {
  let dueM = 0;
  let stampM = 0;
  let withholdingM = 0;
  let count = 0;
  let smallestM: number | null = null;
  for (const c of charges) {
    const d = toMillimes(c.due);
    dueM += d;
    stampM += toMillimes(c.stamp);
    withholdingM += toMillimes(c.withholding);
    if (d > 0) {
      count += 1;
      smallestM = smallestM === null ? d : Math.min(smallestM, d);
    }
  }
  return {
    due: fromMillimes(dueM),
    stamp: fromMillimes(stampM),
    total: fromMillimes(dueM + stampM),
    rate: charges.find((c) => c.rate > 0)?.rate ?? 0,
    withholding: fromMillimes(withholdingM),
    cash: fromMillimes(dueM + stampM - withholdingM),
    count,
    smallestDue: fromMillimes(smallestM ?? 0),
  };
}

/**
 * One payment per installment (`amounts`, TTC), each with the stamp added
 * and the retenue taken on its own amount, then added up.
 */
export function previewInstallmentCharges(
  amounts: Array<number | string | null | undefined>,
  stamp: number | string | null | undefined,
  withholdingRatePercent: number | string | null | undefined,
  applyWithholding = true,
): PaymentChargesPreview {
  return sumPaymentCharges(
    amounts.map((amount) =>
      previewPaymentCharge(amount, stamp, withholdingRatePercent, applyWithholding),
    ),
  );
}

/**
 * The split of a payment as the API returns it: `cash` (its `amount`),
 * the retenue kept back and the stamp charged on top. What it settles on
 * the quote (or the fee) is cash + withholding - stamp, unless the API
 * sends it (`settled`).
 */
export function paymentSplitOf(
  cash: number | string | null | undefined,
  withholding: number | string | null | undefined,
  stamp: number | string | null | undefined,
  settled?: number | string | null,
): { settled: number; stamp: number; withholding: number; cash: number } {
  const cashM = toMillimes(cash);
  const withholdingM = Math.max(0, toMillimes(withholding));
  const stampM = Math.max(0, toMillimes(stamp));
  const sent = settled == null || settled === '' ? null : toMillimes(settled);
  const settledM = sent != null && sent > 0 ? sent : cashM + withholdingM - stampM;
  return {
    settled: fromMillimes(settledM),
    stamp: fromMillimes(stampM),
    withholding: fromMillimes(withholdingM),
    cash: fromMillimes(cashM),
  };
}

export interface PlanStampsPreview {
  /** Payments of the plan (each one its own facture). */
  count: number;
  /** The stamp each payment carries. */
  stampEach: number;
  /** count x stampEach. */
  stamps: number;
  /** The quote's TTC total + every stamp: what the plan costs in all. */
  total: number;
}

/**
 * A payment plan of `count` payments on a quote of `totalTtc`: one stamp
 * per payment, added on top of the quote's total (a devis carries none).
 */
export function previewPlanStamps(
  totalTtc: number | string | null | undefined,
  count: number,
  stamp: number | string | null | undefined,
): PlanStampsPreview {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const eachM = Math.max(0, toMillimes(stamp));
  const stampsM = n * eachM;
  return {
    count: n,
    stampEach: fromMillimes(eachM),
    stamps: fromMillimes(stampsM),
    total: fromMillimes(Math.max(0, toMillimes(totalTtc)) + stampsM),
  };
}
