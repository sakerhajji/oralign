import {
  type AccountActivityEventKind,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import { addMonthsClamped } from '../../orders/coverage-window';
import {
  DEFAULT_INACTIVITY_MONTHS,
  type DoctorActivityStatus,
} from './doctor-activity.contract';

/**
 * The pure rules of the doctor inactivity programme (spec §5, DECISIONS
 * §5). No I/O: the repository loads the facts, the sweep and the users
 * desk call these, and the specs pin them.
 *
 * Vocabulary:
 * - last activity: MAX(COALESCE(submittedAt, createdAt)) over the doctor's
 *   orders that were submitted once or are past draft (initial and
 *   supplemental, archived and cancelled included);
 * - anchor: max(last activity, activityResetAt, approvedAt ?? createdAt);
 *   it starts a CYCLE and sets the deadline;
 * - notice floor: the latest instant from which earlier warnings stop
 *   counting: the rule's last switch-on (inactivityRuleEnabledAt) and the
 *   account's last unblock. A warning sent before the rule was switched
 *   off, or before the account was blocked, promised a deadline that
 *   lapsed while nothing ran; honouring it would deactivate the doctor
 *   with no fresh notice;
 * - cycle key: max(anchor, notice floor). The warnings and the
 *   deactivation are journaled with anchorAt = the cycle key, so the
 *   AccountActivityEvent unique key (userId, kind, anchorAt) makes each
 *   happen at most once per cycle, and a re-enabled rule or an unblock
 *   opens a fresh cycle that is warned again (30 then 7 days);
 * - nominal deadline: anchor + inactivityMonths calendar months (clamped);
 * - effective deadline: the nominal one, pushed so that a doctor always
 *   gets at least 30 days after the 30-day warning and 7 days after the
 *   7-day warning. This is also what makes "the first run after enabling
 *   only warns": a doctor already past his nominal deadline gets the
 *   30-day warning first, with the deadline moved to now + 30 days.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Days of notice the two warnings give (spec: 30 and 7 days). */
export const FIRST_WARNING_DAYS = 30;
export const LAST_WARNING_DAYS = 7;

/** Bounds of CompanyBillingSettings.inactivityMonths (DTO: int 1-24). */
export const MIN_INACTIVITY_MONTHS = 1;
export const MAX_INACTIVITY_MONTHS = 24;

/** A stored month count, made safe for the arithmetic (default 6). */
export function clampInactivityMonths(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return DEFAULT_INACTIVITY_MONTHS;
  }
  return Math.min(
    MAX_INACTIVITY_MONTHS,
    Math.max(MIN_INACTIVITY_MONTHS, value),
  );
}

/** The account columns the rule reads. */
export interface ActivityAccount {
  role: UserRole;
  verificationStatus: VerificationStatus;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  approvedAt: Date | null;
  activityResetAt: Date | null;
  inactiveSince: Date | null;
}

/**
 * Who the sweep warns and deactivates: approved, live (not archived, not
 * blocked) dentists. A blocked account cannot sign in, so warning it to
 * "place an order" would be absurd; once unblocked it is warned again with
 * the full 30-day notice (the unblock is a notice floor: it opens a fresh
 * cycle, see cycleKeyOf). Pending and rejected registrations are not
 * concerned either.
 */
export function isRuleSubject(account: ActivityAccount): boolean {
  return (
    account.role === UserRole.dentist &&
    account.verificationStatus === VerificationStatus.approved &&
    account.isActive &&
    account.deletedAt === null
  );
}

/**
 * The last activity from the per-doctor aggregate of the counted orders
 * (`_max.submittedAt`, `_max.createdAt`). A counted order is created
 * before it is submitted, so max(max submittedAt, max createdAt) equals
 * MAX(COALESCE(submittedAt, createdAt)): the createdAt of a submitted
 * order never exceeds its own submittedAt, and the createdAt term only
 * decides for the legacy rows past draft that carry no submittedAt.
 */
export function lastActivityFrom(max: {
  submittedAt: Date | null;
  createdAt: Date | null;
}): Date | null {
  return latest([max.submittedAt, max.createdAt]);
}

