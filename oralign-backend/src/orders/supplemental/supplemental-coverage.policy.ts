import {
  OrderType,
  QuotationPaymentStatus,
  SupplementalCoverageStatus,
  SupplementalReviewStatus,
  type OrderStatus,
} from '@prisma/client';
import { BadRequestException } from '../../common/exceptions/app.exception';
import { reviewStatePatch, type ReviewStateSource } from './review-state';
import {
  ABANDONED_ORDER_STATUSES,
  COVERAGE_REASON,
  SUPPLEMENTAL_ERROR,
} from './supplemental.constants';
import type {
  CoverageQuotation,
  SupplementalCoverage,
  SupplementalOrderType,
  SupplementalReviewDecision,
} from './supplemental.types';

/**
 * Coverage = who pays for a supplemental request. Pure rules: the server
 * computes the coverage at creation and again at submission; an admin
 * settles it at review, within the choices allowed for the kind.
 *
 * Unknown is never free: whatever the server cannot establish from
 * structured data (no paid pack snapshot, no coverage window, no allowance
 * configured) goes to the admin (review_required), never to "included".
 */

/** What the correction coverage reads about the initial case. */
export interface CorrectionCoverageInput {
  coverageStartedAt: Date | null;
  coverageExpiresAt: Date | null;
  quotation: CoverageQuotation | null;
  /** countConsumedCorrections for the case, the request itself excluded. */
  consumedCorrections: number;
}

const coverage = (
  status: SupplementalCoverageStatus,
  reason: SupplementalCoverage['reason'],
): SupplementalCoverage => ({ status, reason });

/** Coverage of an additional-aligner request (a correction of the pack). */
export function correctionCoverage(
  parent: CorrectionCoverageInput,
  now: Date,
): SupplementalCoverage {
  const quote = parent.quotation;
  if (!quote || quote.paymentStatus !== QuotationPaymentStatus.paid) {
    return coverage(
      SupplementalCoverageStatus.review_required,
      COVERAGE_REASON.PAID_PACK_SNAPSHOT_MISSING,
    );
  }
  if (
    !quote.treatmentValidityMonths ||
    !parent.coverageStartedAt ||
    !parent.coverageExpiresAt
  ) {
    return coverage(
      SupplementalCoverageStatus.review_required,
      COVERAGE_REASON.STRUCTURED_VALIDITY_UNKNOWN,
    );
  }
  if (now.getTime() > parent.coverageExpiresAt.getTime()) {
    return coverage(
      SupplementalCoverageStatus.chargeable,
      COVERAGE_REASON.COVERAGE_EXPIRED,
    );
  }
  if (quote.isUnlimitedCorrections) {
    return coverage(
      SupplementalCoverageStatus.included,
      COVERAGE_REASON.WITHIN_PACK_ALLOWANCE,
    );
  }
  if (quote.includedCorrections === null) {
    return coverage(
      SupplementalCoverageStatus.review_required,
      COVERAGE_REASON.ALLOWANCE_UNKNOWN,
    );
  }
  return parent.consumedCorrections < quote.includedCorrections
    ? coverage(
        SupplementalCoverageStatus.included,
        COVERAGE_REASON.WITHIN_PACK_ALLOWANCE,
      )
    : coverage(
        SupplementalCoverageStatus.chargeable,
        COVERAGE_REASON.INCLUDED_CORRECTIONS_EXHAUSTED,
      );
}

/** The server-computed coverage of a new request of `type`. */
export function computeCoverage(
  type: SupplementalOrderType,
  parent: CorrectionCoverageInput,
  now: Date,
): SupplementalCoverage {
  switch (type) {
    case OrderType.additional_aligners:
      return correctionCoverage(parent, now);
    case OrderType.replacement:
    case OrderType.transfer_template:
      return coverage(
        SupplementalCoverageStatus.chargeable,
        COVERAGE_REASON.REQUIRES_QUOTE,
      );
    case OrderType.warranty:
      return coverage(
        SupplementalCoverageStatus.review_required,
        COVERAGE_REASON.WARRANTY_REVIEW_REQUIRED,
      );
  }
}

/** The paid replacement a doctor accepted after a rejected warranty. */
export const CONVERTED_WARRANTY_COVERAGE: SupplementalCoverage = coverage(
  SupplementalCoverageStatus.chargeable,
  COVERAGE_REASON.WARRANTY_REJECTED_DOCTOR_CONFIRMED,
);

/** Corrections still included in the pack (null: not configured). */
export function includedRemaining(
  quotation: CoverageQuotation | null,
  consumedCorrections: number,
): number | 'unlimited' | null {
  if (!quotation) return null;
  if (quotation.isUnlimitedCorrections) return 'unlimited';
  if (quotation.includedCorrections === null) return null;
  return Math.max(0, quotation.includedCorrections - consumedCorrections);
}

/** True when `consumed` corrections leave no included one in the pack. */
export function isAllowanceExhausted(
  quotation: CoverageQuotation | null,
  consumedCorrections: number,
): boolean {
  return includedRemaining(quotation, consumedCorrections) === 0;
}

