import { isCalendarDate } from './business-day';

/**
 * A range of calendar days ("Du … Au …", both included) as list filters
 * use it: the rules a range must meet before it is applied, and the days a
 * URL may carry. Pure, so the URL readers and the range form share them.
 */

/**
 * The earliest day a range accepts. Older than anything the platform
 * holds, and it keeps a half-typed year (0002, 0020, 0202…) from ever
 * reaching the API, which refuses years before 100.
 */
export const EARLIEST_DAY = '2020-01-01';

export type DayRangeError = 'missingFrom' | 'missingTo' | 'invalid' | 'tooEarly' | 'endBeforeStart';

/** Why a typed range cannot be applied yet, or null when it can. */
export function dayRangeError(from: string, to: string): DayRangeError | null {
  if (!from) return 'missingFrom';
  if (!to) return 'missingTo';
  if (!isCalendarDate(from) || !isCalendarDate(to)) return 'invalid';
  if (from < EARLIEST_DAY || to < EARLIEST_DAY) return 'tooEarly';
  if (from > to) return 'endBeforeStart';
  return null;
}

/** A day a URL may set: a real calendar day from EARLIEST_DAY on, else ''. */
export function usableDay(value: string | null | undefined): string {
  return value && isCalendarDate(value) && value >= EARLIEST_DAY ? value : '';
}

/** The two bounds in order (a shared link may carry them reversed). */
export function orderedDays(from: string, to: string): { from: string; to: string } {
  return from && to && from > to ? { from: to, to: from } : { from, to };
}
