import type { BatchUnlockSource, QuoteStepBatch } from '@/lib/types/billing';
import type {
  PlannedTotal,
  ProductionArch,
  ProductionArchRelease,
  ProductionReleaseSummary,
  ProductionStepSpan,
} from '@/lib/types/production';

/**
 * Pure readings of the release block (spec §3, backend releaseSummaryOf):
 * which steps the lab may work on, for the queue cards, the case sheet and
 * the declaration form. Type imports only, so `node --test` runs it
 * (release-format.test.mjs). Never any money wording: a locked step is
 * « non débloquée », nothing more.
 */

export type StepSpan = ProductionStepSpan;
type Release = Pick<ProductionReleaseSummary, 'state' | 'arches'>;

const ARCH_ORDER: readonly ProductionArch[] = ['upper', 'lower'];

/** Every planned step is workable (all, or no schedule at all). */
export function everythingReleased(release: Pick<ProductionReleaseSummary, 'state'>): boolean {
  return release.state === 'all' || release.state === 'unscheduled';
}

/** Nothing is workable: « Aucune tranche débloquée ». */
export function nothingReleased(release: Pick<ProductionReleaseSummary, 'state'>): boolean {
  return release.state === 'none';
}

/** "5" or "1→4": digits and an arrow, the same in every language. */
export function spanLabel(span: StepSpan): string {
  return span.from === span.to ? String(span.from) : `${span.from}→${span.to}`;
}

/** How many steps the spans hold (merged spans never overlap). */
export function spanStepCount(spans: readonly StepSpan[]): number {
  return spans.reduce((count, span) => count + Math.max(0, span.to - span.from + 1), 0);
}

/** Sorted, overlapping and adjacent spans merged (1→3 + 4→7 = 1→7). */
export function mergeSpans(spans: readonly StepSpan[]): StepSpan[] {
  const sorted = spans
    .filter((span) => span.to >= span.from)
    .map((span) => ({ from: span.from, to: span.to }))
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: StepSpan[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span.from <= last.to + 1) last.to = Math.max(last.to, span.to);
    else merged.push(span);
  }
  return merged;
}

/** The parts of `target` the spans do not cover, ascending. */
export function uncoveredSpans(target: StepSpan, covered: readonly StepSpan[]): StepSpan[] {
  const gaps: StepSpan[] = [];
  let cursor = target.from;
  for (const span of mergeSpans(covered)) {
    if (span.to < cursor) continue;
    if (span.from > target.to) break;
    if (span.from > cursor) gaps.push({ from: cursor, to: span.from - 1 });
    cursor = Math.max(cursor, span.to + 1);
    if (cursor > target.to) break;
  }
  if (cursor <= target.to) gaps.push({ from: cursor, to: target.to });
  return gaps;
}

/** One line of the release summary: the arches that read the same share it. */
export interface ReleaseLine {
  arches: ProductionArch[];
  total: StepSpan | null;
  provisional: boolean;
  unlocked: StepSpan[];
}

const sameSpans = (a: readonly StepSpan[], b: readonly StepSpan[]) =>
  a.length === b.length && a.every((span, index) => span.from === b[index].from && span.to === b[index].to);

const sameArch = (a: ProductionArchRelease, b: ProductionArchRelease) =>
  a.provisional === b.provisional &&
  (a.total === null ? b.total === null : b.total !== null && sameSpans([a.total], [b.total])) &&
  sameSpans(a.unlocked, b.unlocked);

/**
 * The lines to show, upper first: one when both treated arches read the
 * same (the usual case: one range serves both), else one per arch.
 */
export function releaseLines(release: Pick<ProductionReleaseSummary, 'arches'>): ReleaseLine[] {
  const shown = ARCH_ORDER.flatMap((arch) => {
    const value = release.arches[arch];
    return value ? [{ arch, value }] : [];
  });
  const line = (arches: ProductionArch[], value: ProductionArchRelease): ReleaseLine => ({
    arches,
    total: value.total,
    provisional: value.provisional,
    unlocked: value.unlocked,
  });
  if (shown.length === 2 && sameArch(shown[0].value, shown[1].value)) {
    return [line(['upper', 'lower'], shown[0].value)];
  }
  return shown.map(({ arch, value }) => line([arch], value));
}

