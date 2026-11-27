import { Prisma } from '@prisma/client';
import { lookupActorName } from '../../common/access/actor-snapshot';
import type { Caller } from '../../common/access/caller';

/**
 * The trail of the fiscal and rollout settings (spec §4, DECISIONS §4):
 * one BillingSettingsAuditLog row per field that moved, written in the
 * transaction of the settings update. Pure diff + one writer, no DI.
 *
 * Values are stored as JSON scalars so the trail reads the same whatever
 * the column type: switches as booleans, the inactivity period as an
 * integer, every Decimal (rates, stamp, threshold) as its decimal string
 * at the column's scale ("1000.000", "1.00"), never a float.
 */

/** The audited fields, in display order (schema comment of BillingSettingsAuditLog). */
export const AUDITED_BILLING_SETTINGS_FIELDS = [
  'withholdingEnabled',
  'withholdingRate',
  'withholdingThreshold',
  'stampDuty',
  'defaultTvaRate',
  'inactivityRuleEnabled',
  'inactivityMonths',
] as const;

export type AuditedBillingSettingsField =
  (typeof AUDITED_BILLING_SETTINGS_FIELDS)[number];

export type BillingSettingsAuditValue = string | number | boolean | null;

/** The audited columns of a settings row (as Prisma returns them). */
export type AuditedBillingSettings = {
  withholdingEnabled: boolean;
  withholdingRate: Prisma.Decimal;
  withholdingThreshold: Prisma.Decimal;
  stampDuty: Prisma.Decimal;
  defaultTvaRate: number;
  inactivityRuleEnabled: boolean;
  inactivityMonths: number;
};

export interface BillingSettingsChange {
  field: AuditedBillingSettingsField;
  /** null on the row's creation (no value before). */
  before: BillingSettingsAuditValue;
  after: BillingSettingsAuditValue;
}

/** Decimal places each Decimal column is stored at (schema scale). */
const DECIMAL_SCALE: Partial<Record<AuditedBillingSettingsField, number>> = {
  withholdingRate: 2,
  withholdingThreshold: 3,
  stampDuty: 3,
};

type RawValue = Prisma.Decimal | number | string | boolean | null | undefined;

/** One audited value as stored in the trail (see the file comment). */
export function auditValueOf(
  field: AuditedBillingSettingsField,
  value: RawValue,
): BillingSettingsAuditValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  const scale = DECIMAL_SCALE[field];
  if (scale !== undefined) {
    return new Prisma.Decimal(value as Prisma.Decimal.Value)
      .toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP)
      .toFixed(scale);
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The audited fields that differ between `before` (null = the row is being
 * created) and `after`, in AUDITED_BILLING_SETTINGS_FIELDS order. Decimals
 * compare at their stored scale, so 1 and "1.000" are the same stamp.
 */
export function diffBillingSettings(
  before: AuditedBillingSettings | null,
  after: AuditedBillingSettings,
): BillingSettingsChange[] {
  const changes: BillingSettingsChange[] = [];
  for (const field of AUDITED_BILLING_SETTINGS_FIELDS) {
    const previous = before ? auditValueOf(field, before[field]) : null;
    const next = auditValueOf(field, after[field]);
    if (before && previous === next) continue;
    changes.push({ field, before: previous, after: next });
  }
  return changes;
}

/**
 * Write one trail row per change, with the actor and a snapshot of their
 * name (SetNull FK: the trail outlives the account). `actor` null = a
 * system write. Runs on the caller's transaction client, so the trail
 * commits or rolls back with the settings. Returns the rows written.
 */
export async function writeBillingSettingsAudit(
  tx: Pick<Prisma.TransactionClient, 'billingSettingsAuditLog' | 'user'>,
  actor: Pick<Caller, 'userId'> | null,
  changes: readonly BillingSettingsChange[],
): Promise<number> {
  if (changes.length === 0) return 0;
  const actorName = actor ? await lookupActorName(tx, actor.userId) : null;
  const toJson = (value: BillingSettingsAuditValue) =>
    value === null ? Prisma.JsonNull : value;
  const { count } = await tx.billingSettingsAuditLog.createMany({
    data: changes.map((change) => ({
      actorId: actor?.userId ?? null,
      actorName,
      field: change.field,
      before: toJson(change.before),
      after: toJson(change.after),
    })),
  });
  return count;
}

/** One trail row as the admin API returns it. */
export interface BillingSettingsAuditEntryJson {
  id: string;
  field: string;
  before: BillingSettingsAuditValue;
  after: BillingSettingsAuditValue;
  /** The name snapshotted at write time; null for a system write. */
  actorName: string | null;
  createdAt: Date;
}

/** Only scalars are ever written; anything else reads as null. */
function scalarOf(value: Prisma.JsonValue | null): BillingSettingsAuditValue {
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? value
    : null;
}

export function toBillingSettingsAuditEntryJson(row: {
  id: string;
  field: string;
  before: Prisma.JsonValue | null;
  after: Prisma.JsonValue | null;
  actorName: string | null;
  createdAt: Date;
}): BillingSettingsAuditEntryJson {
  return {
    id: row.id,
    field: row.field,
    before: scalarOf(row.before),
    after: scalarOf(row.after),
    actorName: row.actorName,
    createdAt: row.createdAt,
  };
}