/** The anchor of the current cycle. */
export function activityAnchor(input: {
  lastSubmittedOrderAt: Date | null;
  activityResetAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
}): Date {
  return (
    latest([
      input.lastSubmittedOrderAt,
      input.activityResetAt,
      input.approvedAt ?? input.createdAt,
    ]) ?? input.createdAt
  );
}

/**
 * The key of the current cycle: the anchor, moved forward to the notice
 * floor (the rule's last switch-on, the account's last unblock) when that
 * is later. Only warnings journaled under this key count.
 */
export function cycleKeyOf(anchor: Date, noticeFloor: Date | null): Date {
  return latest([anchor, noticeFloor]) ?? anchor;
}

/**
 * The notice floor of one account: the rule's last switch-on
 * (CompanyBillingSettings.inactivityRuleEnabledAt) or the account's last
 * unblock, whichever is later; null when neither happened.
 */
export function noticeFloorOf(input: {
  ruleEnabledAt: Date | null;
  lastUnblockedAt: Date | null;
}): Date | null {
  return latest([input.ruleEnabledAt, input.lastUnblockedAt]);
}

/** anchor + months, calendar months clamped to the end of the month. */
export function nominalDeadline(anchor: Date, months: number): Date {
  return addMonthsClamped(anchor, clampInactivityMonths(months));
}

/** When the two warnings of the CURRENT cycle were sent (null = not yet). */
export interface CycleWarnings {
  warned30At: Date | null;
  warned7At: Date | null;
}

export const NO_WARNINGS: CycleWarnings = { warned30At: null, warned7At: null };

/** The nominal deadline, pushed by the notice the warnings promised. */
export function effectiveDeadline(
  nominal: Date,
  warnings: CycleWarnings,
): Date {
  const candidates = [nominal];
  if (warnings.warned30At) {
    candidates.push(addDays(warnings.warned30At, FIRST_WARNING_DAYS));
  }
  if (warnings.warned7At) {
    candidates.push(addDays(warnings.warned7At, LAST_WARNING_DAYS));
  }
  return latest(candidates) ?? nominal;
}

/** What the sweep does for one doctor now (at most ONE step per pass). */
export type SweepAction =
  | {
      kind: Extract<AccountActivityEventKind, 'warning_30d' | 'warning_7d'>;
      /** The deadline the warning announces (the effective one after it). */
      deadlineAt: Date;
      daysLeft: number;
    }
  | {
      kind: Extract<AccountActivityEventKind, 'deactivated'>;
      deadlineAt: Date;
    };

/**
 * The next step of the cycle, or null when nothing is due:
 * 1. no 30-day warning yet and the deadline is within 30 days → warn
 *    (the deadline becomes at least now + 30 days);
 * 2. else no 7-day warning yet and the deadline is within 7 days → warn
 *    (the deadline becomes at least now + 7 days);
 * 3. else the deadline is reached → deactivate.
 * Steps never collapse: a late or missed pass only shifts the deadline,
 * so nobody is ever deactivated without both warnings and their notice.
 */
export function nextSweepAction(input: {
  nominal: Date;
  warnings: CycleWarnings;
  now: Date;
}): SweepAction | null {
  const { nominal, warnings, now } = input;
  const deadline = effectiveDeadline(nominal, warnings);
  if (!warnings.warned30At) {
    if (now.getTime() < deadline.getTime() - FIRST_WARNING_DAYS * DAY_MS) {
      return null;
    }
    const announced = latest([deadline, addDays(now, FIRST_WARNING_DAYS)])!;
    return {
      kind: 'warning_30d',
      deadlineAt: announced,
      daysLeft: daysUntil(announced, now),
    };
  }
  if (!warnings.warned7At) {
    if (now.getTime() < deadline.getTime() - LAST_WARNING_DAYS * DAY_MS) {
      return null;
    }
    const announced = latest([deadline, addDays(now, LAST_WARNING_DAYS)])!;
    return {
      kind: 'warning_7d',
      deadlineAt: announced,
      daysLeft: daysUntil(announced, now),
    };
  }
  return now.getTime() >= deadline.getTime()
    ? { kind: 'deactivated', deadlineAt: deadline }
    : null;
}

