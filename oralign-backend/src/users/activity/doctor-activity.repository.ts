import {
  AccountActivityEventKind,
  OrderStatus,
  Prisma,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import { DEFAULT_INACTIVITY_MONTHS } from './doctor-activity.contract';
import {
  activityAnchor,
  clampInactivityMonths,
  cycleOf,
  lastActivityFrom,
  noticeFloorOf,
  type ActivityAccount,
  type ActivityCycle,
} from './doctor-activity.rules';

/**
 * The reads behind the inactivity rule, shared by the sweep, the users
 * desk and the reactivation. Plain functions over a Prisma client or a
 * transaction (no DI), each one indexed query whatever the number of
 * doctors: the page / chunk ids go in one `in` list.
 */

type ActivityDb = Pick<
  Prisma.TransactionClient,
  'user' | 'dentalOrder' | 'accountActivityEvent' | 'companyBillingSettings'
>;

/** The rollout settings (CompanyBillingSettings, the active row). */
export interface InactivitySettings {
  ruleEnabled: boolean;
  months: number;
  /**
   * When the switch last went from off to on (null = never): a notice
   * floor for every doctor, see cycleKeyOf.
   */
  enabledAt: Date | null;
}

export async function readInactivitySettings(
  db: Pick<ActivityDb, 'companyBillingSettings'>,
): Promise<InactivitySettings> {
  const row = await db.companyBillingSettings.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: {
      inactivityRuleEnabled: true,
      inactivityMonths: true,
      inactivityRuleEnabledAt: true,
    },
  });
  return {
    ruleEnabled: row?.inactivityRuleEnabled === true,
    months: row
      ? clampInactivityMonths(row.inactivityMonths)
      : DEFAULT_INACTIVITY_MONTHS,
    enabledAt: row?.inactivityRuleEnabledAt ?? null,
  };
}

/** The account columns of the rule (ActivityAccount) + the id. */
export const ACTIVITY_ACCOUNT_SELECT = {
  id: true,
  role: true,
  verificationStatus: true,
  isActive: true,
  deletedAt: true,
  createdAt: true,
  approvedAt: true,
  activityResetAt: true,
  inactiveSince: true,
} satisfies Prisma.UserSelect;

export type ActivityAccountRow = ActivityAccount & { id: string };

/**
 * "Counted" orders: submitted at least once, or past draft (legacy rows
 * may lack submittedAt). Initial and supplemental, archived and cancelled
 * included: no orderType / deletedAt filter on purpose.
 */
export const COUNTED_ORDER_WHERE: Prisma.DentalOrderWhereInput = {
  OR: [{ submittedAt: { not: null } }, { status: { not: OrderStatus.draft } }],
};

/**
 * Last activity per doctor (lastActivityFrom over one groupBy). Doctors
 * without a counted order are absent from the map.
 */
export async function lastActivityByDoctor(
  db: Pick<ActivityDb, 'dentalOrder'>,
  doctorIds: readonly string[],
): Promise<Map<string, Date>> {
  const result = new Map<string, Date>();
  if (doctorIds.length === 0) return result;
  const groups = await db.dentalOrder.groupBy({
    by: ['doctorId'],
    where: { doctorId: { in: [...doctorIds] }, ...COUNTED_ORDER_WHERE },
    _max: { submittedAt: true, createdAt: true },
  });
  for (const group of groups) {
    const last = lastActivityFrom({
      submittedAt: group._max.submittedAt,
      createdAt: group._max.createdAt,
    });
    if (last) result.set(group.doctorId, last);
  }
  return result;
}

/**
 * A journal row the current cycle depends on: a warning (warningsOfCycle
 * keeps the ones of the cycle key) or an unblock (a notice floor).
 */
export interface CycleEventRow {
  userId: string;
  kind: AccountActivityEventKind;
  anchorAt: Date;
  createdAt: Date;
}

/** The journal kinds a cycle depends on. */
export const CYCLE_EVENT_KINDS: readonly AccountActivityEventKind[] = [
  AccountActivityEventKind.warning_30d,
  AccountActivityEventKind.warning_7d,
  AccountActivityEventKind.unblocked,
];

/**
 * The warning and unblock rows of these doctors, in one query. `since`
 * (the oldest anchor of the batch) drops the rows no current cycle can
 * use: a warning is journaled at its cycle key, never before the anchor,
 * and an unblock older than a doctor's anchor cannot move his cycle key
 * (an unblock's anchorAt is its own instant).
 */
