import {
  OrderType,
  SupplementalCoverageStatus,
  SupplementalReviewStatus,
} from '@prisma/client';
import { isQuotable, type QuotableOrder } from './quotation-eligibility';

const request = (
  reviewStatus: SupplementalReviewStatus,
  coverageStatus: SupplementalCoverageStatus,
) => ({ reviewStatus, coverageStatus });

const child = (
  orderType: OrderType,
  supplementalRequest: QuotableOrder['supplementalRequest'],
): QuotableOrder => ({ orderType, supplementalRequest });

describe('isQuotable', () => {
  it('always quotes an initial case', () => {
    expect(
      isQuotable({ orderType: OrderType.initial, supplementalRequest: null }),
    ).toBe(true);
  });

  it.each([
    OrderType.additional_aligners,
    OrderType.replacement,
    OrderType.transfer_template,
  ])('quotes a %s request approved as chargeable', (orderType) => {
    expect(
      isQuotable(
        child(
          orderType,
          request(
            SupplementalReviewStatus.approved,
            SupplementalCoverageStatus.chargeable,
          ),
        ),
      ),
    ).toBe(true);
  });

  it.each([
    [
      'an included refinement',
      SupplementalReviewStatus.approved,
      SupplementalCoverageStatus.included,
    ],
    [
      'an approved warranty',
      SupplementalReviewStatus.approved,
      SupplementalCoverageStatus.warranty_approved,
    ],
    [
      'a chargeable request not reviewed yet',
      SupplementalReviewStatus.pending,
      SupplementalCoverageStatus.chargeable,
    ],
    [
      'a rejected request',
      SupplementalReviewStatus.rejected,
      SupplementalCoverageStatus.chargeable,
    ],
  ])('never quotes %s', (_label, reviewStatus, coverageStatus) => {
    expect(
      isQuotable(
        child(
          OrderType.additional_aligners,
          request(reviewStatus, coverageStatus),
        ),
      ),
    ).toBe(false);
  });

  it('never quotes a child whose request row is missing', () => {
    expect(isQuotable(child(OrderType.replacement, null))).toBe(false);
  });
});
