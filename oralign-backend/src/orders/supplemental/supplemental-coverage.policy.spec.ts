import {
  OrderStatus,
  OrderType,
  QuotationPaymentStatus,
  QuotationStatus,
  SupplementalCoverageStatus as Coverage,
  SupplementalReviewStatus,
} from '@prisma/client';
import { BadRequestException } from '../../common/exceptions/app.exception';
import {
  computeCoverage,
  consumesCorrection,
  correctionCoverage,
  holdsCorrection,
  includedRemaining,
  isAllowanceExhausted,
  nextCorrectionRank,
  reclaimedCorrectionNumber,
  regainsCorrection,
  resolveReviewCoverage,
  type CorrectionCoverageInput,
} from './supplemental-coverage.policy';
import { SUPPLEMENTAL_ERROR } from './supplemental.constants';
import type {
  CoverageQuotation,
  SupplementalOrderType,
  SupplementalReviewDecision,
} from './supplemental.types';

const NOW = new Date('2026-06-15T10:00:00.000Z');

function errorOf(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected a throw.');
}

const quote = (over: Partial<CoverageQuotation> = {}): CoverageQuotation => ({
  status: QuotationStatus.approved,
  maxStepsPerArch: 20,
  isUnlimitedSteps: false,
  paymentStatus: QuotationPaymentStatus.paid,
  treatmentValidityMonths: 12,
  includedCorrections: 2,
  isUnlimitedCorrections: false,
  ...over,
});

const parent = (
  over: Partial<CorrectionCoverageInput> = {},
): CorrectionCoverageInput => ({
  coverageStartedAt: new Date('2026-02-01T00:00:00.000Z'),
  coverageExpiresAt: new Date('2027-02-01T00:00:00.000Z'),
  quotation: quote(),
  consumedCorrections: 0,
  ...over,
});

describe('correctionCoverage (additional aligners)', () => {
  it.each<[string, Partial<CorrectionCoverageInput>, Coverage, string]>([
    ['allowance left', {}, Coverage.included, 'within_pack_allowance'],
    [
      'one of two used',
      { consumedCorrections: 1 },
      Coverage.included,
      'within_pack_allowance',
    ],
    [
      'allowance used up',
      { consumedCorrections: 2 },
      Coverage.chargeable,
      'included_corrections_exhausted',
    ],
    [
      'unlimited corrections',
      {
        consumedCorrections: 9,
        quotation: quote({ isUnlimitedCorrections: true }),
      },
      Coverage.included,
      'within_pack_allowance',
    ],
    [
      'allowance never configured: the admin decides, never "exhausted"',
      { quotation: quote({ includedCorrections: null }) },
      Coverage.review_required,
      'allowance_unknown',
    ],
    [
      'no quotation',
      { quotation: null },
      Coverage.review_required,
      'paid_pack_snapshot_missing',
    ],
    [
      'quotation not paid',
      {
        quotation: quote({
          paymentStatus: QuotationPaymentStatus.partially_paid,
        }),
      },
      Coverage.review_required,
      'paid_pack_snapshot_missing',
    ],
    [
      'pack validity unknown',
      { quotation: quote({ treatmentValidityMonths: null }) },
      Coverage.review_required,
      'structured_validity_unknown',
    ],
    [
      'coverage window never started',
      { coverageStartedAt: null, coverageExpiresAt: null },
      Coverage.review_required,
      'structured_validity_unknown',
    ],
    [
      'coverage window over',
      { coverageExpiresAt: new Date('2026-06-15T09:59:59.999Z') },
      Coverage.chargeable,
      'coverage_expired',
    ],
  ])('%s', (_, over, status, reason) => {
    expect(correctionCoverage(parent(over), NOW)).toEqual({ status, reason });
  });

  it('still covers on the very instant the window ends', () => {
    expect(
      correctionCoverage(parent({ coverageExpiresAt: NOW }), NOW).status,
    ).toBe(Coverage.included);
  });
});

