import {
  type AccountActivityEventKind,
  type Prisma,
  UserRole,
} from '@prisma/client';

/**
 * Doctor inactivity (spec §5): the response shapes P-E builds against,
 * frozen in P0 (CONTRACT.md §2.7) and mirrored in
 * oralign-frontend/src/lib/types/entities.ts. Dates are ISO 8601 strings
 * (UTC); screens show them in Africa/Tunis.
 *
 * Rule (DECISIONS §5): last activity = MAX(COALESCE(submittedAt, createdAt))
 * over the doctor's orders that are submitted or past draft (initial and
 * supplemental, archived and cancelled included); anchor = max(last
 * activity, User.activityResetAt, User.approvedAt ?? User.createdAt);
 * deadline = anchor + CompanyBillingSettings.inactivityMonths calendar
 * months (clamped to the month's last day). Only approved, undeleted
 * dentists are concerned. Dormant = User.inactiveSince set; User.isActive
 * is never touched.
 */

/** active: deadline > now + 30 d; warned: within 30 days; inactive: dormant. */
export type DoctorActivityStatus = 'active' | 'warned' | 'inactive';

/** The days before the deadline the sweep warns at. */
export const INACTIVITY_WARNING_DAYS = [30, 7] as const;

/** Defaults of the rollout settings (CompanyBillingSettings). */
export const DEFAULT_INACTIVITY_MONTHS = 6;

/**
 * THE "dormant doctor" filter, shared so every counter agrees: the users
 * stats `dormant` (P-E) and the admin sidebar badge `dormantDoctors` (P-B,
 * admin-dashboard.service.ts) both count it. Dormant = a dentist account,
 * not soft-deleted, whose User.inactiveSince is set (isActive untouched).
 */
export const DORMANT_DOCTOR_WHERE = {
  role: UserRole.dentist,
  deletedAt: null,
  inactiveSince: { not: null },
} satisfies Prisma.UserWhereInput;

/** Activity block of a doctor (users list / detail, GET users/:id/activity). */
export interface DoctorActivitySummary {
  status: DoctorActivityStatus;
  /** MAX(COALESCE(submittedAt, createdAt)) of the counted orders; null = none. */
  lastSubmittedOrderAt: string | null;
  anchorAt: string;
  /** anchorAt + inactivityMonths; null while the rule is switched off. */
  deadlineAt: string | null;
  inactiveSince: string | null;
  activityResetAt: string | null;
  /** CompanyBillingSettings.inactivityRuleEnabled at read time. */
  ruleEnabled: boolean;
}

/** One journal row (GET users/:id/activity-events). */
export interface AccountActivityEventDto {
  id: string;
  kind: AccountActivityEventKind;
  /**
   * The cycle key for warning_30d / warning_7d / deactivated (the activity
   * anchor, or the rule's switch-on / the last unblock when later); the
   * event instant for the admin kinds.
   */
  anchorAt: string;
  deadlineAt: string;
  /** null = the system (the sweep). */
  actor: { id: string | null; name: string; role: UserRole | null } | null;
  reason: string | null;
  createdAt: string;
}

/** POST users/:id/reactivate body. */
export interface ReactivateDoctorBody {
  /** 3-500 characters once trimmed (400 REACTIVATION_REASON_REQUIRED). */
  reason: string;
}

/** POST admin/doctor-activity/sweep (e2e / support: run the sweep now). */
export interface DoctorActivitySweepResult {
  ruleEnabled: boolean;
  scanned: number;
  warned30: number;
  warned7: number;
  deactivated: number;
}
