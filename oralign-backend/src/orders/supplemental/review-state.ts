import {
  OrderStatus,
  SupplementalReviewStatus,
  type SupplementalOrderRequest,
} from '@prisma/client';

/**
 * The request columns that follow the child order's status. Every field a
 * transition resets is written explicitly, so a request can never keep a
 * reviewer, a reason or a correction number from a review it left.
 */
export interface ReviewStatePatch {
  reviewStatus: SupplementalReviewStatus;
  submittedAt?: Date | null;
  reviewedAt?: null;
  reviewedById?: null;
  reviewedByName?: null;
  reviewReason?: null;
  correctionNumber?: null;
}

/** What the transition needs to know about the request it rewrites. */
export type ReviewStateSource = Pick<SupplementalOrderRequest, 'submittedAt'>;

/** Clears the outcome of a previous review. */
const NO_REVIEW = {
  reviewedAt: null,
  reviewedById: null,
  reviewedByName: null,
  reviewReason: null,
  correctionNumber: null,
} as const;

/**
 * THE mapping from a supplemental child's order status to its review
 * state. A child is one workflow stored twice (`DentalOrder.status` and
 * `SupplementalOrderRequest.reviewStatus`); every writer of the status
 * (the supplemental service, the admin overrides single and bulk) applies
 * this patch in the same transaction, so the two can never drift apart.
 *
 *   → draft      back to the doctor: nothing was submitted or reviewed.
 *   → submitted  waiting for a review again. The doctor's first
 *                submission instant is kept when there is one.
 *   → rejected   the request is rejected.
 *   → any other  the review state is unchanged (null: nothing to write).
 *
 * The draft/submitted reset releases the correction number: only the next
 * approval assigns one again. A rejection keeps it for the record; the
 * correction is released anyway, because consumed corrections are counted
 * on orders that are not cancelled or rejected.
 *
 * A cancellation deliberately maps to nothing. There is no "cancelled"
 * review state, and `rejected` means an admin's decision with a reason
 * the doctor reads, so writing it here would invent a review that never
 * happened. A request cancelled while pending therefore keeps the flag,
 * which is inert: a review needs the order to be `submitted` as well
 * (isAwaitingReview), and an approval cancelled later gives its
 * correction back through the order status alone.
 */
export function reviewStatePatch(
  nextOrderStatus: OrderStatus,
  request: ReviewStateSource,
  now: Date = new Date(),
): ReviewStatePatch | null {
  switch (nextOrderStatus) {
    case OrderStatus.draft:
      return {
        reviewStatus: SupplementalReviewStatus.draft,
        submittedAt: null,
        ...NO_REVIEW,
      };
    case OrderStatus.submitted:
      return {
        reviewStatus: SupplementalReviewStatus.pending,
        submittedAt: request.submittedAt ?? now,
        ...NO_REVIEW,
      };
    case OrderStatus.rejected:
      return { reviewStatus: SupplementalReviewStatus.rejected };
    default:
      return null;
  }
}