describe('computeCoverage', () => {
  it.each<[SupplementalOrderType, Coverage, string]>([
    [OrderType.replacement, Coverage.chargeable, 'requires_quote'],
    [OrderType.transfer_template, Coverage.chargeable, 'requires_quote'],
    [OrderType.warranty, Coverage.review_required, 'warranty_review_required'],
  ])('%s → %s (%s)', (type, status, reason) => {
    expect(computeCoverage(type, parent(), NOW)).toEqual({ status, reason });
  });

  it('additional aligners follow the pack allowance', () => {
    expect(
      computeCoverage(OrderType.additional_aligners, parent(), NOW),
    ).toEqual(correctionCoverage(parent(), NOW));
  });
});

describe('includedRemaining / isAllowanceExhausted', () => {
  it.each<
    [CoverageQuotation | null, number, number | 'unlimited' | null, boolean]
  >([
    [quote(), 0, 2, false],
    [quote(), 2, 0, true],
    [quote(), 5, 0, true],
    [quote({ isUnlimitedCorrections: true }), 5, 'unlimited', false],
    [quote({ includedCorrections: null }), 0, null, false],
    [null, 0, null, false],
  ])('%j with %i used → %j', (quotation, used, remaining, exhausted) => {
    expect(includedRemaining(quotation, used)).toBe(remaining);
    expect(isAllowanceExhausted(quotation, used)).toBe(exhausted);
  });
});

describe('resolveReviewCoverage', () => {
  const approve = SupplementalReviewStatus.approved;
  const reject = SupplementalReviewStatus.rejected;

  it.each<
    [
      SupplementalOrderType,
      SupplementalReviewDecision,
      Coverage | undefined,
      Coverage,
      Coverage,
    ]
  >([
    [
      OrderType.additional_aligners,
      approve,
      Coverage.included,
      Coverage.review_required,
      Coverage.included,
    ],
    [
      OrderType.additional_aligners,
      approve,
      Coverage.chargeable,
      Coverage.included,
      Coverage.chargeable,
    ],
    [
      OrderType.additional_aligners,
      approve,
      undefined,
      Coverage.included,
      Coverage.included,
    ],
    [
      OrderType.additional_aligners,
      reject,
      undefined,
      Coverage.included,
      Coverage.included,
    ],
    [
      OrderType.replacement,
      approve,
      undefined,
      Coverage.chargeable,
      Coverage.chargeable,
    ],
    [
      OrderType.transfer_template,
      approve,
      Coverage.chargeable,
      Coverage.chargeable,
      Coverage.chargeable,
    ],
    [
      OrderType.warranty,
      approve,
      undefined,
      Coverage.review_required,
      Coverage.warranty_approved,
    ],
    [
      OrderType.warranty,
      approve,
      Coverage.warranty_approved,
      Coverage.review_required,
      Coverage.warranty_approved,
    ],
    [
      OrderType.warranty,
      reject,
      undefined,
      Coverage.review_required,
      Coverage.warranty_rejected,
    ],
  ])(
    '%s %s (sent %s, held %s) → %s',
    (type, decision, requested, current, expected) => {
      expect(
        resolveReviewCoverage({ type, decision, requested, current }),
      ).toBe(expected);
    },
  );

  it.each<
    [
      SupplementalOrderType,
      SupplementalReviewDecision,
      Coverage | undefined,
      Coverage,
    ]
  >([
    // A warranty value can never make another kind free.
    [
      OrderType.additional_aligners,
      approve,
      Coverage.warranty_approved,
      Coverage.included,
    ],
    [
      OrderType.replacement,
      approve,
      Coverage.warranty_approved,
      Coverage.chargeable,
    ],
    [
      OrderType.transfer_template,
      approve,
      Coverage.warranty_approved,
      Coverage.chargeable,
    ],
    // Only additional aligners can be included.
    [OrderType.replacement, approve, Coverage.included, Coverage.chargeable],
    [
      OrderType.transfer_template,
      approve,
      Coverage.included,
      Coverage.chargeable,
    ],
    // review_required must be settled explicitly.
    [
      OrderType.additional_aligners,
      approve,
      undefined,
      Coverage.review_required,
    ],
    [
      OrderType.additional_aligners,
      approve,
      Coverage.review_required,
      Coverage.included,
    ],
    // A warranty decision is its own coverage.
    [
      OrderType.warranty,
      approve,
      Coverage.chargeable,
      Coverage.review_required,
    ],
    [
      OrderType.warranty,
      reject,
      Coverage.warranty_approved,
      Coverage.review_required,
    ],
    // A rejection sets no coverage.
    [
      OrderType.additional_aligners,
      reject,
      Coverage.chargeable,
      Coverage.included,
    ],
  ])(
    'refuses %s %s with %s (held %s)',
    (type, decision, requested, current) => {
      const error = errorOf(() =>
        resolveReviewCoverage({ type, decision, requested, current }),
      );
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error).toMatchObject({
        errorCode: SUPPLEMENTAL_ERROR.COVERAGE_NOT_ALLOWED,
      });
    },
  );
});