export async function cycleEventsByDoctor(
  db: Pick<ActivityDb, 'accountActivityEvent'>,
  doctorIds: readonly string[],
  since?: Date,
): Promise<Map<string, CycleEventRow[]>> {
  const result = new Map<string, CycleEventRow[]>();
  if (doctorIds.length === 0) return result;
  const rows = await db.accountActivityEvent.findMany({
    where: {
      userId: { in: [...doctorIds] },
      kind: { in: [...CYCLE_EVENT_KINDS] },
      ...(since ? { anchorAt: { gte: since } } : {}),
    },
    select: { userId: true, kind: true, anchorAt: true, createdAt: true },
  });
  for (const row of rows) {
    const list = result.get(row.userId) ?? [];
    list.push(row);
    result.set(row.userId, list);
  }
  return result;
}

/** The latest unblock among a doctor's cycle rows (null = none). */
function lastUnblockedAt(rows: readonly CycleEventRow[]): Date | null {
  let last: Date | null = null;
  for (const row of rows) {
    if (
      row.kind === AccountActivityEventKind.unblocked &&
      (!last || row.createdAt.getTime() > last.getTime())
    ) {
      last = row.createdAt;
    }
  }
  return last;
}

/**
 * The current cycle of each account (cycleOf), in two queries whatever the
 * number of accounts: the last activities, then the warning and unblock
 * rows (skipped while the rule is off: no warning then). Each account's
 * notice floor is the rule's last switch-on or his own last unblock,
 * whichever is later (noticeFloorOf).
 */
export async function loadCycles(
  db: Pick<ActivityDb, 'dentalOrder' | 'accountActivityEvent'>,
  accounts: readonly (Pick<
    ActivityAccount,
    'createdAt' | 'approvedAt' | 'activityResetAt'
  > & { id: string })[],
  settings: InactivitySettings,
): Promise<Map<string, ActivityCycle>> {
  const cycles = new Map<string, ActivityCycle>();
  if (accounts.length === 0) return cycles;
  const ids = accounts.map((account) => account.id);
  const last = await lastActivityByDoctor(db, ids);
  const anchors = accounts.map((account) =>
    activityAnchor({
      lastSubmittedOrderAt: last.get(account.id) ?? null,
      activityResetAt: account.activityResetAt,
      approvedAt: account.approvedAt,
      createdAt: account.createdAt,
    }),
  );
  const oldest = new Date(Math.min(...anchors.map((a) => a.getTime())));
  const events = settings.ruleEnabled
    ? await cycleEventsByDoctor(db, ids, oldest)
    : new Map<string, CycleEventRow[]>();
  for (const account of accounts) {
    const rows = events.get(account.id) ?? [];
    cycles.set(
      account.id,
      cycleOf({
        account,
        lastSubmittedOrderAt: last.get(account.id) ?? null,
        warningRows: rows,
        months: settings.months,
        noticeFloor: noticeFloorOf({
          ruleEnabledAt: settings.enabledAt,
          lastUnblockedAt: lastUnblockedAt(rows),
        }),
      }),
    );
  }
  return cycles;
}

/** Who the sweep and the "warned" filter consider (isRuleSubject, not dormant). */
export const ACTIVE_RULE_SUBJECT_WHERE = {
  role: UserRole.dentist,
  verificationStatus: VerificationStatus.approved,
  isActive: true,
  deletedAt: null,
  inactiveSince: null,
} satisfies Prisma.UserWhereInput;

/** A rule subject as the sweep reads it (the notice needs name / e-mail / language). */
export const RULE_SUBJECT_SELECT = {
  ...ACTIVITY_ACCOUNT_SELECT,
  fullName: true,
  email: true,
  preferredLanguage: true,
} satisfies Prisma.UserSelect;

export type RuleSubjectRow = Prisma.UserGetPayload<{
  select: typeof RULE_SUBJECT_SELECT;
}>;

/**
 * The live rule subjects, in id-ordered chunks (keyset pagination, so the
 * whole base is never loaded at once).
 */
export async function* ruleSubjectChunks(
  db: Pick<ActivityDb, 'user'>,
  chunkSize: number,
): AsyncGenerator<RuleSubjectRow[]> {
  let cursor: string | null = null;
  for (;;) {
    const rows: RuleSubjectRow[] = await db.user.findMany({
      where: {
        ...ACTIVE_RULE_SUBJECT_WHERE,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: chunkSize,
      select: RULE_SUBJECT_SELECT,
    });
    if (rows.length === 0) return;
    yield rows;
    if (rows.length < chunkSize) return;
    cursor = rows[rows.length - 1].id;
  }
}
