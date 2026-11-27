import type { AccountActivityEvent } from '@prisma/client';
import type {
  AccountActivityEventDto,
  DoctorActivitySummary,
} from './doctor-activity.contract';
import {
  activityStatusOf,
  isRuleSubject,
  projectedDeadline,
  type ActivityAccount,
  type ActivityCycle,
} from './doctor-activity.rules';

/** Shown for a journal row whose admin account was purged (actorId SetNull). */
export const DELETED_ACTOR_LABEL = 'Compte supprimé';

/**
 * The activity block of a dentist (CONTRACT §2.7). `deadlineAt` is the
 * projected deadline (projectedDeadline: the date the warnings announce,
 * never a past one), and null whenever no deadline runs: the rule is
 * switched off, the account is not concerned (not approved, blocked,
 * archived) or it is already dormant.
 */
export function toActivitySummary(input: {
  account: ActivityAccount;
  cycle: ActivityCycle;
  ruleEnabled: boolean;
  now: Date;
}): DoctorActivitySummary {
  const { account, cycle, ruleEnabled, now } = input;
  const runs =
    ruleEnabled && isRuleSubject(account) && account.inactiveSince === null;
  const deadlineAt = runs ? projectedDeadline(cycle, now) : null;
  return {
    status: activityStatusOf({
      inactiveSince: account.inactiveSince,
      deadlineAt,
      now,
    }),
    lastSubmittedOrderAt: iso(cycle.lastSubmittedOrderAt),
    anchorAt: cycle.anchor.toISOString(),
    deadlineAt: iso(deadlineAt),
    inactiveSince: iso(account.inactiveSince),
    activityResetAt: iso(account.activityResetAt),
    ruleEnabled,
  };
}

/** One journal row. The reason is shown to admins only (the route is admin-only). */
export function toActivityEventDto(
  row: Pick<
    AccountActivityEvent,
    | 'id'
    | 'kind'
    | 'anchorAt'
    | 'deadlineAt'
    | 'actorId'
    | 'actorName'
    | 'actorRole'
    | 'reason'
    | 'createdAt'
  >,
): AccountActivityEventDto {
  const byAdmin = row.actorId !== null || row.actorName !== null;
  return {
    id: row.id,
    kind: row.kind,
    anchorAt: row.anchorAt.toISOString(),
    deadlineAt: row.deadlineAt.toISOString(),
    actor: byAdmin
      ? {
          id: row.actorId,
          name: row.actorName ?? DELETED_ACTOR_LABEL,
          role: row.actorRole,
        }
      : null,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