/**
 * Number of the next included correction: one above the highest number a
 * live correction carries (consumedCorrectionNumbers). Never the count + 1:
 * once a lower-numbered correction is given back, that would hand out a
 * number a live one still carries. The allowance stays checked on the count.
 */
export function nextCorrectionRank(liveNumbers: readonly number[]): number {
  return Math.max(0, ...liveNumbers) + 1;
}

/**
 * The number a correction takes when it comes back into use: its own,
 * unless another live correction was given that number meanwhile.
 */
export function reclaimedCorrectionNumber(
  own: number | null,
  liveNumbers: readonly number[],
): number {
  return own !== null && !liveNumbers.includes(own)
    ? own
    : nextCorrectionRank(liveNumbers);
}

/** The review side of a request, as the correction rules read it. */
export interface CorrectionHolder {
  reviewStatus: SupplementalReviewStatus;
  coverageStatus: SupplementalCoverageStatus;
}

/**
 * True when a child in `orderStatus` uses one included correction: the
 * rule countConsumedCorrections applies in SQL, on one loaded request.
 */
export function holdsCorrection(
  orderType: OrderType,
  orderStatus: OrderStatus,
  request: CorrectionHolder,
): boolean {
  return (
    orderType === OrderType.additional_aligners &&
    request.reviewStatus === SupplementalReviewStatus.approved &&
    request.coverageStatus === SupplementalCoverageStatus.included &&
    !ABANDONED_ORDER_STATUSES.includes(orderStatus)
  );
}

/**
 * True when an admin override from `from` to `to` puts back into use the
 * correction a cancellation gave back (cancelled → fabrication, and
 * cancelled → finished too, which is no reopening). The review state the
 * override writes (reviewStatePatch) is taken into account: → submitted or
 * → draft clears the approval, so nothing comes back.
 */
export function regainsCorrection(
  orderType: OrderType,
  request: CorrectionHolder & ReviewStateSource,
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  const next = reviewStatePatch(to, request);
  const after = next
    ? { ...request, reviewStatus: next.reviewStatus }
    : request;
  return (
    !holdsCorrection(orderType, from, request) &&
    holdsCorrection(orderType, to, after)
  );
}

/**
 * Coverage an approval may record, per kind. A warranty has no choice:
 * the decision IS the coverage (WARRANTY_DECISION_COVERAGE).
 */
export const APPROVABLE_COVERAGE: Record<
  Exclude<SupplementalOrderType, 'warranty'>,
  readonly SupplementalCoverageStatus[]
> = {
  additional_aligners: [
    SupplementalCoverageStatus.included,
    SupplementalCoverageStatus.chargeable,
  ],
  replacement: [SupplementalCoverageStatus.chargeable],
  transfer_template: [SupplementalCoverageStatus.chargeable],
};

export const WARRANTY_DECISION_COVERAGE: Record<
  SupplementalReviewDecision,
  SupplementalCoverageStatus
> = {
  approved: SupplementalCoverageStatus.warranty_approved,
  rejected: SupplementalCoverageStatus.warranty_rejected,
};

export interface ReviewCoverageInput {
  type: SupplementalOrderType;
  decision: SupplementalReviewDecision;
  /** What the admin sent, if anything. */
  requested: SupplementalCoverageStatus | undefined;
  /** What the request holds (computed at submission). */
  current: SupplementalCoverageStatus;
}

const notAllowed = (message: string) =>
  new BadRequestException(message, SUPPLEMENTAL_ERROR.COVERAGE_NOT_ALLOWED);

/**
 * The coverage a review records, or 400 SUPPLEMENTAL_COVERAGE_NOT_ALLOWED.
 *
 *   warranty            approve → warranty_approved, reject →
 *                       warranty_rejected (a sent value must match)
 *   other approvals     the sent value, else the computed one, among the
 *                       kind's APPROVABLE_COVERAGE (review_required must be
 *                       settled explicitly)
 *   other rejections    the computed coverage stays; none may be sent
 */
export function resolveReviewCoverage({
  type,
  decision,
  requested,
  current,
}: ReviewCoverageInput): SupplementalCoverageStatus {
  if (type === OrderType.warranty) {
    const decided = WARRANTY_DECISION_COVERAGE[decision];
    if (requested !== undefined && requested !== decided) {
      throw notAllowed(
        `A warranty ${decision} decision records ${decided}, not ${requested}.`,
      );
    }
    return decided;
  }
  if (decision === SupplementalReviewStatus.rejected) {
    if (requested !== undefined) {
      throw notAllowed('A rejection does not set a coverage.');
    }
    return current;
  }
  const chosen = requested ?? current;
  if (!APPROVABLE_COVERAGE[type].includes(chosen)) {
    throw notAllowed(
      `A ${type} request cannot be approved as ${chosen}; allowed: ${APPROVABLE_COVERAGE[type].join(', ')}.`,
    );
  }
  return chosen;
}

/** True when this approval uses up one included correction of the pack. */
export function consumesCorrection(
  type: SupplementalOrderType,
  decision: SupplementalReviewDecision,
  coverageStatus: SupplementalCoverageStatus,
): boolean {
  return (
    type === OrderType.additional_aligners &&
    decision === SupplementalReviewStatus.approved &&
    coverageStatus === SupplementalCoverageStatus.included
  );
}
