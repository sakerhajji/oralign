import type { Lang } from '@/lib/i18n/dict';
import type { InvoicePeriodParams } from '@/lib/types';
import {
  formatCalendarDay,
  isCalendarDate,
  monthStart,
  previousMonth,
} from '@/lib/utils/business-day';

/**
 * The invoices desk's period, shared by the récapitulatif and the list,
 * in one pure module. Every day is an Africa/Tunis calendar day
 * ('YYYY-MM-DD'), both bounds included, so the page counts exactly what
 * the backend counts.
 *
 * A preset is kept as its key ("thisMonth"), never as dates: resolved
 * against today's Tunis day each time, a link to "this month" still means
 * this month next month.
 */

export type PeriodPreset =
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'thisYear'
  | 'all'
  | 'custom';

/** The order of the segmented control. */
export const PERIOD_PRESETS: readonly PeriodPreset[] = [
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'lastQuarter',
  'thisYear',
  'all',
  'custom',
];

/** `from` / `to` only matter for `custom`. */
export interface InvoicePeriod {
  key: PeriodPreset;
  from: string;
  to: string;
}

export const DEFAULT_PERIOD: InvoicePeriod = { key: 'thisMonth', from: '', to: '' };

/** Inclusive Tunis days; null = open on that side. */
export interface DayRange {
  from: string | null;
  to: string | null;
}

/**
 * The earliest day a custom range accepts. Older than any invoice, and it
 * keeps a half-typed year (0002, 0020, 0202…) from reaching the API.
 */
export const EARLIEST_DAY = '2020-01-01';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** The first day of month `month` (1-12, may overflow) of `year`. */
function firstDay(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month - 1, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-01`;
}

/** The last day of month `month` (1-12, may overflow) of `year`. */
function lastDay(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month, 0));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** The quarter holding `day`, `shift` quarters away (-1 = the previous one). */
function quarter(day: string, shift: number): { from: string; to: string } {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const first = Math.floor((month - 1) / 3) * 3 + 1 + shift * 3;
  return { from: firstDay(year, first), to: lastDay(year, first + 2) };
}

/** A custom range never runs backwards. */
function ordered(from: string, to: string): { from: string; to: string } {
  return from && to && from > to ? { from: to, to: from } : { from, to };
}

/** The days a period covers, `today` being today's Tunis day. */
export function periodRange(period: InvoicePeriod, today: string): DayRange {
  const year = Number(today.slice(0, 4));
  switch (period.key) {
    case 'thisMonth':
      // The whole calendar month: what the monthly TVA return covers.
      return { from: monthStart(today), to: lastDay(year, Number(today.slice(5, 7))) };
    case 'lastMonth':
      return previousMonth(today);
    case 'thisQuarter':
      return quarter(today, 0);
    case 'lastQuarter':
      return quarter(today, -1);
    case 'thisYear':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case 'custom': {
      const { from, to } = ordered(period.from, period.to);
      return { from: from || null, to: to || null };
    }
    default:
      return { from: null, to: null };
  }
}

/** The API's query for a range (an open side is left out). */
export function toPeriodParams(range: DayRange): InvoicePeriodParams {
  const params: InvoicePeriodParams = {};
  if (range.from) params.issuedFrom = range.from;
  if (range.to) params.issuedTo = range.to;
  return params;
}

export type CustomRangeError = 'missing' | 'invalid' | 'tooEarly' | 'endBeforeStart';

/** Why a typed custom range cannot apply yet, or null when it can. */
export function customRangeError(from: string, to: string): CustomRangeError | null {
  if (!from || !to) return 'missing';
  // String order is day order for 'YYYY-MM-DD': a half-typed year
  // ("0202-11-01") reads as too early, not as a broken date.
  if (from < EARLIEST_DAY || to < EARLIEST_DAY) return 'tooEarly';
  if (!isCalendarDate(from) || !isCalendarDate(to)) return 'invalid';
  if (to < from) return 'endBeforeStart';
  return null;
}

export function samePeriod(a: InvoicePeriod, b: InvoicePeriod): boolean {
  return a.key === b.key && (a.key !== 'custom' || (a.from === b.from && a.to === b.to));
}

// ─── Words ──────────────────────────────────────────────────────────

type Translate = (path: string, vars?: Record<string, string | number>) => string;

/**
 * The range as a sentence: "Du 1er nov. 2026 au 30 nov. 2026",
 * "Le 6 nov. 2026", "Toutes les dates".
 */
export function rangeSentence(range: DayRange, lang: Lang, t: Translate): string {
  const day = (value: string) => formatCalendarDay(value, lang, 'full');
  const { from, to } = range;
  if (from && to) {
    return from === to
      ? t('invoiceDesk.accounting.period.oneDay', { day: day(from) })
      : t('invoiceDesk.accounting.period.span', { from: day(from), to: day(to) });
  }
  if (from) return t('invoiceDesk.accounting.period.since', { day: day(from) });
  if (to) return t('invoiceDesk.accounting.period.until', { day: day(to) });
  return t('invoiceDesk.accounting.period.allDates');
}

const LOCALE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB' };

/** 'YYYY-MM' → "Novembre 2026" / "November 2026". */
export function monthLabel(month: string, lang: Lang): string {
  const [year, index] = month.split('-').map(Number);
  if (!year || !index) return month;
  const text = new Intl.DateTimeFormat(LOCALE[lang], {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, index - 1, 1)));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A TVA rate: "19 %" / "19%". */
export function rateLabel(rate: number, lang: Lang): string {
  const value = Number(rate).toLocaleString(LOCALE[lang], { maximumFractionDigits: 2 });
  return lang === 'fr' ? `${value} %` : `${value}%`;
}

// ─── URL ────────────────────────────────────────────────────────────

export type DeskView = 'recap' | 'list';
export const DESK_VIEWS: readonly DeskView[] = ['recap', 'list'];
export const DEFAULT_VIEW: DeskView = 'recap';

export interface DeskUrlState {
  view: DeskView;
  period: InvoicePeriod;
}

interface SearchParamsLike {
  get(name: string): string | null;
}

function pick<V extends string>(value: string | null, allowed: readonly V[], fallback: V): V {
  return value !== null && (allowed as readonly string[]).includes(value)
    ? (value as V)
    : fallback;
}

/** `?view=list&period=custom&from=…&to=…` → the desk state; anything odd falls back. */
export function readDeskUrl(params: SearchParamsLike): DeskUrlState {
  const view = pick(params.get('view'), DESK_VIEWS, DEFAULT_VIEW);
  const key = pick(params.get('period'), PERIOD_PRESETS, DEFAULT_PERIOD.key);
  if (key !== 'custom') return { view, period: { key, from: '', to: '' } };
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  return {
    view,
    period: customRangeError(from, to) === null ? { key, from, to } : DEFAULT_PERIOD,
  };
}

const URL_KEYS = ['view', 'period', 'from', 'to'];

/** The query string for `state`, keeping every foreign param of `current`. */
export function deskUrlSearch(state: DeskUrlState, current: string): string {
  const params = new URLSearchParams(current);
  for (const key of URL_KEYS) params.delete(key);
  if (state.view !== DEFAULT_VIEW) params.set('view', state.view);
  if (state.period.key !== DEFAULT_PERIOD.key) params.set('period', state.period.key);
  if (state.period.key === 'custom') {
    params.set('from', state.period.from);
    params.set('to', state.period.to);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}
