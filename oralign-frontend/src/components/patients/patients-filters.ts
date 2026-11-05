import {
  Gender,
  type PatientFilterParams,
  type PatientSortField,
  type SortOrder,
} from '@/lib/types';
import { todayCalendarDate } from '@/lib/utils/calendar-date';

/**
 * Patients page state ↔ URL ↔ API params, in one pure module (same model
 * as the Users page): the page keeps this state in React and mirrors it
 * into the address bar with `history.replaceState`; the URL is only read
 * on mount. The open patient (`?patient=`) is not part of it: the page
 * reads that one straight from the URL, so Back closes the panel.
 */

/** The view tabs: the whole book, by case state, and the admins' trash. */
export type PatientsView = 'all' | 'active' | 'none' | 'trash';
export type PeriodFilter = 'all' | '7d' | '30d' | '12m';
export type GenderFilter = 'all' | Gender;
export type PatientsSort = 'recent' | 'oldest' | 'name' | 'name-desc' | 'updated';

export interface PatientsFilters {
  /** Committed (trimmed) search — never the raw input text. */
  search: string;
  /** When the patient was added. */
  period: PeriodFilter;
  gender: GenderFilter;
  /** Admins only: 'all' or a dentist id. */
  dentist: string;
  sort: PatientsSort;
}

export interface PatientsUrlState {
  view: PatientsView;
  page: number;
  filters: PatientsFilters;
}

export const PATIENTS_PAGE_SIZE = 20;

export const EMPTY_PATIENTS_FILTERS: PatientsFilters = {
  search: '',
  period: 'all',
  gender: 'all',
  dentist: 'all',
  sort: 'recent',
};

export const SORTS: Record<PatientsSort, { sortBy: PatientSortField; sortOrder: SortOrder }> = {
  recent: { sortBy: 'createdAt', sortOrder: 'desc' },
  oldest: { sortBy: 'createdAt', sortOrder: 'asc' },
  name: { sortBy: 'fullName', sortOrder: 'asc' },
  'name-desc': { sortBy: 'fullName', sortOrder: 'desc' },
  updated: { sortBy: 'updatedAt', sortOrder: 'desc' },
};

const PERIOD_DAYS: Record<Exclude<PeriodFilter, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '12m': 365,
};

const VIEW_VALUES: readonly PatientsView[] = ['all', 'active', 'none', 'trash'];
const PERIOD_VALUES: readonly PeriodFilter[] = ['all', '7d', '30d', '12m'];
const GENDER_VALUES: readonly GenderFilter[] = ['all', ...Object.values(Gender)];
const SORT_VALUES = Object.keys(SORTS) as PatientsSort[];
// Dentist ids are UUIDs; anything else in the URL is ignored.
const ID_PATTERN = /^[0-9a-f-]{8,64}$/i;

/** URL keys owned by the list state; `patient` belongs to the panel. */
const URL_KEYS = ['view', 'q', 'period', 'gender', 'dentist', 'sort', 'page'];

function pick<V extends string>(value: string | null, allowed: readonly V[], fallback: V): V {
  return value !== null && (allowed as readonly string[]).includes(value)
    ? (value as V)
    : fallback;
}

interface SearchParamsLike {
  get(name: string): string | null;
}

export function readPatientsUrlState(
  params: SearchParamsLike,
  { isAdmin }: { isAdmin: boolean },
): PatientsUrlState {
  const page = Number.parseInt(params.get('page') ?? '', 10);
  const view = pick(params.get('view'), VIEW_VALUES, 'all');
  const dentist = params.get('dentist');
  return {
    view: view === 'trash' && !isAdmin ? 'all' : view,
    page: Number.isFinite(page) && page > 1 ? page : 1,
    filters: {
      search: (params.get('q') ?? '').trim(),
      period: pick(params.get('period'), PERIOD_VALUES, 'all'),
      gender: pick(params.get('gender'), GENDER_VALUES, 'all'),
      dentist: isAdmin && dentist && ID_PATTERN.test(dentist) ? dentist : 'all',
      sort: pick(params.get('sort'), SORT_VALUES, 'recent'),
    },
  };
}

/**
 * The query string for `state`, keeping every foreign param of `current`
 * (the open patient included). Defaults are omitted, so a plain visit
 * stays `/dashboard/patients`.
 */
export function patientsUrlSearch(state: PatientsUrlState, current: string): string {
  const params = new URLSearchParams(current);
  for (const key of URL_KEYS) params.delete(key);
  const { view, page, filters } = state;
  if (view !== 'all') params.set('view', view);
  if (filters.search) params.set('q', filters.search);
  if (filters.period !== 'all') params.set('period', filters.period);
  if (filters.gender !== 'all') params.set('gender', filters.gender);
  if (filters.dentist !== 'all') params.set('dentist', filters.dentist);
  if (filters.sort !== 'recent') params.set('sort', filters.sort);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** 'YYYY-MM-DD' of the first day inside the period, or null for all time. */
function periodStart(period: PeriodFilter, now: Date): string | null {
  if (period === 'all') return null;
  const from = new Date(now);
  from.setDate(from.getDate() - PERIOD_DAYS[period]);
  return todayCalendarDate(from);
}

/**
 * API params of the filters alone (no view, no page): the base the list
 * and every view tab's total share, so the tab counts follow the filters.
 */
export function toBaseFilterParams(
  filters: PatientsFilters,
  { isAdmin, now = new Date() }: { isAdmin: boolean; now?: Date },
): PatientFilterParams {
  const params: PatientFilterParams = { ...SORTS[filters.sort] };
  if (filters.search) params.search = filters.search;
  const from = periodStart(filters.period, now);
  if (from) params.createdFrom = from;
  if (filters.gender !== 'all') params.gender = filters.gender;
  if (isAdmin && filters.dentist !== 'all') params.doctorId = filters.dentist;
  return params;
}

/** The base params narrowed to one view tab. */
export function withView(base: PatientFilterParams, view: PatientsView): PatientFilterParams {
  switch (view) {
    case 'active':
      return { ...base, orderState: 'active' };
    case 'none':
      return { ...base, orderState: 'none' };
    case 'trash':
      // Never send `includeDeleted: false`: the backend reads "false" as true.
      return { ...base, includeDeleted: true };
    default:
      return base;
  }
}

export function hasActiveFilters(filters: PatientsFilters): boolean {
  return (
    filters.search !== '' ||
    filters.period !== 'all' ||
    filters.gender !== 'all' ||
    filters.dentist !== 'all'
  );
}

export function sameFilters(a: PatientsFilters, b: PatientsFilters): boolean {
  return (
    a.search === b.search &&
    a.period === b.period &&
    a.gender === b.gender &&
    a.dentist === b.dentist &&
    a.sort === b.sort
  );
}
