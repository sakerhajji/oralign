import { format } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';
import type { Lang } from '@/lib/i18n/dict';

/**
 * Calendar dates ('YYYY-MM-DD', no time, no zone) — e.g. the day aligners
 * were handed over. Parsing them with `new Date('2026-09-07')` yields UTC
 * midnight, which renders as the PREVIOUS day west of UTC; these helpers
 * keep the day as the user typed it.
 */

/** 'YYYY-MM-DD' → a local Date on that calendar day. */
export function parseCalendarDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Today's LOCAL calendar date as 'YYYY-MM-DD'. */
export function todayCalendarDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The orders pages' day format: "7 sept. 2026" / "Sep 7, 2026". */
function formatDay(date: Date, lang: Lang): string {
  return format(date, lang === 'fr' ? 'd MMM yyyy' : 'MMM d, yyyy', {
    locale: lang === 'fr' ? frLocale : undefined,
  });
}

export function formatCalendarDate(value: string, lang: Lang): string {
  return formatDay(parseCalendarDate(value), lang);
}

/** A timestamp (ISO string) shown as its local day, same format. */
export function formatTimestampDay(value: string, lang: Lang): string {
  return formatDay(new Date(value), lang);
}
