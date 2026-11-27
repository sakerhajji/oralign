import { ARCHES, choiceOf } from '@/lib/production/arches';
import type { Translate } from '@/lib/production/errors';
import { FUTURE_SKEW_MS } from '@/lib/production/limits';
import { OrderStatus, UserRole } from '@/lib/types';
import {
  type ArchPair,
  type PlannedTotals,
  type ProductionArch,
  type ProductionArchChoice,
  type ProductionEventType,
  type ProductionEventView,
  type ProductionOrderSummary,
} from '@/lib/types/production';
import { businessToday, formatBusinessTime } from '@/lib/utils/business-day';

/**
 * Pure helpers of the technician screens (queue, case sheet, form, my
 * day). No money helper is ever imported here or by a production screen.
 */

// Shared with the admin desk (lib/production): limits, arches, error lines.
export {
  MAX_QUANTITY,
  MAX_STEP,
  MIN_STEP,
  NOTE_MAX,
  REASON_MAX,
  REASON_MIN,
  RECIPIENT_NAME_MAX,
} from '@/lib/production/limits';
export { ARCHES, archesOf, choiceOf } from '@/lib/production/arches';
export { productionErrorText, type Translate } from '@/lib/production/errors';
export { warningsOf } from '@/lib/production/warnings';

export const ACT_COUNTER: Record<ProductionEventType, 'printed' | 'thermoformed' | 'cut' | 'delivered'> = {
  model_printed: 'printed',
  aligner_thermoformed: 'thermoformed',
  aligner_cut: 'cut',
  aligner_delivered: 'delivered',
};

// ─── Roles ──────────────────────────────────────────────────────────

export function isTechnicianRole(role: UserRole | string | null | undefined): boolean {
  return role === UserRole.TECHNICIAN;
}

/** An admin or a super admin: the production screens' wider rules (the manual unlock). */
export function isAdminRole(role: UserRole | string | null | undefined): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

/** Who may open the production screens (super admins pass like admins). */
export function isProductionRole(role: UserRole | string | null | undefined): boolean {
  return (
    role === UserRole.TECHNICIAN || role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN
  );
}

// ─── Status ─────────────────────────────────────────────────────────

export type ProductionStatusKey =
  | 'to_start'
  | 'in_progress'
  | 'ready_to_ship'
  | 'shipped'
  | 'delivery_complete'
  | 'finished'
  | 'closed';

const CLOSED_STATUSES: ReadonlySet<string> = new Set([
  OrderStatus.DRAFT,
  OrderStatus.CANCELED,
  OrderStatus.CANCELLED,
  OrderStatus.REJECTED,
]);

/**
 * The lab's reading of a case. The raw status of an installment case can
 * be a payment phase; the lab never sees those names, only whether work
 * has started.
 */
export function productionStatusOf(
  item: Pick<ProductionOrderSummary, 'status' | 'deliveryComplete' | 'counters'>,
): ProductionStatusKey {
  if (CLOSED_STATUSES.has(item.status)) return 'closed';
  if (item.status === OrderStatus.FINISHED) return 'finished';
  if (item.deliveryComplete) return 'delivery_complete';
  if (item.status === OrderStatus.SHIPPED) return 'shipped';
  if (item.status === OrderStatus.READY_TO_SHIP) return 'ready_to_ship';
  const started = (['upper', 'lower'] as const).some((arch) =>
    Object.values(item.counters[arch]).some((count) => count > 0),
  );
  return started || item.status === OrderStatus.FABRICATION ? 'in_progress' : 'to_start';
}

export const STATUS_TONE: Record<ProductionStatusKey, string> = {
  to_start: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  in_progress: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200',
  ready_to_ship: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200',
  shipped: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  delivery_complete: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  finished: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  closed: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
};

// ─── Arches and steps ───────────────────────────────────────────────

/** "étapes 7 à 12" / "étape 7". */
export function stepsText(t: Translate, from: number, to: number): string {
  return from === to
    ? t('production.history.step', { step: from })
    : t('production.history.steps', { from, to });
}

/** "Étapes 7 à 12" / "Étape 7" (a range chip). */
export function rangeText(t: Translate, from: number, to: number): string {
  return from === to
    ? t('production.sheet.rangeOne', { step: from })
    : t('production.sheet.range', { from, to });
}

/** The smallest known planned total of these arches (null when none is known). */
export function plannedTotalFor(
  planned: PlannedTotals,
  arches: readonly ProductionArch[],
): number | null {
  const totals = arches
    .map((arch) => planned[arch]?.total ?? null)
    .filter((total): total is number => total !== null);
  return totals.length ? Math.min(...totals) : null;
}

/**
 * Where "De" starts for these arches: the lowest first uncovered step, so
 * "les deux" never skips the arch that is behind. null when every
 * planned step of every chosen arch is covered (or the arch is untreated).
 */
export function nextStepFor(
  next: ArchPair<number | null>,
  arches: readonly ProductionArch[],
): number | null {
  const steps = arches
    .map((arch) => next[arch])
    .filter((step): step is number => step !== null);
  return steps.length ? Math.min(...steps) : null;
}

// The form's default "À" and the locked parts of a range read the
// release block: release-format.ts (releasedStepTo, lockedParts).

// ─── Declarations ───────────────────────────────────────────────────

/** The rows of one declaration (one per arch), in the list's order. */
export interface DeclarationGroup<E extends ProductionEventView = ProductionEventView> {
  declarationId: string;
  /** The first row: type, steps, quantity, dates, note and recipient are shared. */
  lead: E;
  rows: E[];
}

/**
 * Group the rows of each declaration. The server sorts a declaration's
 * rows next to each other (same instants, arch then id), so grouping by
 * first appearance keeps the list's order.
 */
export function groupDeclarations<E extends ProductionEventView>(
  events: readonly E[],
): DeclarationGroup<E>[] {
  const groups = new Map<string, DeclarationGroup<E>>();
  for (const event of events) {
    const group = groups.get(event.declarationId);
    if (group) group.rows.push(event);
    else groups.set(event.declarationId, { declarationId: event.declarationId, lead: event, rows: [event] });
  }
  return [...groups.values()];
}

/** The arch choice a declaration's rows cover ("Sup. + Inf." for two). */
export function groupArchChoice(rows: readonly ProductionEventView[]): ProductionArchChoice {
  return choiceOf(ARCHES.filter((arch) => rows.some((row) => row.arch === arch)));
}

// ─── Tunis wall clock ───────────────────────────────────────────────

/** Today's Tunis day and 'HH:mm' (the form's "Maintenant"). */
export function tunisNow(now: Date = new Date()): { day: string; time: string } {
  return { day: businessToday(now), time: formatBusinessTime(now.toISOString(), 'fr') };
}

/** Whether a Tunis day + time is later than the server will accept. */
export function isInFuture(day: string, time: string, now: Date = new Date()): boolean {
  const limit = tunisNow(new Date(now.getTime() + FUTURE_SKEW_MS));
  return `${day}T${time}` > `${limit.day}T${limit.time}`;
}
