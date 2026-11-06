import {
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  PaymentSortBy,
  PaymentSortOrder,
  type PaymentFilterDto,
  type PaymentsSummaryParams,
  type TreatmentFeeFilterParams,
} from '@/lib/types';
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
 * A period preset is kept as its key ("today"), never as dates, so a link
 * to "today" still means today tomorrow: it is resolved against the
 * Africa/Tunis business day each time the params are built.
 */

/** The two kinds of money, never mixed: quote installments and treatment fees. */
export type HistoryTab = 'echeances' | 'frais';
export type PeriodKey = 'all' | 'today' | 'yesterday' | '7d' | 'month' | 'lastMonth' | 'custom';
export type MethodFilter = 'all' | PaymentMethod;
/** `pending` reads "En attente" on installments, "À confirmer" on fees. */
export type StatusFilter = 'all' | 'paid' | 'pending' | 'failed';
export type HistorySort = 'recent' | 'oldest' | 'amount-desc' | 'amount-asc';

export interface HistoryFilters {
  /** Committed (trimmed) search — never the raw input text. */
  search: string;
  period: PeriodKey;
  /** Custom period only: 'YYYY-MM-DD' or ''. */
  from: string;
  to: string;
  method: MethodFilter;
  status: StatusFilter;
  /** Admins only: 'all' or a dentist id. */
  doctor: string;
  sort: HistorySort;
}

export interface HistoryUrlState {
  tab: HistoryTab;
  page: number;
  filters: HistoryFilters;
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

export const EMPTY_HISTORY_FILTERS: HistoryFilters = {
  search: '',
  period: 'all',
  from: '',
  to: '',
  method: 'all',
  status: 'all',
  doctor: 'all',
  sort: 'recent',
};

export const TAB_VALUES: readonly HistoryTab[] = ['echeances', 'frais'];
export const PERIOD_VALUES: readonly PeriodKey[] = [
  'all',
  'today',
  'yesterday',
  '7d',
  'month',
  'lastMonth',
  'custom',
];
export const METHOD_VALUES: readonly PaymentMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.CARD,
  PaymentMethod.BANK_TRANSFER,
];
const METHOD_FILTER_VALUES: readonly MethodFilter[] = ['all', ...METHOD_VALUES];
/** The status filter each tab offers: a fee is only ever paid or to confirm. */
export const TAB_STATUSES: Record<HistoryTab, readonly StatusFilter[]> = {
  echeances: ['all', 'paid', 'pending', 'failed'],
  frais: ['all', 'paid', 'pending'],
};
export const SORT_VALUES: readonly HistorySort[] = [
  'recent',
  'oldest',
  'amount-desc',
  'amount-asc',
];

const INSTALLMENT_STATUSES: Record<Exclude<StatusFilter, 'all'>, PaymentRecordStatus[]> = {
  paid: [PaymentRecordStatus.SUCCESS],
  pending: [
    PaymentRecordStatus.PENDING,
    PaymentRecordStatus.AWAITING_CONFIRMATION,
    PaymentRecordStatus.UNKNOWN,
  ],
  failed: [
    PaymentRecordStatus.FAILED,
    PaymentRecordStatus.REJECTED,
    PaymentRecordStatus.CANCELLED,
    PaymentRecordStatus.EXPIRED,
  ],
};

const FEE_STATUSES: Record<'paid' | 'pending', PaymentRecordStatus[]> = {
  paid: [PaymentRecordStatus.SUCCESS],
  pending: [PaymentRecordStatus.AWAITING_CONFIRMATION],
};

// Dentist ids are UUIDs; anything else in the URL is ignored.
const ID_PATTERN = /^[0-9a-f-]{8,64}$/i;

/** URL keys owned by the desk; any other param is kept as it is. */
const URL_KEYS = ['tab', 'q', 'period', 'from', 'to', 'method', 'status', 'doctor', 'sort', 'page'];

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

/**
 * A day typed into a custom period that may be applied: a real calendar
 * day from EARLIEST_DAY on. A day after `today` is applied as today (no
 * payment is dated in the future); anything else is not applied yet.
 */
export function plausibleDay(value: string, today: string): string | null {
  if (!isCalendarDate(value) || value < EARLIEST_DAY) return null;
  return value > today ? today : value;
}

/** Whether `day` falls inside `range` (an open side holds every day). */
export function includesDay(range: DayRange, day: string): boolean {
  return (!range.from || range.from <= day) && (!range.to || range.to >= day);
}

interface SearchParamsLike {
  get(name: string): string | null;
}

export function readHistoryUrlState(
  params: SearchParamsLike,
  { isAdmin }: { isAdmin: boolean },
): HistoryUrlState {
  const page = Number.parseInt(params.get('page') ?? '', 10);
  const tab = pick(params.get('tab'), TAB_VALUES, 'echeances');
  const period = pick(params.get('period'), PERIOD_VALUES, 'all');
  const fromParam = params.get('from');
  const toParam = params.get('to');
  const custom = orderedRange(
    period === 'custom' && isCalendarDate(fromParam) ? fromParam : '',
    period === 'custom' && isCalendarDate(toParam) ? toParam : '',
  );
  const doctor = params.get('doctor');
  return {
    tab,
    page: Number.isFinite(page) && page > 1 ? page : 1,
    filters: {
      search: (params.get('q') ?? '').trim().slice(0, SEARCH_MAX_LENGTH),
      period,
      from: custom.from,
      to: custom.to,
      method: pick(params.get('method'), METHOD_FILTER_VALUES, 'all'),
      status: statusForTab(
        pick(params.get('status'), TAB_STATUSES.echeances, 'all'),
        tab,
      ),
      doctor: isAdmin && doctor && ID_PATTERN.test(doctor) ? doctor : 'all',
      sort: pick(params.get('sort'), SORT_VALUES, 'recent'),
    },
  };
}