describe('consumesCorrection', () => {
  it.each<
    [SupplementalOrderType, SupplementalReviewDecision, Coverage, boolean]
  >([
    [
      OrderType.additional_aligners,
      SupplementalReviewStatus.approved,
      Coverage.included,
      true,
    ],
    [
      OrderType.additional_aligners,
      SupplementalReviewStatus.approved,
      Coverage.chargeable,
      false,
    ],
    [
      OrderType.additional_aligners,
      SupplementalReviewStatus.rejected,
      Coverage.included,
      false,
    ],
    [
      OrderType.warranty,
      SupplementalReviewStatus.approved,
      Coverage.warranty_approved,
      false,
    ],
  ])('%s %s %s → %s', (type, decision, coverage, expected) => {
    expect(consumesCorrection(type, decision, coverage)).toBe(expected);
  });
});

describe('correction numbers', () => {
  it.each<[number[], number]>([
    [[], 1],
    [[1, 2], 3],
    // #1 was given back after #2 was approved: never #2 again.
    [[2], 3],
  ])('the next number above the live ones %j is %i', (live, expected) => {
    expect(nextCorrectionRank(live)).toBe(expected);
  });

  it('a correction taken back keeps its number unless a live one holds it', () => {
    expect(reclaimedCorrectionNumber(1, [2])).toBe(1);
    expect(reclaimedCorrectionNumber(1, [1])).toBe(2);
    expect(reclaimedCorrectionNumber(null, [1, 3])).toBe(4);
  });
});

describe('holdsCorrection / regainsCorrection', () => {
  const included = {
    reviewStatus: SupplementalReviewStatus.approved,
    coverageStatus: Coverage.included,
    submittedAt: NOW,
  };
  const refinement = OrderType.additional_aligners;

  it('an included approval holds its correction until cancelled or rejected; finished keeps it', () => {
    expect(holdsCorrection(refinement, OrderStatus.fabrication, included)).toBe(
      true,
    );
    expect(holdsCorrection(refinement, OrderStatus.finished, included)).toBe(
      true,
    );
    expect(holdsCorrection(refinement, OrderStatus.canceled, included)).toBe(
      false,
    );
    expect(
      holdsCorrection(OrderType.replacement, OrderStatus.fabrication, included),
    ).toBe(false);
    expect(
      holdsCorrection(refinement, OrderStatus.fabrication, {
        ...included,
        coverageStatus: Coverage.chargeable,
      }),
    ).toBe(false);
  });

  it.each<[OrderStatus, OrderStatus, boolean]>([
    [OrderStatus.canceled, OrderStatus.fabrication, true],
    // closed → closed is no reopening, but the correction comes back.
    [OrderStatus.cancelled, OrderStatus.finished, true],
    [OrderStatus.rejected, OrderStatus.under_review, true],
    // A new review: the approval is cleared, nothing comes back.
    [OrderStatus.canceled, OrderStatus.submitted, false],
    [OrderStatus.canceled, OrderStatus.draft, false],
    [OrderStatus.canceled, OrderStatus.rejected, false],
    // Never given back.
    [OrderStatus.fabrication, OrderStatus.shipped, false],
  ])('%s → %s takes the correction back: %s', (from, to, expected) => {
    expect(regainsCorrection(refinement, included, from, to)).toBe(expected);
  });
});
