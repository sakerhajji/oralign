import type { ProductionEventType, UserRole } from '@prisma/client';
import type {
  ActTotals,
  ProductionAuthorTotals,
  ProductionCaseTotals,
  ProductionDayTotals,
  ProductionOrderRef,
  ProductionSummary,
} from '../production.contract';
import { emptyActTotals } from '../kernel';
import { BusinessClock } from './report-clock';
import { compareText } from './report-views';

/**
 * Pure aggregation of the journal / recap (CONTRACT §2.2 "Summary"). The
 * service hands it the COUNTED rows only (live, `declared`, performedAt in
 * the period); every bucket below sums the same rows, so the totals, the
 * days, the cases and the authors always add up to each other. The rows
 * may come in ANY order (the recap loads them unsorted): nothing below
 * depends on it.
 */
export interface SummaryCountedRow {
  type: ProductionEventType;
  quantity: number;
  performedAt: Date;
  /** Declaration time, i.e. when the name and role snapshots were taken. */
  createdAt: Date;
  createdById: string | null;
  createdByName: string | null;
  createdByRole: UserRole | null;
  order: ProductionOrderRef;
}

export type SummaryAggregates = Pick<
  ProductionSummary,
  'totals' | 'consumption' | 'byDay' | 'byCase' | 'byAuthor'
>;

/** A human name order (accents folded), nulls last. */
function compareName(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b, 'fr', { sensitivity: 'base' }) || compareText(a, b);
}

function compareNullableText(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compareText(a, b);
}

function addRow(acts: ActTotals, row: SummaryCountedRow): void {
  acts[row.type].entries += 1;
  acts[row.type].quantity += row.quantity;
}

/**
 * One author per account; rows of a DELETED account (createdById null by
 * SetNull) keep their name and role snapshots apart, so two former
 * technicians never merge into one line.
 */
function authorKey(row: SummaryCountedRow): string {
  return row.createdById !== null
    ? `id:${row.createdById}`
    : `gone:${row.createdByRole ?? ''}:${row.createdByName ?? ''}`;
}

/** A snapshot value and when it was taken (createdAt, ms). */
interface Snapshot<V extends string> {
  value: V | null;
  at: number;
}

const NO_SNAPSHOT: Snapshot<never> = { value: null, at: -Infinity };

/**
 * The snapshot taken last wins, so a renamed technician shows under her
 * current name. A null never replaces a value, and equal instants fall
 * back to text order: the result never depends on the row order.
 */
function laterSnapshot<V extends string>(
  current: Snapshot<V>,
  value: V | null,
  at: number,
): Snapshot<V> {
  if (value === null) return current;
  if (
    current.value === null ||
    at > current.at ||
    (at === current.at && compareText(value, current.value) > 0)
  ) {
    return { value, at };
  }
  return current;
}

interface AuthorBucket {
  userId: string | null;
  name: Snapshot<string>;
  role: Snapshot<UserRole>;
  acts: ActTotals;
}

export function summarizeCountedRows(
  rows: readonly SummaryCountedRow[],
): SummaryAggregates {
  const clock = new BusinessClock();
  const totals = emptyActTotals();
  const days = new Map<string, ActTotals>();
  const cases = new Map<string, ProductionCaseTotals>();
  const authors = new Map<string, AuthorBucket>();

  for (const row of rows) {
    addRow(totals, row);

    const day = clock.dayOf(row.performedAt);
    let dayActs = days.get(day);
    if (!dayActs) {
      dayActs = emptyActTotals();
      days.set(day, dayActs);
    }
    addRow(dayActs, row);

    let caseTotals = cases.get(row.order.orderId);
    if (!caseTotals) {
      caseTotals = { ...row.order, acts: emptyActTotals() };
      cases.set(row.order.orderId, caseTotals);
    }
    addRow(caseTotals.acts, row);

    const key = authorKey(row);
    let author = authors.get(key);
    if (!author) {
      author = {
        userId: row.createdById,
        name: NO_SNAPSHOT,
        role: NO_SNAPSHOT,
        acts: emptyActTotals(),
      };
      authors.set(key, author);
    }
    // A deleted account's line has one snapshot (it is in the key); a live
    // account's takes the latest.
    const at = row.createdAt.getTime();
    author.name = laterSnapshot(author.name, row.createdByName, at);
    author.role = laterSnapshot(author.role, row.createdByRole, at);
    addRow(author.acts, row);
  }

  const byDay: ProductionDayTotals[] = [...days.entries()]
    .sort(([a], [b]) => compareText(a, b))
    .map(([day, acts]) => ({ day, acts }));
  const byCase = [...cases.values()].sort(
    (a, b) =>
      compareText(a.orderCode, b.orderCode) ||
      compareText(a.orderId, b.orderId),
  );
  const byAuthor = [...authors.values()]
    .map(
      (author): ProductionAuthorTotals => ({
        userId: author.userId,
        name: author.name.value,
        role: author.role.value,
        acts: author.acts,
      }),
    )
    .sort(
      (a, b) =>
        compareName(a.name, b.name) ||
        compareNullableText(a.userId, b.userId) ||
        compareNullableText(a.role, b.role),
    );

  return {
    totals,
    // Theoretical consumption: one plate per thermoformed aligner, one
    // model per print (Σ quantity, which may differ from the step count).
    consumption: {
      plates: totals.aligner_thermoformed.quantity,
      models: totals.model_printed.quantity,
    },
    byDay,
    byCase,
    byAuthor,
  };
}
