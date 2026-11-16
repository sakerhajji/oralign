import { OrderType, SupplementalCoverageStatus } from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import {
  BLOCKED_REASON,
  CLOSED_REQUEST_STATUSES,
  PARENT_INELIGIBLE_STATUSES,
} from './supplemental.constants';
import {
  computeCoverage,
  includedRemaining,
  nextCorrectionRank,
} from './supplemental-coverage.policy';
import {
  alignerLimits,
  hasPassedPlanning,
} from './supplemental-aligner-limits';
import { canAuthor } from './supplemental-permissions';
import type {
  ApprovedPlan,
  SupplementalChildSummary,
  SupplementalEligibility,
  SupplementalKindEligibility,
  SupplementalOrderType,
  SupplementalParentSnapshot,
} from './supplemental.types';

export interface EligibilityOptions {
  now: Date;
  caller: Caller;
  /**
   * A child to leave out of the "open request" check: the request being
   * submitted is open itself and must not block its own submission.
   */
  excludeOrderId?: string;
}

/** The newest approved plan of the case, the reference of every request. */
export function latestApprovedPlan(
  parent: Pick<SupplementalParentSnapshot, 'approvedPlans'>,
): ApprovedPlan | null {
  return parent.approvedPlans[0] ?? null;
}

/** An initial, live case that has left draft and was not abandoned. */
export function isEligibleParent(
  parent: Pick<
    SupplementalParentSnapshot,
    'orderType' | 'parentOrderId' | 'deletedAt' | 'status'
  >,
): boolean {
  return (
    parent.orderType === OrderType.initial &&
    parent.parentOrderId === null &&
    parent.deletedAt === null &&
    !PARENT_INELIGIBLE_STATUSES.includes(parent.status)
  );
}

/** The open (not closed, not archived) child of `type`, if any. */
export function openRequestOf(
  children: readonly SupplementalChildSummary[],
  type: SupplementalOrderType,
  excludeOrderId?: string,
): SupplementalChildSummary | null {
  return (
    children.find(
      (child) =>
        child.orderType === type &&
        child.id !== excludeOrderId &&
        !CLOSED_REQUEST_STATUSES.includes(child.status),
    ) ?? null
  );
}

/**
 * Pure eligibility of an initial case for each supplemental kind. The
 * case-level block (still in planning, case not eligible) is separate from
 * the per-kind block (an open request of that kind), and neither ever
 * replaces the coverage reason, which only explains the price.
 */
export function buildEligibility(
  parent: SupplementalParentSnapshot,
  { now, caller, excludeOrderId }: EligibilityOptions,
): SupplementalEligibility {
  const approvedPlan = latestApprovedPlan(parent);
  const reason = !isEligibleParent(parent)
    ? BLOCKED_REASON.PARENT_NOT_ELIGIBLE
    : hasPassedPlanning(parent)
      ? null
      : BLOCKED_REASON.APPROVED_PLAN_REQUIRED;

  const kind = (type: SupplementalOrderType): SupplementalKindEligibility => {
    const open = openRequestOf(parent.children, type, excludeOrderId);
    const blockedReason =
      reason ?? (open ? BLOCKED_REASON.ACTIVE_REQUEST_EXISTS : null);
    const { status, reason: coverageReason } = computeCoverage(
      type,
      parent,
      now,
    );
    const isCorrection = type === OrderType.additional_aligners;
    return {
      allowed: blockedReason === null,
      blockedReason,
      coverageStatus: status,
      coverageReason,
      activeRequestId: open?.id ?? null,
      // The number an approval would assign (same rule as the review).
      correctionNumber:
        status === SupplementalCoverageStatus.included
          ? nextCorrectionRank(parent.correctionNumbers)
          : null,
      includedRemaining: isCorrection
        ? includedRemaining(parent.quotation, parent.consumedCorrections)
        : null,
    };
  };

  return {
    parentOrderId: parent.id,
    canCreate: canAuthor(parent, caller),
    allowed: reason === null,
    reason,
    coverageStartedAt: parent.coverageStartedAt,
    coverageExpiresAt: parent.coverageExpiresAt,
    approvedPlan,
    alignerLimits: alignerLimits(parent),
    deliveredUpTo: parent.deliveredUpTo,
    requests: {
      additional_aligners: kind(OrderType.additional_aligners),
      replacement: kind(OrderType.replacement),
      transfer_template: kind(OrderType.transfer_template),
      warranty: kind(OrderType.warranty),
    },
  };
}
