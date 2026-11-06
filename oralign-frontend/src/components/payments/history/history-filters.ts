import {
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  PaymentSortBy,
  PaymentSortOrder,
  type PaymentFilterDto,
  type PaymentsReportKind,
  type PaymentsReportRequest,
  type PaymentsReportSection,
  type PaymentsSummaryParams,
  type TreatmentFeeFilterParams,
} from '@/lib/types';
import type { Lang } from '@/lib/i18n/dict';
import {
  addDays,
  isCalendarDate,
  monthStart,
  previousMonth,
} from '@/lib/utils/business-day';

/**
 * Payments desk state ↔ URL ↔ API params, in one pure module (the
 * Patients page's model): the page keeps this state in React and mirrors
 * it into the address bar with `history.replaceState`; the URL is only
 * read on mount.
 *
 * Two levels of state:
 *   • the PERIOD is global: it drives the takings cards and both tabs;
 *   • each TAB keeps its own search, practitioner, method, status, sort
 *     (and installment rank), so switching tabs never loses either set.
 *
 * A period preset is kept as its key ("today"), never as dates, so a link
 * to "today" still means today tomorrow: it is resolved against the
 * Africa/Tunis business day each time the params are built.
 */

/** The two kinds of money, never mixed: treatment fees and quote installments. */
export type HistoryTab = 'frais' | 'echeances';
export type PeriodKey =
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | 'month'
  | 'lastMonth'
  | 'custom'
  | 'all';
export type MethodFilter = 'all' | PaymentMethod;
/** One exact status, as the badges name them, or every status. */
export type StatusFilter = 'all' | PaymentRecordStatus;
export type HistorySort = 'recent' | 'oldest' | 'amount-desc' | 'amount-asc';
/** The installment's rank on its quote: the 1st, 2nd, 3rd, or the 4th and later. */
export type InstallmentRank = 'all' | '1' | '2' | '3' | '4+';

/** The global period. `from` / `to` are the applied custom days ('YYYY-MM-DD'). */
export interface Period {
  key: PeriodKey;
  from: string;
  to: string;
}

/** One tab's own filters. */
export interface TabFilters {
  /** Committed (trimmed) search — never the raw input text. */
  search: string;
  /** Admins only: 'all' or a dentist id. */
  doctor: string;
  method: MethodFilter;
  status: StatusFilter;
  sort: HistorySort;
  /** Installments tab only. */
  rank: InstallmentRank;
}

export interface DeskState {
  tab: HistoryTab;
  period: Period;
  filters: Record<HistoryTab, TabFilters>;
  pages: Record<HistoryTab, number>;
}

/** Inclusive business days; null means open on that side. */
export interface DayRange {
  from: string | null;
  to: string | null;
}

export const HISTORY_PAGE_SIZE = 25;
/** The backend refuses a longer search. */
export const SEARCH_MAX_LENGTH = 120;
/**
 * The earliest day a custom period accepts. Older than any payment the
 * platform holds, and it keeps a half-typed year (0002, 0020, 0202…)
 * from ever reaching the API, which refuses years before 100.
 */
export const EARLIEST_DAY = '2020-01-01';

/** Tab 1, Tab 2: the order of the strip. */
export const TAB_VALUES: readonly HistoryTab[] = ['frais', 'echeances'];
export const DEFAULT_TAB: HistoryTab = 'frais';
export const PERIOD_VALUES: readonly PeriodKey[] = [
  'today',
  'yesterday',
  '7d',
  '30d',
  'month',
  'lastMonth',
  'custom',
  'all',
];
export const DEFAULT_PERIOD: Period = { key: 'today', from: '', to: '' };
export const METHOD_VALUES: readonly PaymentMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.CARD,
  PaymentMethod.BANK_TRANSFER,
];
const METHOD_FILTER_VALUES: readonly MethodFilter[] = ['all', ...METHOD_VALUES];

/**
 * The statuses each tab can hold. A treatment fee is only ever paid or
 * awaiting the confirmation of its transfer; an installment payment is an
 * attempt and can end every way.
 */
export const TAB_STATUSES: Record<HistoryTab, readonly StatusFilter[]> = {
  frais: ['all', PaymentRecordStatus.SUCCESS, PaymentRecordStatus.AWAITING_CONFIRMATION],
  echeances: [
    'all',
    PaymentRecordStatus.SUCCESS,
    PaymentRecordStatus.AWAITING_CONFIRMATION,
    PaymentRecordStatus.PENDING,
    PaymentRecordStatus.UNKNOWN,
    PaymentRecordStatus.FAILED,
    PaymentRecordStatus.REJECTED,
    PaymentRecordStatus.CANCELLED,
    PaymentRecordStatus.EXPIRED,
  ],
};
export const SORT_VALUES: readonly HistorySort[] = [
  'recent',
  'oldest',
  'amount-desc',
  'amount-asc',
];
export const RANK_VALUES: readonly InstallmentRank[] = ['all', '1', '2', '3', '4+'];