/**
 * What an act counter of one arch is read against: the released steps
 * while the plan is not wholly released (« 3/4 », the plan total as a
 * secondary « sur 7 »); null = the planned total as before (everything
 * released, an untreated arch, or no release block on this row).
 */
export function workableStepCount(release: Release | null | undefined, arch: ProductionArch): number | null {
  if (!release || everythingReleased(release)) return null;
  const value = release.arches[arch];
  return value ? spanStepCount(value.unlocked) : null;
}

/** "3/4": done over the workable steps. */
export function workableCounterText(done: number, workable: number): string {
  return `${done}/${workable}`;
}

/** "≈7" for a provisional total, "7" otherwise; null when unknown. */
export function plannedTotalLabel(planned: Pick<PlannedTotal, 'total' | 'provisional'> | null): string | null {
  if (!planned || planned.total === null) return null;
  return `${planned.provisional ? '≈' : ''}${planned.total}`;
}

/**
 * The parts of [from, to] that are not released on these arches, merged;
 * [] when everything is released. Steps above an APPROVED total are left
 * out: they are not locked, they do not exist (the server's 400).
 */
export function lockedParts(
  from: number,
  to: number,
  release: Release,
  arches: readonly ProductionArch[],
): StepSpan[] {
  if (everythingReleased(release) || to < from) return [];
  const gaps = arches.flatMap((arch) => {
    const value = release.arches[arch];
    if (!value) return [];
    const end = value.total && !value.provisional ? Math.min(to, value.total.to) : to;
    return end >= from ? uncoveredSpans({ from, to: end }, value.unlocked) : [];
  });
  return mergeSpans(gaps);
}

/**
 * The form's default "À" for a "De" (`from`): the end of the released
 * span that holds it on every chosen arch (the lowest end when the arches
 * differ), so the default never runs into a locked step; with everything
 * released, the planned total as before. A "De" in no released span
 * stays alone: the form then says why it cannot be saved.
 */
export function releasedStepTo(
  from: number,
  release: Release,
  arches: readonly ProductionArch[],
  plannedTotal: number | null,
): number {
  if (everythingReleased(release)) {
    return plannedTotal !== null && plannedTotal >= from ? plannedTotal : from;
  }
  const ends = arches.flatMap((arch) => {
    const value = release.arches[arch];
    if (!value) return [];
    const holding = value.unlocked.find((span) => span.from <= from && from <= span.to);
    return [holding ? holding.to : null];
  });
  if (ends.length === 0 || ends.some((end) => end === null)) return from;
  return Math.max(from, Math.min(...(ends as number[])));
}

// ─── The admin's manual unlock (« Débloquer la tranche ») ───────────

/** A batch as the unlock rules read it ('locked' | 'unlocked' | 'delivered'). */
type BatchStatusValue = `${QuoteStepBatch['status']}`;

/**
 * The unlock's 200 answered for a batch something else released first
 * (its payment, a quote edit, a colleague's unlock), not for this one:
 * the dialog then says « déjà débloquée » instead of claiming the unlock.
 */
export function unlockedByAnotherAct(
  row: { unlockSource?: BatchUnlockSource | null; unlockedById?: string | null },
  myUserId: string | null | undefined,
): boolean {
  if (row.unlockSource && row.unlockSource !== 'manual') return true;
  return !!row.unlockedById && !!myUserId && row.unlockedById !== myUserId;
}

/**
 * Admins only: whether the quote panel offers « Débloquer la tranche » on
 * a batch. A locked batch of a limited pack, always; on an unlimited-step
 * pack, whose batches are payment placeholders (one released batch
 * releases every step), only while none is released yet: afterwards a
 * manual unlock would give the lab nothing more.
 */
export function canOfferBatchUnlock(
  quote: { isUnlimitedSteps?: boolean | null },
  batch: { status: BatchStatusValue },
  batches: readonly { status: BatchStatusValue }[],
): boolean {
  if (batch.status !== 'locked') return false;
  if (!quote.isUnlimitedSteps) return true;
  return batches.every((row) => row.status === 'locked');
}
