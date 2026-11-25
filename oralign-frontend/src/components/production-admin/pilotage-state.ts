import { MAX_REPORT_DAYS, PAGE_SIZE, SEARCH_MAX_LENGTH } from '@/lib/production/limits';
import {
  PRODUCTION_ANOMALY_KINDS,
  PRODUCTION_NOTICE_STATUSES,
  type ProductionAnomalyKind,
  type ProductionNoticeStatus,
  type ProductionPeriodParams,
  type ProductionProgressState,
} from '@/lib/types/production';
import { isCalendarDate, monthStart, previousMonth } from '@/lib/utils/business-day';
import {
  EARLIEST_DAY,
  dayRangeError,
  orderedDays,
  usableDay,
  type DayRangeError,
} from '@/lib/utils/day-range';

/**
 * The production desk's state in one pure module: its five views, the
 * journal's day, the period the recap and the discrepancies share, and
 * each list's filters, with how they read from and write to the URL.
 * Every day is an Africa/Tunis calendar day ('YYYY-MM-DD'), both bounds
 * included, so the page asks for exactly what the backend counts.
 */

export const PILOTAGE_VIEWS = ['journal', 'recap', 'avancement', 'ecarts', 'notices'] as const;
export type PilotageView = (typeof PILOTAGE_VIEWS)[number];
export const DEFAULT_VIEW: PilotageView = 'journal';

// One source with the technician screens (lib/production/limits.ts).
export { MAX_REPORT_DAYS, PAGE_SIZE, SEARCH_MAX_LENGTH };

// ─── Period (recap + discrepancies) ─────────────────────────────────

/**
 * A preset is kept as its key, never as dates: resolved against today
 * each time, a link to "this month" still means this month next month.
 * `month` = one calendar month picked from the list ('YYYY-MM').
 */
export type PeriodKey = 'thisMonth' | 'lastMonth' | 'month' | 'custom';

export interface RecapPeriod {
  key: PeriodKey;
  /** 'YYYY-MM', for `month` only. */
  month: string;
  /** For `custom` only. */
  from: string;
  to: string;
}

export const DEFAULT_PERIOD: RecapPeriod = { key: 'thisMonth', month: '', from: '', to: '' };

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A month a URL may set: 'YYYY-MM' from EARLIEST_DAY's month on. */
export function isUsableMonth(value: string | null | undefined): value is string {
  return !!value && MONTH_PATTERN.test(value) && `${value}-01` >= monthStart(EARLIEST_DAY);
}

/** The last day of a 'YYYY-MM' month. */
export function monthEnd(month: string): string {
  const [year, index] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}