/**
 * The query string for `state`, keeping every foreign param of `current`.
 * Defaults are omitted, so a plain visit stays `/dashboard/payments/history`.
 */
export function historyUrlSearch(state: HistoryUrlState, current: string): string {
  const params = new URLSearchParams(current);
  for (const key of URL_KEYS) params.delete(key);
  const { tab, page, filters } = state;
  if (tab !== 'echeances') params.set('tab', tab);
  if (filters.search) params.set('q', filters.search);
  if (filters.period !== 'all') params.set('period', filters.period);
  if (filters.period === 'custom') {
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
  }
  if (filters.method !== 'all') params.set('method', filters.method);
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.doctor !== 'all') params.set('doctor', filters.doctor);
  if (filters.sort !== 'recent') params.set('sort', filters.sort);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * The business days a period covers, `today` being the Tunis day. The
 * two custom dates are kept as typed (neither input ever rewrites the
 * other); they are put in order and capped at today only here, where
 * the params are built.
 */
export function periodRange(filters: HistoryFilters, today: string): DayRange {
  switch (filters.period) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const day = addDays(today, -1);
      return { from: day, to: day };
    }
    case '7d':
      return { from: addDays(today, -6), to: today };
    case 'month':
      return { from: monthStart(today), to: today };
    case 'lastMonth':
      return previousMonth(today);
    case 'custom': {
      const cap = (day: string) => (day && day > today ? today : day);
      const { from, to } = orderedRange(cap(filters.from), cap(filters.to));
      return { from: from || null, to: to || null };
    }
    default:
      return { from: null, to: null };
  }
}

/**
 * Installments list params. "Newest first" / "Oldest first" order by the
 * date each payment happened (sortBy=eventAt: when it was received, else
 * when it was made), whatever the status: the date the Date column
 * prints and the period filters on, so a transfer declared on the 2nd
 * and confirmed on the 6th sits among the 6th's rows, where it reads.
 */
export function toInstallmentParams(
  filters: HistoryFilters,
  range: DayRange,
  { isAdmin }: { isAdmin: boolean },
): PaymentFilterDto {
  const params: PaymentFilterDto = { purpose: PaymentPurpose.INSTALLMENT };
  if (filters.search) params.search = filters.search;
  if (range.from) params.from = range.from;
  if (range.to) params.to = range.to;
  if (filters.method !== 'all') params.methods = [filters.method];
  const status = statusForTab(filters.status, 'echeances');
  if (status !== 'all') params.statuses = INSTALLMENT_STATUSES[status];
  if (isAdmin && filters.doctor !== 'all') params.doctorId = filters.doctor;
  switch (filters.sort) {
    case 'amount-desc':
    case 'amount-asc':
      params.sortBy = PaymentSortBy.AMOUNT;
      params.sortOrder =
        filters.sort === 'amount-desc' ? PaymentSortOrder.DESC : PaymentSortOrder.ASC;
      break;
    default:
      params.sortBy = PaymentSortBy.EVENT_AT;
      params.sortOrder =
        filters.sort === 'oldest' ? PaymentSortOrder.ASC : PaymentSortOrder.DESC;
  }
  return params;
}

/**
 * Treatment-fee list params. Newest first puts the fees still to confirm
 * on top (they have no payment date yet, and they need an action).
 */
export function toFeeParams(
  filters: HistoryFilters,
  range: DayRange,
  { isAdmin }: { isAdmin: boolean },
): TreatmentFeeFilterParams {
  const params: TreatmentFeeFilterParams = {};
  if (filters.search) params.search = filters.search;
  if (range.from) params.from = range.from;
  if (range.to) params.to = range.to;
  if (filters.method !== 'all') params.methods = [filters.method];
  const status = statusForTab(filters.status, 'frais');
  if (status === 'paid' || status === 'pending') params.statuses = FEE_STATUSES[status];
  if (isAdmin && filters.doctor !== 'all') params.doctorId = filters.doctor;
  const byAmount = filters.sort === 'amount-desc' || filters.sort === 'amount-asc';
  params.sortBy = byAmount ? 'amount' : 'paidAt';
  params.sortOrder =
    filters.sort === 'oldest' || filters.sort === 'amount-asc'
      ? PaymentSortOrder.ASC
      : PaymentSortOrder.DESC;
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
 * The takings follow ONLY the period and (admins) the dentist filter —
 * never the tab, the search, the method or the status: they answer "how
 * much came in", whatever the list below is narrowed to. No period → no
 * dates sent, and the server counts today.
 */
export function toSummaryParams(
  filters: HistoryFilters,
  range: DayRange,
  { isAdmin }: { isAdmin: boolean },
): PaymentsSummaryParams {
  const params: PaymentsSummaryParams = {};
  if (range.from) params.from = range.from;
  if (range.to) params.to = range.to;
  if (isAdmin && filters.doctor !== 'all') params.doctorId = filters.doctor;
  return params;
}

/** The range the takings cover: no period means today. */
export function takingsRange(range: DayRange, today: string): DayRange {
  return range.from || range.to ? range : { from: today, to: today };
}

export function hasActiveFilters(filters: HistoryFilters): boolean {
  return (
    filters.search !== '' ||
    filters.period !== 'all' ||
    filters.method !== 'all' ||
    filters.status !== 'all' ||
    filters.doctor !== 'all'
  );
}

export function sameFilters(a: HistoryFilters, b: HistoryFilters): boolean {
  return (
    a.search === b.search &&
    a.period === b.period &&
    a.from === b.from &&
    a.to === b.to &&
    a.method === b.method &&
    a.status === b.status &&
    a.doctor === b.doctor &&
    a.sort === b.sort
  );
}
