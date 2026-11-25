/**
 * Step-range arithmetic of the production module. Pure, no Prisma.
 * A range is inclusive on both ends: { from: 3, to: 5 } is steps 3, 4, 5.
 * "Covered" always means the UNION of ranges: a reprint of steps already
 * printed never inflates a counter.
 */
export interface StepRange {
  from: number;
  to: number;
}

/** Sorted, with overlapping AND adjacent ranges merged (1-3 + 4-7 = 1-7). Empty ranges dropped. */
export function mergeStepRanges(ranges: readonly StepRange[]): StepRange[] {
  const sorted = ranges
    .filter((range) => range.to >= range.from)
    .map((range) => ({ from: range.from, to: range.to }))
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: StepRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to + 1) {
      last.to = Math.max(last.to, range.to);
    } else {
      merged.push(range);
    }
  }
  return merged;
}

/** How many distinct steps the ranges cover. */
export function countCoveredSteps(ranges: readonly StepRange[]): number {
  return mergeStepRanges(ranges).reduce(
    (count, range) => count + range.to - range.from + 1,
    0,
  );
}

/**
 * The lowest step >= `start` the ranges do not cover; null when it would
 * exceed a known `limit` (everything up to the planned total is covered).
 */
export function firstUncoveredStep(
  ranges: readonly StepRange[],
  limit: number | null,
  start = 1,
): number | null {
  let next = start;
  for (const range of mergeStepRanges(ranges)) {
    if (range.to < next) continue;
    if (range.from > next) break;
    next = range.to + 1;
  }
  return limit !== null && next > limit ? null : next;
}

/** The parts of `target` the ranges do NOT cover, ascending. */
export function uncoveredStepRanges(
  target: StepRange,
  covered: readonly StepRange[],
): StepRange[] {
  const gaps: StepRange[] = [];
  let cursor = target.from;
  for (const range of mergeStepRanges(covered)) {
    if (range.to < cursor) continue;
    if (range.from > target.to) break;
    if (range.from > cursor) gaps.push({ from: cursor, to: range.from - 1 });
    cursor = Math.max(cursor, range.to + 1);
    if (cursor > target.to) break;
  }
  if (cursor <= target.to) gaps.push({ from: cursor, to: target.to });
  return gaps;
}

/** The parts of `target` the ranges DO cover, ascending. */
export function coveredStepRanges(
  target: StepRange,
  covered: readonly StepRange[],
): StepRange[] {
  const overlaps: StepRange[] = [];
  for (const range of mergeStepRanges(covered)) {
    const from = Math.max(range.from, target.from);
    const to = Math.min(range.to, target.to);
    if (from <= to) overlaps.push({ from, to });
  }
  return overlaps;
}
