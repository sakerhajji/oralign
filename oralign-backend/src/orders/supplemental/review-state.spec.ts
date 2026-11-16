import { OrderStatus, SupplementalReviewStatus } from '@prisma/client';
import { reviewStatePatch } from './review-state';

const NOW = new Date('2026-11-12T09:30:00.000Z');
const FIRST_SUBMISSION = new Date('2026-11-02T08:00:00.000Z');

const neverSubmitted = { submittedAt: null };
const submittedBefore = { submittedAt: FIRST_SUBMISSION };

describe('reviewStatePatch', () => {
  it('→ draft: back to an untouched draft, every review field cleared', () => {
    expect(reviewStatePatch(OrderStatus.draft, submittedBefore, NOW)).toEqual({
      reviewStatus: SupplementalReviewStatus.draft,
      submittedAt: null,
      reviewedAt: null,
      reviewedById: null,
      reviewedByName: null,
      reviewReason: null,
      correctionNumber: null,
    });
  });

  it('→ submitted: pending again, the previous review and correction cleared', () => {
    expect(
      reviewStatePatch(OrderStatus.submitted, submittedBefore, NOW),
    ).toEqual({
      reviewStatus: SupplementalReviewStatus.pending,
      submittedAt: FIRST_SUBMISSION,
      reviewedAt: null,
      reviewedById: null,
      reviewedByName: null,
      reviewReason: null,
      correctionNumber: null,
    });
  });

  it('→ submitted: stamps the submission when the request never had one', () => {
    expect(
      reviewStatePatch(OrderStatus.submitted, neverSubmitted, NOW),
    ).toMatchObject({ submittedAt: NOW });
  });

  it('→ rejected: only the review status changes', () => {
    expect(
      reviewStatePatch(OrderStatus.rejected, submittedBefore, NOW),
    ).toEqual({ reviewStatus: SupplementalReviewStatus.rejected });
  });

  const untouched = Object.values(OrderStatus).filter(
    (status) =>
      status !== OrderStatus.draft &&
      status !== OrderStatus.submitted &&
      status !== OrderStatus.rejected,
  );

  it.each(untouched)('→ %s: the review state is unchanged', (status) => {
    expect(reviewStatePatch(status, submittedBefore, NOW)).toBeNull();
  });
});
