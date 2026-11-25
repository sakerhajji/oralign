import type { Prisma } from '@prisma/client';
import { businessDayRange, businessToday } from '../../common/time/business-day';

const BARE_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The issueDate filter of an invoice period. A bare 'YYYY-MM-DD' is a
 * Tunis business day, both bounds included (00:00 Tunis on `from` up to
 * 00:00 Tunis the day after `to`), whatever zone the server runs in: the
 * list, the totals, the accounting summary, the CSV and the ZIP all mean
 * the same days. A full ISO instant (older callers) is taken as the exact
 * instant it names. A malformed day, or a period ending before it starts,
 * is a 400 (INVALID_DATE / INVALID_DATE_RANGE). No bound: undefined.
 */
export function issueDateFilter(
  from?: string | null,
  to?: string | null,
): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const fromDay = from && BARE_DAY.test(from) ? from : null;
  const toDay = to && BARE_DAY.test(to) ? to : null;
  // Validates the days (and their order when both are days) before any query.
  const days = businessDayRange(fromDay, toDay);
  const filter: Prisma.DateTimeFilter = {};
  if (from) filter.gte = fromDay ? days.gte : new Date(from);
  if (to) {
    if (toDay) filter.lt = days.lt;
    else filter.lte = new Date(to);
  }
  return filter;
}

/** The Tunis calendar day of an instant, 'YYYY-MM-DD'. */
export function businessDayOf(instant: Date): string {
  return businessToday(instant);
}

/** The Tunis calendar month of an instant, 'YYYY-MM'. */
export function businessMonthOf(instant: Date): string {
  return businessToday(instant).slice(0, 7);
}