export const EMPTY_TAB_FILTERS: TabFilters = {
  search: '',
  doctor: 'all',
  method: 'all',
  status: 'all',
  sort: 'recent',
  rank: 'all',
};

export function initialDeskState(): DeskState {
  return {
    tab: DEFAULT_TAB,
    period: DEFAULT_PERIOD,
    filters: { frais: EMPTY_TAB_FILTERS, echeances: EMPTY_TAB_FILTERS },
    pages: { frais: 1, echeances: 1 },
  };
}

// Dentist ids are UUIDs; anything else in the URL is ignored.
const ID_PATTERN = /^[0-9a-f-]{8,64}$/i;

/** URL prefix of each tab's own params: `f_q`, `e_status`… */
const TAB_PREFIX: Record<HistoryTab, string> = { frais: 'f_', echeances: 'e_' };
const TAB_KEYS = ['q', 'doctor', 'method', 'status', 'sort', 'rank', 'page'] as const;
/** The un-prefixed keys of the previous desk, still read once for old links. */
const LEGACY_KEYS = ['q', 'doctor', 'method', 'status', 'sort', 'page'] as const;

/** Every URL key owned by the desk; any other param is kept as it is. */
const URL_KEYS = [
  'tab',
  'period',
  'from',
  'to',
  ...LEGACY_KEYS,
  ...TAB_VALUES.flatMap((tab) => TAB_KEYS.map((key) => `${TAB_PREFIX[tab]}${key}`)),
];

function pick<V extends string>(value: string | null, allowed: readonly V[], fallback: V): V {
  return value !== null && (allowed as readonly string[]).includes(value)
    ? (value as V)
    : fallback;
}

/** The status a tab can show: one it does not offer falls back to all. */
export function statusForTab(status: StatusFilter, tab: HistoryTab): StatusFilter {
  return TAB_STATUSES[tab].includes(status) ? status : 'all';
}

/** A custom range never runs backwards (the API refuses from > to). */
export function orderedRange(from: string, to: string): { from: string; to: string } {
  return from && to && from > to ? { from: to, to: from } : { from, to };
}

/** Whether `day` falls inside `range` (an open side holds every day). */
export function includesDay(range: DayRange, day: string): boolean {
  return (!range.from || range.from <= day) && (!range.to || range.to >= day);
}

export type CustomRangeError = 'missingFrom' | 'missingTo' | 'invalid' | 'tooEarly' | 'endBeforeStart';

/**
 * Why a custom range typed in the date fields cannot be applied, or null
 * when it can: both days set, real calendar days from EARLIEST_DAY on,
 * the end not before the start. Both days are included.
 */
export function customRangeError(from: string, to: string): CustomRangeError | null {
  if (!from) return 'missingFrom';
  if (!to) return 'missingTo';
  if (!isCalendarDate(from) || !isCalendarDate(to)) return 'invalid';
  if (from < EARLIEST_DAY || to < EARLIEST_DAY) return 'tooEarly';
  if (to < from) return 'endBeforeStart';
  return null;
}

interface SearchParamsLike {
  get(name: string): string | null;
}