/** The month `shift` months away from `month` (-1 = the one before). */
export function shiftMonth(month: string, shift: number): string {
  const [year, index] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, index - 1 + shift, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The days a period covers, `today` being today's Tunis day. */
export function periodDays(period: RecapPeriod, today: string): ProductionPeriodParams {
  switch (period.key) {
    case 'lastMonth':
      return previousMonth(today);
    case 'month':
      return { from: `${period.month}-01`, to: monthEnd(period.month) };
    case 'custom':
      return orderedDays(period.from, period.to);
    default:
      // The whole calendar month: what the monthly recap and its CSV cover.
      return { from: monthStart(today), to: monthEnd(today.slice(0, 7)) };
  }
}

/** How many days `from` … `to` covers, both included. */
export function daySpan(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/** Every day of `from` … `to`, both included, ascending. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  // The cap keeps a broken range from ever looping long.
  while (cursor.getTime() <= end && days.length <= MAX_REPORT_DAYS) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export type PeriodError = DayRangeError | 'tooLong';

/** Why a typed range cannot be the period, or null when it can (the server's own rules). */
export function periodError(from: string, to: string): PeriodError | null {
  const error = dayRangeError(from, to);
  if (error) return error;
  return daySpan(from, to) > MAX_REPORT_DAYS ? 'tooLong' : null;
}

/**
 * The months the "Autre mois" list offers: the twelve before last month
 * (this month and last month have their own buttons), newest first.
 */
export function olderMonths(today: string, count = 12): string[] {
  const months: string[] = [];
  let month = shiftMonth(today.slice(0, 7), -2);
  while (months.length < count && isUsableMonth(month)) {
    months.push(month);
    month = shiftMonth(month, -1);
  }
  return months;
}

export function samePeriod(a: RecapPeriod, b: RecapPeriod): boolean {
  if (a.key !== b.key) return false;
  if (a.key === 'month') return a.month === b.month;
  if (a.key === 'custom') return a.from === b.from && a.to === b.to;
  return true;
}

// ─── The whole desk ─────────────────────────────────────────────────

export type AnomalyFilter = ProductionAnomalyKind | 'all';
export type NoticeFilter = ProductionNoticeStatus | 'all';
export const PROGRESS_STATES: readonly ProductionProgressState[] = ['all', 'active', 'done'];

export interface ProgressFilters {
  search: string;
  state: ProductionProgressState;
  page: number;
}

export interface NoticeFilters {
  status: NoticeFilter;
  page: number;
}

export interface PilotageState {
  view: PilotageView;
  /** The journal's day; '' = today (a link to the journal opens on the day it is opened). */
  day: string;
  period: RecapPeriod;
  kind: AnomalyFilter;
  progress: ProgressFilters;
  notices: NoticeFilters;
}

export const EMPTY_PROGRESS: ProgressFilters = { search: '', state: 'all', page: 1 };
export const EMPTY_NOTICES: NoticeFilters = { status: 'all', page: 1 };

interface SearchParamsLike {
  get(name: string): string | null;
}

function pick<V extends string>(value: string | null, allowed: readonly V[], fallback: V): V {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as V) : fallback;
}

function pageOf(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1;
}

function readPeriod(params: SearchParamsLike): RecapPeriod {
  const key = pick<PeriodKey>(
    params.get('period'),
    ['thisMonth', 'lastMonth', 'month', 'custom'],
    DEFAULT_PERIOD.key,
  );
  if (key === 'month') {
    const month = params.get('month');
    return isUsableMonth(month) ? { ...DEFAULT_PERIOD, key, month } : DEFAULT_PERIOD;
  }
  if (key === 'custom') {
    // A shared link may carry the bounds reversed: put them in order first.
    const { from, to } = orderedDays(usableDay(params.get('from')), usableDay(params.get('to')));
    return periodError(from, to) === null ? { key, month: '', from, to } : DEFAULT_PERIOD;
  }
  return { ...DEFAULT_PERIOD, key };
}

/**
 * `?view=…&day=…&period=…` → the desk state; anything odd falls back to
 * its default. `page` belongs to the view the URL names (only the open
 * view's filters are ever written).
 */
export function readPilotageUrl(params: SearchParamsLike, today: string): PilotageState {
  const view = pick(params.get('view'), PILOTAGE_VIEWS, DEFAULT_VIEW);
  const rawDay = usableDay(params.get('day'));
  const day = rawDay && rawDay < today ? rawDay : '';
  const page = pageOf(params.get('page'));
  const search = (params.get('q') ?? '').trim().slice(0, SEARCH_MAX_LENGTH);
  return {
    view,
    day,
    period: readPeriod(params),
    kind: pick<AnomalyFilter>(params.get('kind'), ['all', ...PRODUCTION_ANOMALY_KINDS], 'all'),
    progress: {
      search,
      state: pick(params.get('state'), PROGRESS_STATES, 'all'),
      page: view === 'avancement' ? page : 1,
    },
    notices: {
      status: pick<NoticeFilter>(params.get('status'), ['all', ...PRODUCTION_NOTICE_STATUSES], 'all'),
      page: view === 'notices' ? page : 1,
    },
  };
}

const URL_KEYS = ['view', 'day', 'period', 'month', 'from', 'to', 'kind', 'q', 'state', 'status', 'page'];

function writePeriod(params: URLSearchParams, period: RecapPeriod): void {
  if (period.key === DEFAULT_PERIOD.key) return;
  params.set('period', period.key);
  if (period.key === 'month') params.set('month', period.month);
  if (period.key === 'custom') {
    params.set('from', period.from);
    params.set('to', period.to);
  }
}

/**
 * The query string for `state`, keeping every foreign param of `current`.
 * Only the open view's filters go in, so a shared link reads as what is on
 * screen; the other views keep theirs in memory for the visit.
 */
export function pilotageUrlSearch(state: PilotageState, current: string): string {
  const params = new URLSearchParams(current);
  for (const key of URL_KEYS) params.delete(key);
  if (state.view !== DEFAULT_VIEW) params.set('view', state.view);
  switch (state.view) {
    case 'journal':
      if (state.day) params.set('day', state.day);
      break;
    case 'recap':
      writePeriod(params, state.period);
      break;
    case 'ecarts':
      writePeriod(params, state.period);
      if (state.kind !== 'all') params.set('kind', state.kind);
      break;
    case 'avancement':
      if (state.progress.search) params.set('q', state.progress.search);
      if (state.progress.state !== 'all') params.set('state', state.progress.state);
      if (state.progress.page > 1) params.set('page', String(state.progress.page));
      break;
    case 'notices':
      if (state.notices.status !== 'all') params.set('status', state.notices.status);
      if (state.notices.page > 1) params.set('page', String(state.notices.page));
      break;
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** A journal day as the state keeps it: today is '' (see PilotageState.day). */
export function journalDayKey(day: string, today: string): string {
  return isCalendarDate(day) && day < today ? day : '';
}
