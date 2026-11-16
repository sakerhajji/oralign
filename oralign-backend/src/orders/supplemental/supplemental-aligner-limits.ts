import { ArchTreatment, QuotationStatus } from '@prisma/client';
import { PLANNING_PASSED_STATUSES } from './supplemental.constants';
import type {
  AlignerLimits,
  SingleArch,
  SupplementalParentSnapshot,
} from './supplemental.types';

type LimitsSource = Pick<
  SupplementalParentSnapshot,
  'approvedPlans' | 'quotation' | 'totalAligners'
>;

const NO_LIMITS: AlignerLimits = { upper: null, lower: null, source: null };

/**
 * Highest aligner number per arch a request may name, from the best
 * reference the case has:
 *   1. the latest approved plan's per-arch totals (the clinical count);
 *   2. otherwise the pack snapshot on the quotation (`maxStepsPerArch`,
 *      what the case was sold with), unless the pack is unlimited;
 *   3. otherwise the case's own `totalAligners`.
 * Null when none is known: only the delivery history then bounds numbers.
 */
export function alignerLimits(parent: LimitsSource): AlignerLimits {
  const plan = parent.approvedPlans[0];
  if (
    plan &&
    (plan.totalUpperAligners !== null || plan.totalLowerAligners !== null)
  ) {
    return {
      upper: plan.totalUpperAligners ?? parent.totalAligners,
      lower: plan.totalLowerAligners ?? parent.totalAligners,
      source: 'approved_plan',
    };
  }
  const quote = parent.quotation;
  if (quote && !quote.isUnlimitedSteps && quote.maxStepsPerArch) {
    return {
      upper: quote.maxStepsPerArch,
      lower: quote.maxStepsPerArch,
      source: 'pack',
    };
  }
  if (parent.totalAligners) {
    return {
      upper: parent.totalAligners,
      lower: parent.totalAligners,
      source: 'case',
    };
  }
  return NO_LIMITS;
}

/** The limit of one arch (see alignerLimits). */
export function alignerLimitFor(
  arch: SingleArch,
  parent: LimitsSource,
): number | null {
  const limits = alignerLimits(parent);
  return arch === ArchTreatment.upper ? limits.upper : limits.lower;
}

/**
 * True once the case is past planning: an approved plan is on file, the
 * case reached an accepted / quoted / paid / made / delivered status, or its
 * quotation was approved. Plans are sometimes made outside ORALIGN, so the
 * plan row alone is not required.
 */
export function hasPassedPlanning(
  parent: Pick<
    SupplementalParentSnapshot,
    'approvedPlans' | 'status' | 'quotation'
  >,
): boolean {
  return (
    parent.approvedPlans.length > 0 ||
    PLANNING_PASSED_STATUSES.includes(parent.status) ||
    parent.quotation?.status === QuotationStatus.approved
  );
}
