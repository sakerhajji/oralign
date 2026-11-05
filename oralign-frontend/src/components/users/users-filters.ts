import {
  UserRole,
  VerificationStatus,
  type UserFilterParams,
} from '@/lib/types';

/**
 * Users page state ↔ URL ↔ API params, in one pure module.
 *
 * The page keeps this state in React and mirrors it into the address bar
 * with `window.history.replaceState` (Next 16 syncs `useSearchParams`
 * from it without a server round trip). The URL is only READ once, on
 * mount — nothing flows back from it while the admin types.
 */

export type UsersView = 'active' | 'deleted';
export type RoleFilter = 'all' | UserRole;
export type StatusFilter = 'all' | 'active' | 'blocked';
export type ApprovalFilter = 'all' | VerificationStatus;
export type GiftFilter = 'all' | 'available' | 'used';

export interface UsersFilters {
  /** Committed (trimmed) search — never the raw input text. */
  search: string;
  role: RoleFilter;
  status: StatusFilter;
  approval: ApprovalFilter;
  gift: GiftFilter;
}

export interface UsersUrlState {
  view: UsersView;
  page: number;
  filters: UsersFilters;
}

export const USERS_PAGE_SIZE = 10;

export const EMPTY_USERS_FILTERS: UsersFilters = {
  search: '',
  role: 'all',
  status: 'all',
  approval: 'all',
  gift: 'all',
};

const ROLE_VALUES: readonly RoleFilter[] = ['all', ...Object.values(UserRole)];
const STATUS_VALUES: readonly StatusFilter[] = ['all', 'active', 'blocked'];
const APPROVAL_VALUES: readonly ApprovalFilter[] = [
  'all',
  ...Object.values(VerificationStatus),
];
const GIFT_VALUES: readonly GiftFilter[] = ['all', 'available', 'used'];

/** URL keys owned by this page (anything else in the query is left alone). */
const URL_KEYS = ['tab', 'search', 'role', 'status', 'approval', 'gift', 'page'];

function pick<V extends string>(
  value: string | null,
  allowed: readonly V[],
  fallback: V,
): V {
  return value !== null && (allowed as readonly string[]).includes(value)
    ? (value as V)
    : fallback;
}

interface SearchParamsLike {
  get(name: string): string | null;
}

export function readUsersUrlState(params: SearchParamsLike): UsersUrlState {
  const page = Number.parseInt(params.get('page') ?? '', 10);
  return {
    view: params.get('tab') === 'deleted' ? 'deleted' : 'active',
    page: Number.isFinite(page) && page > 1 ? page : 1,
    filters: {
      search: (params.get('search') ?? '').trim(),
      role: pick(params.get('role'), ROLE_VALUES, 'all'),
      status: pick(params.get('status'), STATUS_VALUES, 'all'),
      approval: pick(params.get('approval'), APPROVAL_VALUES, 'all'),
      gift: pick(params.get('gift'), GIFT_VALUES, 'all'),
    },
  };
}

/**
 * The query string for `state`, keeping any foreign params of `current`.
 * Defaults are omitted so a plain visit stays `/dashboard/users`.
 */
export function usersUrlSearch(state: UsersUrlState, current: string): string {
  const params = new URLSearchParams(current);
  for (const key of URL_KEYS) params.delete(key);
  const { view, page, filters } = state;
  if (view === 'deleted') params.set('tab', 'deleted');
  if (filters.search) params.set('search', filters.search);
  if (filters.role !== 'all') params.set('role', filters.role);
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.approval !== 'all') params.set('approval', filters.approval);
  if (filters.gift !== 'all') params.set('gift', filters.gift);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function toUserFilterParams(
  filters: UsersFilters,
  page: number,
): UserFilterParams {
  const params: UserFilterParams = { page, limit: USERS_PAGE_SIZE };
  if (filters.search) params.search = filters.search;
  if (filters.role !== 'all') params.role = filters.role;
  if (filters.status !== 'all') params.isActive = filters.status === 'active';
  if (filters.approval !== 'all') params.verificationStatus = filters.approval;
  if (filters.gift !== 'all') params.welcomeGift = filters.gift;
  return params;
}

export function hasActiveFilters(filters: UsersFilters): boolean {
  return (
    filters.search !== '' ||
    filters.role !== 'all' ||
    filters.status !== 'all' ||
    filters.approval !== 'all' ||
    filters.gift !== 'all'
  );
}

export function sameFilters(a: UsersFilters, b: UsersFilters): boolean {
  return (
    a.search === b.search &&
    a.role === b.role &&
    a.status === b.status &&
    a.approval === b.approval &&
    a.gift === b.gift
  );
}
