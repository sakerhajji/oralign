import { BadRequestException } from '../../common/exceptions/app.exception';
import {
  businessDayRange,
  shiftCalendarDay,
} from '../../common/time/business-day';
import { MAX_REPORT_DAYS } from '../production.constants';
import { PRODUCTION_ERROR } from '../production.contract';

/** UTC bounds of a period of Tunis days: [gte, lt). */
export interface InstantRange {
  gte: Date;
  lt: Date;
}

/** An admin report period, validated once, before any query. */
export interface ReportPeriod {
  from: string;
  to: string;
  /** 00:00 Tunis on `from` up to (excluded) 00:00 Tunis the day after `to`. */
  range: InstantRange;
}

/**
 * The period of the summary, anomalies and CSV (CONTRACT §2.2): Tunis days,
 * both included. 400 INVALID_DATE (a malformed day), 400 INVALID_DATE_RANGE
 * (from > to, or longer than MAX_REPORT_DAYS: the reports aggregate in
 * memory, so the span is what bounds their cost).
 */
export function resolveReportPeriod(from: string, to: string): ReportPeriod {
  const { gte, lt } = businessDayRange(from, to);
  if (!gte || !lt) {
    // Unreachable with both days given; keeps the type honest.
    throw new BadRequestException(
      'A report period needs both days.',
      PRODUCTION_ERROR.INVALID_DATE_RANGE,
    );
  }
  if (shiftCalendarDay(from, MAX_REPORT_DAYS - 1) < to) {
    throw new BadRequestException(
      `A report covers at most ${MAX_REPORT_DAYS} days (${from} to ${to} is longer).`,
      PRODUCTION_ERROR.INVALID_DATE_RANGE,
    );
  }
  return { from, to, range: { gte, lt } };
}

/** `instant` falls in [gte, lt). */
export function isInRange(instant: Date | null, range: InstantRange): boolean {
  return (
    instant !== null &&
    instant.getTime() >= range.gte.getTime() &&
    instant.getTime() < range.lt.getTime()
  );
}
