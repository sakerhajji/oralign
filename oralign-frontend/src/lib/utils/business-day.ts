import type { Lang } from '@/lib/i18n/dict';

/**
 * The lab's business days: Africa/Tunis calendar days as 'YYYY-MM-DD'.
 *
 * Mirrors the backend's `common/time/business-day.ts`: a day's takings run
 * from 00:00 to 24:00 Tunis time, whatever zone the browser is in, so the
 * day a payment is listed under is the day it is counted in. The zone's
 * offset is always read from Intl, never hardcoded.
 *
 * Day arithmetic works on the 'YYYY-MM-DD' strings through UTC dates, so
 * no daylight-saving change can shift a day.
 */
export const BUSINESS_TIME_ZONE = 'Africa/Tunis';

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const dayPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toDay(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** 'YYYY-MM-DD' → the UTC midnight of that calendar day. */
function utcDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

/** The business day an instant falls on. */
export function businessDayOf(instant: Date): string {
  const parts = dayPartsFormatter.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Today's business day. */
export function businessToday(now: Date = new Date()): string {
  return businessDayOf(now);
}

/** A strict 'YYYY-MM-DD' that exists on the calendar (no 2026-02-30). */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) return false;
  return toDay(utcDate(value)) === value;
}

/** The day `amount` days after (or before, when negative) `day`. */
export function addDays(day: string, amount: number): string {
  const date = utcDate(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return toDay(date);
}

/** The first day of `day`'s month. */
export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** The first and last days of the month before `day`'s. */
export function previousMonth(day: string): { from: string; to: string } {
  const date = utcDate(day);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return {
    from: toDay(new Date(Date.UTC(year, month - 1, 1))),
    to: toDay(new Date(Date.UTC(year, month, 0))),
  };
}

// ─── Wording ────────────────────────────────────────────────────────

const LOCALE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-US' };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(
  lang: Lang,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${lang}|${timeZone}|${JSON.stringify(options)}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(LOCALE[lang], { ...options, timeZone });
    formatters.set(key, cached);
  }
  return cached;
}

/**
 * An instant (ISO string) as its business day, in the dashboard's day
 * format: "6 nov. 2026" / "Nov 6, 2026".
 */
export function formatBusinessDay(iso: string, lang: Lang): string {
  return formatter(lang, BUSINESS_TIME_ZONE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

/** An instant's Tunis wall-clock time, 24-hour: "14:32". */
export function formatBusinessTime(iso: string, lang: Lang): string {
  return formatter(lang, BUSINESS_TIME_ZONE, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/**
 * An instant's business day without the year when it falls in `today`'s
 * year: "6 nov." / "Nov 6"; "6 nov. 2025" / "Nov 6, 2025" otherwise. For
 * lines where room is short (a phone row, a note under a date).
 */
export function formatBusinessDayShort(iso: string, lang: Lang, today: string): string {
  if (businessDayOf(new Date(iso)).slice(0, 4) !== today.slice(0, 4)) {
    return formatBusinessDay(iso, lang);
  }
  return formatter(lang, BUSINESS_TIME_ZONE, { day: 'numeric', month: 'short' }).format(
    new Date(iso),
  );
}

export type CalendarDayStyle =
  /** "jeu. 6 nov." / "Thu, Nov 6" */
  | 'weekday'
  /** "6 nov. 2026" / "Nov 6, 2026" */
  | 'full'
  /** "6 nov." / "Nov 6" */
  | 'dayMonth'
  /** "6" */
  | 'day';

const DAY_STYLES: Record<CalendarDayStyle, Intl.DateTimeFormatOptions> = {
  weekday: { weekday: 'short', day: 'numeric', month: 'short' },
  full: { day: 'numeric', month: 'short', year: 'numeric' },
  dayMonth: { day: 'numeric', month: 'short' },
  day: { day: 'numeric' },
};

/**
 * A business day ('YYYY-MM-DD') in words, for sentences. French writes
 * the first of the month "1er" ("du 1er au 6 nov.").
 */
export function formatCalendarDay(
  day: string,
  lang: Lang,
  style: CalendarDayStyle,
): string {
  const text = formatter(lang, 'UTC', DAY_STYLES[style]).format(utcDate(day));
  if (lang === 'fr' && day.endsWith('-01')) {
    return text.replace(/(^|\s)1(?=\s|$)/, (_match, lead: string) => `${lead}1er`);
  }
  return text;
}
