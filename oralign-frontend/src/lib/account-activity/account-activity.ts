/**
 * Doctor inactivity (spec §5), the frontend rules: who may order, the
 * reactivation reason, the users-desk `activity` filter in the address
 * bar, the dashboard banner state and the Africa/Tunis day format.
 *
 * Mirrors the backend (oralign-backend/src/users/activity/): a doctor is
 * DORMANT when `User.inactiveSince` is set. Dormancy is not "Bloqué"
 * (`isActive`): a dormant doctor keeps login, payments, plan approval and
 * chat, but order create / submit answer 403 ACCOUNT_DORMANT until an
 * admin reactivates the account.
 *
 * Pure and dependency-free (type imports only), so `node --test` runs it
 * as is: see account-activity.test.mjs.
 */
import type {
  AccountActivityEventKind,
  DoctorActivityStatus,
  DoctorActivitySummary,
} from '@/lib/types';

/** The business time zone: every day shown is a Tunis calendar day. */
export const ACTIVITY_TIME_ZONE = 'Africa/Tunis';

/** The backend errorCode of a refused order create / submit. */
export const ACCOUNT_DORMANT_CODE = 'ACCOUNT_DORMANT';

/** Reactivation reason bounds, once trimmed (backend validReason). */
export const REACTIVATION_REASON_MIN = 3;
export const REACTIVATION_REASON_MAX = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

/** May this account start or submit an order? (useCanOrder's shape) */
export interface CanOrder {
  canOrder: boolean;
  /** Why ordering is closed; null while it is open. */
  reason: 'dormant' | null;
}

export const ORDERING_OPEN: CanOrder = { canOrder: true, reason: null };
const ORDERING_DORMANT: CanOrder = { canOrder: false, reason: 'dormant' };

/** The account an order is placed for (the doctor), or null = nothing to check. */
export function canOrderFor(
  account: { inactiveSince?: string | null } | null | undefined,
): CanOrder {
  return account?.inactiveSince ? ORDERING_DORMANT : ORDERING_OPEN;
}

/** True for a 403 ACCOUNT_DORMANT answer (pass the API errorCode). */
export function isAccountDormantCode(errorCode: unknown): boolean {
  return errorCode === ACCOUNT_DORMANT_CODE;
}

/** The trimmed reason when it is acceptable (3-500 characters), else null. */
export function reactivationReasonOf(raw: string): string | null {
  const reason = raw.trim();
  return reason.length >= REACTIVATION_REASON_MIN &&
    reason.length <= REACTIVATION_REASON_MAX
    ? reason
    : null;
}

// ─── Keeping /users/me in step with the account ─────────────────────────────
//
// /users/me is cached 10 minutes and nothing pushes an account change to
// the doctor's browser. While dormant he never sends an order request, so
// no 403 refreshes it either: after an admin reactivates him, every gate
// would stay closed until a reload. These rules tell the hooks when to
// re-read it (lib/hooks/use-can-order.ts).

/**
 * The doctor's own account notices (NotificationType values): each one
 * means the /users/me payload changed (warning deadline, dormant,
 * reactivated).
 */
export const ACCOUNT_NOTICE_TYPES: readonly string[] = [
  'account_inactivity_warning',
  'account_deactivated',
  'account_reactivated',
];

export function isAccountNoticeType(type: unknown): boolean {
  return typeof type === 'string' && ACCOUNT_NOTICE_TYPES.includes(type);
}

/**
 * How often /users/me is re-read while the account is dormant: an admin
 * may reactivate it at any time, and the gates must open without a
 * reload even when no notification is seen.
 */
export const DORMANT_RECHECK_MS = 60_000;

/**
 * Did the unread count rise between two readings? A new notice may be
 * « Votre compte est réactivé », so the dentist's /users/me is re-read.
 * The first reading (`previous` undefined) is not a rise.
 */
export function unreadCountRose(
  previous: number | undefined,
  next: number | undefined,
): boolean {
  return previous !== undefined && next !== undefined && next > previous;
}

/**
 * Is a listed account notice newer than the /users/me snapshot
 * (`userFetchedAt`, epoch ms; 0 = never read)? Then the payload behind
 * the gates is older than the change the notice announces.
 */
export function accountNoticeNeedsRefresh(
  notifications: readonly { type: string; createdAt: string }[] | null | undefined,
  userFetchedAt: number,
): boolean {
  if (!notifications) return false;
  return notifications.some((notification) => {
    if (!isAccountNoticeType(notification.type)) return false;
    const at = new Date(notification.createdAt).getTime();
    return Number.isFinite(at) && at > userFetchedAt;
  });
}

// ─── Users desk filter (?activity=) ─────────────────────────────────────────

export type ActivityFilter = 'all' | DoctorActivityStatus;

