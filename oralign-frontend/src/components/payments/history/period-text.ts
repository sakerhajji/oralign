import type { Lang } from '@/lib/i18n/dict';
import { formatCalendarDay } from '@/lib/utils/business-day';
import type { DayRange, Period } from './history-filters';

type Translate = (path: string, vars?: Record<string, string | number>) => string;

/** One day: "jeu. 6 nov." this year, "jeu. 6 nov. 2025" another year. */
function dayText(day: string, today: string, lang: Lang): string {
  const text = formatCalendarDay(day, lang, 'weekday');
  return day.slice(0, 4) === today.slice(0, 4) ? text : `${text} ${day.slice(0, 4)}`;
}

/**
 * The shortest unambiguous range: "du 1er au 6 nov. 2026" /
 * "Nov 1 – 6, 2026", "du 28 oct. au 3 nov. 2026"…
 */
function spanText(from: string, to: string, lang: Lang, t: Translate): string {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const sameMonth = sameYear && from.slice(5, 7) === to.slice(5, 7);
  const start =
    lang === 'fr'
      ? formatCalendarDay(from, lang, sameMonth ? 'day' : sameYear ? 'dayMonth' : 'full')
      : formatCalendarDay(from, lang, sameYear ? 'dayMonth' : 'full');
  const end =
    lang === 'en' && sameMonth
      ? `${formatCalendarDay(to, lang, 'day')}, ${to.slice(0, 4)}`
      : formatCalendarDay(to, lang, 'full');
  return t('paymentsDesk.period.range', { from: start, to: end });
}

/**
 * The days a range covers, in words: "jeu. 6 nov.", "du 1er au 6 nov.
 * 2026", or "toutes les dates, jusqu'au 6 nov. 2026" for every date.
 */
export function rangeText(range: DayRange, today: string, lang: Lang, t: Translate): string {
  const { from, to } = range;
  if (!from && !to) {
    return t('paymentsDesk.period.allUpTo', { date: formatCalendarDay(today, lang, 'full') });
  }
  if (from && to) {
    return from === to ? dayText(from, today, lang) : spanText(from, to, lang, t);
  }
  return dayText((from ?? to) as string, today, lang);
}

/** A period as its preset's name ("7 derniers jours"), or its days when custom. */
export function periodName(
  period: Period,
  range: DayRange,
  today: string,
  lang: Lang,
  t: Translate,
): string {
  return period.key === 'custom'
    ? rangeText(range, today, lang, t)
    : t(`paymentsDesk.period.${period.key}`);
}