function readTabFilters(
  get: (key: string) => string | null,
  tab: HistoryTab,
  isAdmin: boolean,
): { filters: TabFilters; page: number } {
  const doctor = get('doctor');
  const page = Number.parseInt(get('page') ?? '', 10);
  // The previous desk grouped statuses: its "paid" is today's success.
  const rawStatus = get('status') === 'paid' ? PaymentRecordStatus.SUCCESS : get('status');
  return {
    filters: {
      search: (get('q') ?? '').trim().slice(0, SEARCH_MAX_LENGTH),
      doctor: isAdmin && doctor && ID_PATTERN.test(doctor) ? doctor : 'all',
      method: pick(get('method'), METHOD_FILTER_VALUES, 'all'),
      status: statusForTab(pick(rawStatus, TAB_STATUSES.echeances, 'all'), tab),
      sort: pick(get('sort'), SORT_VALUES, 'recent'),
      rank: tab === 'echeances' ? pick(get('rank'), RANK_VALUES, 'all') : 'all',
    },
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

export function readDeskUrlState(
  params: SearchParamsLike,
  { isAdmin }: { isAdmin: boolean },
): DeskState {
  const tab = pick(params.get('tab'), TAB_VALUES, DEFAULT_TAB);
  const key = pick(params.get('period'), PERIOD_VALUES, DEFAULT_PERIOD.key);
  const fromParam = params.get('from') ?? '';
  const toParam = params.get('to') ?? '';
  // A custom period from the URL applies only when it is a valid range.
  const custom =
    key === 'custom' && customRangeError(fromParam, toParam) === null
      ? { key, from: fromParam, to: toParam }
      : null;
  const period: Period = custom ?? (key === 'custom' ? DEFAULT_PERIOD : { key, from: '', to: '' });

  const state = initialDeskState();
  state.tab = tab;
  state.period = period;
  for (const each of TAB_VALUES) {
    const prefix = TAB_PREFIX[each];
    const hasOwn = TAB_KEYS.some((name) => params.get(`${prefix}${name}`) !== null);
    // A link from the previous desk (no prefixes) fills the tab it opens.
    const get = hasOwn || each !== tab
      ? (name: string) => params.get(`${prefix}${name}`)
      : (name: string) => params.get(name);
    const { filters, page } = readTabFilters(get, each, isAdmin);
    state.filters[each] = filters;
    state.pages[each] = page;
  }
  return state;
}

/**
 * The query string for `state`, keeping every foreign param of `current`.
 * Defaults are omitted, so a plain visit stays `/dashboard/payments/history`.
 */
export function deskUrlSearch(state: DeskState, current: string): string {
  const params = new URLSearchParams(current);
  for (const key of URL_KEYS) params.delete(key);
  if (state.tab !== DEFAULT_TAB) params.set('tab', state.tab);
  if (state.period.key !== DEFAULT_PERIOD.key) params.set('period', state.period.key);
  if (state.period.key === 'custom') {
    params.set('from', state.period.from);
    params.set('to', state.period.to);
  }
  for (const tab of TAB_VALUES) {
    const prefix = TAB_PREFIX[tab];
    const filters = state.filters[tab];
    if (filters.search) params.set(`${prefix}q`, filters.search);
    if (filters.doctor !== 'all') params.set(`${prefix}doctor`, filters.doctor);
    if (filters.method !== 'all') params.set(`${prefix}method`, filters.method);
    if (filters.status !== 'all') params.set(`${prefix}status`, filters.status);
    if (filters.sort !== 'recent') params.set(`${prefix}sort`, filters.sort);
    if (tab === 'echeances' && filters.rank !== 'all') params.set(`${prefix}rank`, filters.rank);
    if (state.pages[tab] > 1) params.set(`${prefix}page`, String(state.pages[tab]));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** The business days a period covers, `today` being the Tunis day. */
export function periodRange(period: Period, today: string): DayRange {
  switch (period.key) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const day = addDays(today, -1);
      return { from: day, to: day };
    }
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case 'month':
      return { from: monthStart(today), to: today };
    case 'lastMonth':
      return previousMonth(today);
    case 'custom': {
      const { from, to } = orderedRange(period.from, period.to);
      return { from: from || null, to: to || null };
    }
    default:
      return { from: null, to: null };
  }
}

/**
 * The days the takings and the report count: the period's, and for
 * "every date" everything up to today (the summary's `to` alone).
 */
export function takingsRange(range: DayRange, today: string): DayRange {
  return range.from || range.to ? range : { from: null, to: today };
}

function rankBounds(rank: InstallmentRank): { min?: number; max?: number } {
  switch (rank) {
    case '1':
    case '2':
    case '3':
      return { min: Number(rank), max: Number(rank) };
    case '4+':
      return { min: 4 };
    default:
      return {};
  }
}

function sortParams(sort: HistorySort): { byAmount: boolean; order: PaymentSortOrder } {
  const byAmount = sort === 'amount-desc' || sort === 'amount-asc';
  const ascending = sort === 'oldest' || sort === 'amount-asc';
  return { byAmount, order: ascending ? PaymentSortOrder.ASC : PaymentSortOrder.DESC };
}

/**
 * Installments list params. "Newest first" / "Oldest first" order by the
 * date each payment happened (sortBy=eventAt: when it was received, else
 * when it was made), whatever the status: the date the Date column
 * prints and the period filters on.
 */
export function toInstallmentParams(
  filters: TabFilters,
  range: DayRange,
  { isAdmin }: { isAdmin: boolean },
): PaymentFilterDto {
  const params: PaymentFilterDto = { purpose: PaymentPurpose.INSTALLMENT };
  if (filters.search) params.search = filters.search;
  if (range.from) params.from = range.from;
  if (range.to) params.to = range.to;
  if (filters.method !== 'all') params.methods = [filters.method];
  const status = statusForTab(filters.status, 'echeances');
  if (status !== 'all') params.statuses = [status];
  if (isAdmin && filters.doctor !== 'all') params.doctorId = filters.doctor;
  const { min, max } = rankBounds(filters.rank);
  if (min !== undefined) params.installmentMin = min;
  if (max !== undefined) params.installmentMax = max;
  const { byAmount, order } = sortParams(filters.sort);
  params.sortBy = byAmount ? PaymentSortBy.AMOUNT : PaymentSortBy.EVENT_AT;
  params.sortOrder = order;
  return params;
}

/**
 * Treatment-fee list params. Newest first puts the fees still to confirm
 * on top (they have no payment date yet, and they need an action).
 */
export function toFeeParams(
  filters: TabFilters,
  range: DayRange,
  { isAdmin }: { isAdmin: boolean },
): TreatmentFeeFilterParams {
  const params: TreatmentFeeFilterParams = {};
  if (filters.search) params.search = filters.search;
  if (range.from) params.from = range.from;
  if (range.to) params.to = range.to;
  if (filters.method !== 'all') params.methods = [filters.method];
  const status = statusForTab(filters.status, 'frais');
  if (status !== 'all') params.statuses = [status];
  if (isAdmin && filters.doctor !== 'all') params.doctorId = filters.doctor;
  const { byAmount, order } = sortParams(filters.sort);
  params.sortBy = byAmount ? 'amount' : 'paidAt';
  params.sortOrder = order;
  return params;
}

/** The same params without the order: a count does not depend on it. */
export function withoutSort(params: PaymentFilterDto): PaymentFilterDto;
export function withoutSort(params: TreatmentFeeFilterParams): TreatmentFeeFilterParams;
export function withoutSort(params: PaymentFilterDto | TreatmentFeeFilterParams) {
  const counted = { ...params };
  delete counted.sortBy;
  delete counted.sortOrder;
  return counted;
}

/**
 * The takings follow ONLY the period — never a tab's search, practitioner,
 * method or status: they answer "how much came in", whatever the lists
 * below are narrowed to. A dentist's are their own (the server scopes).
 */
export function toSummaryParams(range: DayRange, today: string): PaymentsSummaryParams {
  const days = takingsRange(range, today);
  const params: PaymentsSummaryParams = {};
  if (days.from) params.from = days.from;
  if (days.to) params.to = days.to;
  return params;
}

function toReportSection(
  filters: TabFilters,
  tab: HistoryTab,
  isAdmin: boolean,
): PaymentsReportSection {
  const section: PaymentsReportSection = { sort: filters.sort };
  if (filters.search) section.search = filters.search;
  if (isAdmin && filters.doctor !== 'all') section.doctorId = filters.doctor;
  if (filters.method !== 'all') section.methods = [filters.method];
  const status = statusForTab(filters.status, tab);
  if (status !== 'all') section.statuses = [status];
  if (tab === 'echeances') {
    const { min, max } = rankBounds(filters.rank);
    if (min !== undefined) section.installmentMin = min;
    if (max !== undefined) section.installmentMax = max;
  }
  return section;
}

/**
 * The PDF report of what the desk shows: the period, and each included
 * tab's own filters, exactly as on screen (the server reads every page).
 */
export function toReportRequest(
  state: DeskState,
  kind: PaymentsReportKind,
  lang: Lang,
  today: string,
  { isAdmin }: { isAdmin: boolean },
): PaymentsReportRequest {
  const range = periodRange(state.period, today);
  const request: PaymentsReportRequest = { kind, lang };
  if (range.from || range.to) {
    if (range.from) request.from = range.from;
    if (range.to) request.to = range.to;
  } else {
    request.allDates = true;
    request.to = today;
  }
  if (kind !== 'installment') {
    request.treatmentFees = toReportSection(state.filters.frais, 'frais', isAdmin);
  }
  if (kind !== 'treatment_fee') {
    request.installments = toReportSection(state.filters.echeances, 'echeances', isAdmin);
  }
  return request;
}

/** Some search or filter narrows the tab (the sort does not). */
export function hasActiveFilters(filters: TabFilters): boolean {
  return (
    filters.search !== '' ||
    filters.doctor !== 'all' ||
    filters.method !== 'all' ||
    filters.status !== 'all' ||
    filters.rank !== 'all'
  );
}

export function sameTabFilters(a: TabFilters, b: TabFilters): boolean {
  return (
    a.search === b.search &&
    a.doctor === b.doctor &&
    a.method === b.method &&
    a.status === b.status &&
    a.sort === b.sort &&
    a.rank === b.rank
  );
}

export function samePeriod(a: Period, b: Period): boolean {
  return a.key === b.key && a.from === b.from && a.to === b.to;
}

/** The kind of payment a tab lists, as the API names it. */
export const TAB_PURPOSE: Record<HistoryTab, PaymentPurpose> = {
  frais: PaymentPurpose.TREATMENT_FEE,
  echeances: PaymentPurpose.INSTALLMENT,
};

/** The report kind of a tab. */
export const TAB_REPORT_KIND: Record<HistoryTab, PaymentsReportKind> = {
  frais: 'treatment_fee',
  echeances: 'installment',
};
