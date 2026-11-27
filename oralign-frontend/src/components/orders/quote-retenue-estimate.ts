/**
 * The devis' « Retenue si appliquée » (spec §4), as the admin quote
 * summary (quote-review.tsx) previews it. Mirror of the server rule that
 * prints it on the devis PDF (oralign-backend/src/quotations/services/
 * quote-document-money.ts), with the eligibility of P-D1's
 * withholdingIneligibility (lib/billing/tax-split.ts): switched on, a rate
 * above 0, and each payment's base (the installment, or the whole total
 * while there is no plan) at or above the threshold. Integer millimes, as
 * every billing preview. No runtime import, so `node --test` runs it as
 * is: see quote-retenue-estimate.test.mjs.
 */

/** The retenue rule a devis states. */
export interface QuoteRetenueRule {
  enabled: boolean;
  /** The rate (%); 0 = the retenue cannot apply. */
  rate: number;
  /** Base from which it applies; null = no threshold. */
  threshold: number | null;
}

export interface QuoteRetenueEstimate {
  /** The rate it would be taken at (%, at most 2 decimals). */
  rate: number;
  /** Σ of the retenue on every payment it may apply to. */
  amount: number;
  /** How many payments it may apply to, out of `payments`. */
  eligiblePayments: number;
  payments: number;
  threshold: number | null;
}

const toMillimes = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 1000) : 0;
};

/** Percent with at most 2 decimals, in hundredths (1.5 -> 150), capped below 100 %. */
const toBasisPoints = (rate: unknown): number => {
  const n = Number(rate ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(9999, Math.round(Math.min(n, 100) * 100));
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/**
 * The rule a devis states: the keys its company snapshot froze at send
 * time (withholdingEnabled / withholdingRate / withholdingThreshold, since
 * 2026-11-27), else the live rule. A draft always reads the live rule: its
 * snapshot is built only when it is sent.
 */
export function quoteRetenueRule(
  companySnapshot: unknown,
  live: QuoteRetenueRule | null,
  isDraft: boolean,
): QuoteRetenueRule | null {
  if (isDraft) return live;
  const snapshot =
    companySnapshot && typeof companySnapshot === 'object' && !Array.isArray(companySnapshot)
      ? (companySnapshot as Record<string, unknown>)
      : null;
  if (snapshot && typeof snapshot.withholdingEnabled === 'boolean') {
    const threshold = asNumber(snapshot.withholdingThreshold);
    return {
      enabled: snapshot.withholdingEnabled,
      rate: asNumber(snapshot.withholdingRate) ?? 0,
      threshold: threshold !== null && threshold > 0 ? threshold : null,
    };
  }
  return live;
}

/**
 * The bases the devis will be paid in: the planned installments
 * (cancelled ones already left out by the caller), or the whole total.
 */
export function quotePaymentBases(installmentAmounts: unknown[], total: unknown): number[] {
  const planned = installmentAmounts.map((amount) => toMillimes(amount) / 1000);
  return planned.length > 0 ? planned : [toMillimes(total) / 1000];
}

/** null when the retenue applies to no payment: no row at all. */
export function estimateQuoteRetenue(
  bases: number[],
  rule: QuoteRetenueRule | null,
): QuoteRetenueEstimate | null {
  if (!rule || rule.enabled !== true) return null;
  const bp = toBasisPoints(rule.rate);
  if (bp === 0) return null;
  const thresholdM = rule.threshold === null ? null : Math.max(0, toMillimes(rule.threshold));
  const payments = bases.map(toMillimes).filter((base) => base > 0);
  let amountM = 0;
  let eligiblePayments = 0;
  for (const baseM of payments) {
    if (thresholdM !== null && baseM < thresholdM) continue;
    const withheldM = Math.round((baseM * bp) / 10000);
    if (withheldM === 0) continue;
    amountM += withheldM;
    eligiblePayments += 1;
  }
  if (eligiblePayments === 0) return null;
  return {
    rate: bp / 100,
    amount: amountM / 1000,
    eligiblePayments,
    payments: payments.length,
    threshold: rule.threshold,
  };
}