export const ACTIVITY_FILTER_VALUES: readonly ActivityFilter[] = [
  'all',
  'active',
  'warned',
  'inactive',
];

/** The URL key of the filter (also used by the admin bell link). */
export const ACTIVITY_URL_KEY = 'activity';

interface SearchParamsLike {
  get(name: string): string | null;
}

export function readActivityFilter(params: SearchParamsLike): ActivityFilter {
  const value = params.get(ACTIVITY_URL_KEY);
  return value !== null &&
    (ACTIVITY_FILTER_VALUES as readonly string[]).includes(value)
    ? (value as ActivityFilter)
    : 'all';
}

/**
 * The filter to adopt after the address changed under the mounted users
 * desk, or null to keep the current one. Next keeps the page mounted when
 * only the query changes, so the admin bell's « praticien passé en
 * inactif » link clicked on the users desk arrives here. `seen` is the raw
 * ?activity= value last seen in the address; the desk's own replaceState
 * comes back with the value it already holds, so it is never re-adopted.
 */
export function adoptActivityFilter(
  seen: string | null,
  address: string | null,
  current: ActivityFilter,
): ActivityFilter | null {
  if (address === seen) return null;
  const next = readActivityFilter({ get: () => address });
  return next === current ? null : next;
}

/**
 * `current` (a query string, with or without '?') with the filter set,
 * or removed at 'all'; every other parameter is kept as it is.
 */
export function withActivityFilter(
  current: string,
  activity: ActivityFilter,
): string {
  const params = new URLSearchParams(current);
  params.delete(ACTIVITY_URL_KEY);
  if (activity !== 'all') params.set(ACTIVITY_URL_KEY, activity);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** The API value of the filter (GET /users?activity=), undefined at 'all'. */
export function activityParamOf(
  activity: ActivityFilter,
): DoctorActivityStatus | undefined {
  return activity === 'all' ? undefined : activity;
}

// ─── Status, journal, banner ─────────────────────────────────────────────────

/** Whole days until `deadline` (rounded up, never negative). */
export function daysUntil(deadline: string, now: Date = new Date()): number {
  const ms = new Date(deadline).getTime() - now.getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / DAY_MS)) : 0;
}

export type ActivityTone = 'neutral' | 'warning' | 'dormant';

export function activityToneOf(status: DoctorActivityStatus): ActivityTone {
  if (status === 'inactive') return 'dormant';
  return status === 'warned' ? 'warning' : 'neutral';
}

export function activityStatusLabelKey(status: DoctorActivityStatus): string {
  return `accountActivity.status.${status}`;
}

export function activityEventLabelKey(kind: AccountActivityEventKind): string {
  return `accountActivity.events.${kind}`;
}

/** Journal rows written by the sweep (no actor) vs by an admin. */
export function isSystemEvent(event: { actor: unknown }): boolean {
  return event.actor === null;
}

/**
 * What the doctor's dashboard says about his account: dormant (ordering
 * closed), warned (the deadline is within 30 days, with its date), or
 * nothing.
 */
export type ActivityBanner =
  | { kind: 'dormant'; since: string }
  | { kind: 'warned'; deadlineAt: string }
  | null;

export function activityBannerOf(
  user:
    | {
        inactiveSince?: string | null;
        activity?: DoctorActivitySummary | null;
      }
    | null
    | undefined,
): ActivityBanner {
  if (!user) return null;
  if (user.inactiveSince) return { kind: 'dormant', since: user.inactiveSince };
  const activity = user.activity;
  if (
    activity?.ruleEnabled &&
    activity.status === 'warned' &&
    activity.deadlineAt
  ) {
    return { kind: 'warned', deadlineAt: activity.deadlineAt };
  }
  return null;
}

// ─── Dates ───────────────────────────────────────────────────────────────────

type DayLang = 'fr' | 'en';

const DAY_FORMATS = new Map<DayLang, Intl.DateTimeFormat>();
const DATE_TIME_FORMATS = new Map<DayLang, Intl.DateTimeFormat>();

function formatter(
  cache: Map<DayLang, Intl.DateTimeFormat>,
  lang: DayLang,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  let format = cache.get(lang);
  if (!format) {
    format = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
      timeZone: ACTIVITY_TIME_ZONE,
      ...options,
    });
    cache.set(lang, format);
  }
  return format;
}

/** "7 sept. 2026" / "Sep 7, 2026": the Tunis calendar day of an instant. */
export function formatActivityDay(iso: string, lang: DayLang): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return formatter(DAY_FORMATS, lang, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** "7 sept. 2026, 09:30" / "Sep 7, 2026, 09:30" (Tunis time). */
export function formatActivityDateTime(iso: string, lang: DayLang): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return formatter(DATE_TIME_FORMATS, lang, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}