/**
 * The deadline a reader is shown NOW (users desk, the doctor's banner):
 * the effective deadline, pushed by the notice a warning still owed will
 * give (the sweep announces at least now + 30 d with the first warning,
 * now + 7 d with the second), and never in the past. So between switching
 * the rule on and the next pass, a doctor long past his nominal deadline
 * reads "in 30 days" (what the first pass will announce), never an
 * already-passed date. Display only: the sweep acts on nextSweepAction.
 */
export function projectedDeadline(
  cycle: Pick<ActivityCycle, 'deadline' | 'warnings'>,
  now: Date,
): Date {
  const notice = !cycle.warnings.warned30At
    ? FIRST_WARNING_DAYS
    : !cycle.warnings.warned7At
      ? LAST_WARNING_DAYS
      : 0;
  return latest([cycle.deadline, addDays(now, notice)])!;
}

/**
 * The status the users desk shows: inactive = dormant (inactiveSince set,
 * whatever the switch); warned = the deadline is within 30 days (or past,
 * the sweep not having acted yet); active otherwise, and whenever the rule
 * does not apply (deadline null).
 */
export function activityStatusOf(input: {
  inactiveSince: Date | null;
  deadlineAt: Date | null;
  now: Date;
}): DoctorActivityStatus {
  if (input.inactiveSince) return 'inactive';
  if (!input.deadlineAt) return 'active';
  return input.deadlineAt.getTime() - input.now.getTime() <=
    FIRST_WARNING_DAYS * DAY_MS
    ? 'warned'
    : 'active';
}

/** Whole days left until `deadline` (rounded up, never negative). */
export function daysUntil(deadline: Date, now: Date): number {
  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS));
}

/**
 * The warnings of ONE cycle from the doctor's warning rows: only rows
 * whose anchorAt is exactly the cycle key count (an older cycle's
 * warning, or one sent before the rule was switched off or the account
 * blocked, says nothing about this one).
 */
export function warningsOfCycle(
  rows: readonly {
    kind: AccountActivityEventKind;
    anchorAt: Date;
    createdAt: Date;
  }[],
  cycleKey: Date,
): CycleWarnings {
  const of = (kind: AccountActivityEventKind): Date | null =>
    rows.find(
      (row) =>
        row.kind === kind && row.anchorAt.getTime() === cycleKey.getTime(),
    )?.createdAt ?? null;
  return { warned30At: of('warning_30d'), warned7At: of('warning_7d') };
}

/** One doctor's current cycle, everything derived from his facts. */
export interface ActivityCycle {
  lastSubmittedOrderAt: Date | null;
  /** The activity anchor: what the deadline counts from (and the users desk shows). */
  anchor: Date;
  /** The journal key of this cycle's warnings and deactivation (cycleKeyOf). */
  cycleKey: Date;
  nominal: Date;
  warnings: CycleWarnings;
  /** The effective deadline (see effectiveDeadline). */
  deadline: Date;
}

export function cycleOf(input: {
  account: Pick<
    ActivityAccount,
    'createdAt' | 'approvedAt' | 'activityResetAt'
  >;
  lastSubmittedOrderAt: Date | null;
  warningRows: Parameters<typeof warningsOfCycle>[0];
  months: number;
  /** The rule's last switch-on / the account's last unblock (null = none). */
  noticeFloor?: Date | null;
}): ActivityCycle {
  const anchor = activityAnchor({
    lastSubmittedOrderAt: input.lastSubmittedOrderAt,
    activityResetAt: input.account.activityResetAt,
    approvedAt: input.account.approvedAt,
    createdAt: input.account.createdAt,
  });
  const cycleKey = cycleKeyOf(anchor, input.noticeFloor ?? null);
  const nominal = nominalDeadline(anchor, input.months);
  const warnings = warningsOfCycle(input.warningRows, cycleKey);
  return {
    lastSubmittedOrderAt: input.lastSubmittedOrderAt,
    anchor,
    cycleKey,
    nominal,
    warnings,
    deadline: effectiveDeadline(nominal, warnings),
  };
}

function addDays(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * DAY_MS);
}

function latest(values: readonly (Date | null | undefined)[]): Date | null {
  let best: Date | null = null;
  for (const value of values) {
    if (value && (!best || value.getTime() > best.getTime())) best = value;
  }
  return best;
}
