/**
 * The billing settings form's number parsing and its "rules" fields: the
 * fiscal and rollout settings the backend journals in
 * BillingSettingsAuditLog (quotations/services/billing-settings-audit.ts).
 * Pure functions, mirrored on the backend DTO limits, so what the form
 * accepts is what the server stores.
 */

// ─── Number parsing (mirrors the backend DTO limits) ─────────────────────

const AMOUNT_RE = /^\d+(?:\.\d{1,3})?$/;
/** Upper bound of a Decimal(12,3) column. */
export const MAX_AMOUNT = 999_999_999.999;

/** An amount ≥ 0 with at most 3 decimals ("1 000,5" typed as "1000,5"); null when invalid. */
export function parseAmount(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (!AMOUNT_RE.test(text)) return null;
  const value = Number(text);
  return value <= MAX_AMOUNT ? value : null;
}

/** A TVA rate: an amount from 0 to 100. */
export function parseRate(raw: string): number | null {
  const value = parseAmount(raw);
  return value !== null && value <= 100 ? value : null;
}

/** Retenue à la source: 2 decimals, strictly below 100 (DTO: 0 to 99.99). */
const PERCENT_RE = /^\d+(?:\.\d{1,2})?$/;
export const MAX_WITHHOLDING_RATE = 99.99;

export function parseWithholdingRate(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (!PERCENT_RE.test(text)) return null;
  const value = Number(text);
  return value <= MAX_WITHHOLDING_RATE ? value : null;
}

/** A whole number ≥ 1 (the next quote number). */
export function parseNextNumber(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

/** Bounds of the inactivity period, in calendar months (DTO: 1 to 24). */
export const INACTIVITY_MONTHS_MIN = 1;
export const INACTIVITY_MONTHS_MAX = 24;

export function parseInactivityMonths(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const value = Number(text);
  return value >= INACTIVITY_MONTHS_MIN && value <= INACTIVITY_MONTHS_MAX ? value : null;
}

// ─── The rules fields ─────────────────────────────────────────────────────

/** The journaled fields, in the backend's display order. */
export const BILLING_RULE_FIELDS = [
  'withholdingEnabled',
  'withholdingRate',
  'withholdingThreshold',
  'stampDuty',
  'defaultTvaRate',
  'inactivityRuleEnabled',
  'inactivityMonths',
] as const;

export type BillingRuleField = (typeof BILLING_RULE_FIELDS)[number];

/** How a rules value reads: a switch, a percentage, an amount or a period. */
export type BillingRuleKind = 'switch' | 'percent' | 'amount' | 'months';

const KINDS: Record<BillingRuleField, BillingRuleKind> = {
  withholdingEnabled: 'switch',
  withholdingRate: 'percent',
  withholdingThreshold: 'amount',
  stampDuty: 'amount',
  defaultTvaRate: 'percent',
  inactivityRuleEnabled: 'switch',
  inactivityMonths: 'months',
};

export function billingRuleKind(field: BillingRuleField): BillingRuleKind {
  return KINDS[field];
}

export function isBillingRuleField(value: unknown): value is BillingRuleField {
  return typeof value === 'string' && (BILLING_RULE_FIELDS as readonly string[]).includes(value);
}

export type BillingRuleValue = number | boolean;
export type BillingRuleValues = Record<BillingRuleField, BillingRuleValue>;

export interface BillingRuleChange {
  field: BillingRuleField;
  /** null when the settings do not exist yet (first save). */
  before: BillingRuleValue | null;
  after: BillingRuleValue;
}

/** Numbers compared in millimes, never as floats. */
const sameValue = (a: BillingRuleValue | null | undefined, b: BillingRuleValue): boolean => {
  if (typeof b === 'boolean') return a === b;
  const n = Number(a);
  return (
    a !== null && a !== undefined && Number.isFinite(n) && Math.round(n * 1000) === Math.round(b * 1000)
  );
};

/**
 * The rules fields a save would change, in display order: what the
 * confirmation dialog lists and the backend journals. `saved` null = the
 * settings do not exist yet: nothing to confirm (the initial values are
 * journaled by the server).
 */
export function billingRuleChanges(
  saved: Partial<Record<BillingRuleField, BillingRuleValue | null>> | null,
  next: BillingRuleValues,
): BillingRuleChange[] {
  if (!saved) return [];
  return BILLING_RULE_FIELDS.filter((field) => !sameValue(saved[field], next[field])).map(
    (field) => ({ field, before: saved[field] ?? null, after: next[field] }),
  );
}

/**
 * Did a save change the doctor inactivity rule (switch or period)? The
 * users desk shows each practitioner's activity (status, deadline,
 * « Règle désactivée ») and filters « Avertis » under the rule as it was
 * read, so its cached lists must refetch. Unknown previous settings (a
 * first save, a cold cache) count as a change.
 */
export function inactivityRuleChanged(
  before:
    | { inactivityRuleEnabled?: boolean | null; inactivityMonths?: number | null }
    | null
    | undefined,
  after: { inactivityRuleEnabled?: boolean | null; inactivityMonths?: number | null },
): boolean {
  if (!before) return true;
  return (
    (before.inactivityRuleEnabled ?? false) !== (after.inactivityRuleEnabled ?? false) ||
    (before.inactivityMonths ?? null) !== (after.inactivityMonths ?? null)
  );
}

/** A switch the save turns on (the retenue, the inactivity sweep). */
export function isActivation(change: BillingRuleChange): boolean {
  return billingRuleKind(change.field) === 'switch' && change.before !== true && change.after === true;
}

/**
 * A journaled value as the API returns it ("1000.000", "1.00", 6, true)
 * read back as a number or a boolean; null when it carries none.
 */
export function readRuleValue(value: unknown): BillingRuleValue | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
