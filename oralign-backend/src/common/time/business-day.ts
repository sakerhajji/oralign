import { BadRequestException } from '../exceptions/app.exception';

/**
 * The lab's calendar. A day's takings, "today" and every date filter are
 * cut in Tunis days, whatever zone the server runs in: the containers run
 * in UTC, where 00:30 in Tunis is still the day before.
 */
export const BUSINESS_TIME_ZONE = 'Africa/Tunis';

/** UTC instants bounding a span of business days, ready for a Prisma DateTime filter. */
export interface BusinessDayRange {
  /** 00:00 business time on the first day. */
  gte?: Date;
  /** 00:00 business time on the day after the last day. */
  lt?: Date;
}

/** A calendar day, month 1-12. The day may overflow: Date.UTC rolls it into the next month. */
interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const businessClock = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

type ClockField = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

/** The business-time wall clock at `instant`, field by field. */
function wallClock(instant: Date): Record<ClockField, number> {
  const clock = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const part of businessClock.formatToParts(instant)) {
    if (part.type in clock) clock[part.type as ClockField] = Number(part.value);
  }
  return clock;
}

/** How far business time runs ahead of UTC at `instant` (ms since the epoch). */
function businessOffsetMs(instant: number): number {
  const clock = wallClock(new Date(instant));
  const wallAsUtc = Date.UTC(
    clock.year,
    clock.month - 1,
    clock.day,
    clock.hour,
    clock.minute,
    clock.second,
  );
  return wallAsUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * UTC instant of the business wall clock `hour:minute` on `day`. A time a
 * daylight-saving jump skips resolves to the same distance past the jump
 * (02:30 on a 02:00 → 03:00 night is 03:30); a time a fall-back repeats
 * resolves to its second occurrence.
 */
function businessWallInstant(
  { year, month, day }: CalendarDay,
  hour = 0,
  minute = 0,
): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  // Read the offset again at the first guess: the two differ only when a
  // daylight-saving change falls between them (Tunisia observed DST in
  // 2005-2008 and could again).
  const guess = wallAsUtc - businessOffsetMs(wallAsUtc);
  return new Date(wallAsUtc - businessOffsetMs(guess));
}

/** UTC instant of 00:00 business time on `day`. */
function businessMidnight(day: CalendarDay): Date {
  return businessWallInstant(day);
}

/** A strict 24 h 'HH:mm' (00:00-23:59). */
const CLOCK_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** The day a strict 'YYYY-MM-DD' names, or null (malformed, or 2026-02-30). */
function toCalendarDay(value: string): CalendarDay | null {
  const match = CALENDAR_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const exists =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return exists ? { year, month, day } : null;
}

function requireCalendarDay(value: string): CalendarDay {
  const day = toCalendarDay(value);
  if (!day) {
    throw new BadRequestException(
      `"${value}" is not a calendar date (expected YYYY-MM-DD).`,
      'INVALID_DATE',
    );
  }
  return day;
}

/** 'YYYY-MM-DD' of `now` on the business calendar. */
export function businessToday(now: Date = new Date()): string {
  const { year, month, day } = wallClock(now);
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

/** A strict 'YYYY-MM-DD' naming a day that exists: 2026-02-30 is refused, not rolled over. */
export function isCalendarDate(value: unknown): value is string {
  return typeof value === 'string' && toCalendarDay(value) !== null;
}

/** 'HH:mm' (24 h) of `instant` on the business wall clock: what a journal, a CSV or an e-mail prints. */
export function businessTimeOf(instant: Date): string {
  const { hour, minute } = wallClock(instant);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * The calendar day `days` after (negative: before) `day`, 'YYYY-MM-DD'.
 * Pure calendar arithmetic, no time zone involved: "yesterday" is
 * shiftCalendarDay(businessToday(), -1). A malformed day is a 400
 * INVALID_DATE.
 */
export function shiftCalendarDay(day: string, days: number): string {
  const { year, month, day: date } = requireCalendarDay(day);
  return new Date(Date.UTC(year, month - 1, date + days))
    .toISOString()
    .slice(0, 10);
}

/** A strict 24 h wall-clock time 'HH:mm': '07:05' yes, '7:05', '24:00' and '07:05:00' no. */
export function isClockTime(value: unknown): value is string {
  return typeof value === 'string' && CLOCK_TIME.test(value);
}

/**
 * The UTC instant a Tunis wall clock names: `day` 'YYYY-MM-DD' at `time`
 * 'HH:mm' (seconds 0). What a form's "date + heure" fields mean, whatever
 * zone the server or the tablet runs in. Reads the offset from the time
 * zone data at that very instant, so a daylight-saving period (Tunisia had
 * one in 2005-2008) is honoured. A malformed or non-existent day is a 400
 * INVALID_DATE, a malformed time a 400 INVALID_TIME.
 */
export function businessInstant(day: string, time: string): Date {
  const calendarDay = requireCalendarDay(day);
  const match = CLOCK_TIME.exec(time);
  if (!match) {
    throw new BadRequestException(
      `"${time}" is not a time of day (expected HH:mm, 00:00-23:59).`,
      'INVALID_TIME',
    );
  }
  return businessWallInstant(calendarDay, Number(match[1]), Number(match[2]));
}

/**
 * The business days `from` to `to`, both included: from 00:00 Tunis on
 * `from` up to (excluded) 00:00 Tunis on the day after `to`. A missing
 * bound leaves that side open. A malformed date is a 400 INVALID_DATE, a
 * period that ends before it starts a 400 INVALID_DATE_RANGE.
 */
export function businessDayRange(
  from?: string | null,
  to?: string | null,
): BusinessDayRange {
  const first = from ? requireCalendarDay(from) : null;
  const last = to ? requireCalendarDay(to) : null;
  if (from && to && from > to) {
    throw new BadRequestException(
      `The period cannot start (${from}) after it ends (${to}).`,
      'INVALID_DATE_RANGE',
    );
  }
  const range: BusinessDayRange = {};
  if (first) range.gte = businessMidnight(first);
  if (last) range.lt = businessMidnight({ ...last, day: last.day + 1 });
  return range;
}
