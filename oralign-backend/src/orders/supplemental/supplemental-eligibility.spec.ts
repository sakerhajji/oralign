import {
  ArchTreatment,
  OrderStatus,
  OrderType,
  QuotationPaymentStatus,
  QuotationStatus,
  SupplementalCoverageStatus,
  SupplementalReviewStatus,
  UserRole,
} from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import { buildEligibility } from './supplemental-eligibility';
import {
  permissionsFor,
  type PermissionSubject,
} from './supplemental-permissions';
import type { SupplementalParentSnapshot } from './supplemental.types';

const NOW = new Date('2026-06-15T10:00:00.000Z');
const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };
const otherDoctor: Caller = { userId: 'u-other', role: UserRole.dentist };
const designer: Caller = { userId: 'u-des', role: UserRole.designer };
const admin: Caller = { userId: 'u-admin', role: UserRole.admin };

const snapshot = (
  over: Partial<SupplementalParentSnapshot> = {},
): SupplementalParentSnapshot => ({
  id: 'parent-1',
  orderCode: 'CASE-001',
  orderType: OrderType.initial,
  parentOrderId: null,
  doctorId: doctor.userId,
  patientId: 'patient-1',
  assignedDesignerId: designer.userId,
  status: OrderStatus.shipped,
  deletedAt: null,
  createdAt: new Date('2026-01-10T00:00:00.000Z'),
  archTreatment: ArchTreatment.both,
  patientStage: null,
  totalAligners: 30,
  coverageStartedAt: new Date('2026-02-01T00:00:00.000Z'),
  coverageExpiresAt: new Date('2027-02-01T00:00:00.000Z'),
  approvedPlans: [
    {
      id: 'plan-2',
      version: 2,
      approvedAt: new Date('2026-01-20T00:00:00.000Z'),
      totalUpperAligners: 24,
      totalLowerAligners: 22,
    },
  ],
  quotation: {
    status: QuotationStatus.approved,
    paymentStatus: QuotationPaymentStatus.paid,
    treatmentValidityMonths: 12,
    includedCorrections: 2,
    isUnlimitedCorrections: false,
    maxStepsPerArch: 20,
    isUnlimitedSteps: false,
  },
  children: [],
  deliveredUpTo: 12,
  consumedCorrections: 0,
  correctionNumbers: [],
  ...over,
});

const eligibility = (
  over: Partial<SupplementalParentSnapshot> = {},
  caller: Caller = doctor,
  excludeOrderId?: string,
) => buildEligibility(snapshot(over), { now: NOW, caller, excludeOrderId });

describe('buildEligibility', () => {
  it('opens every kind on an eligible case, with the reference plan and deliveries', () => {
    const result = eligibility();
    expect(result).toMatchObject({
      parentOrderId: 'parent-1',
      canCreate: true,
      allowed: true,
      reason: null,
      deliveredUpTo: 12,
      approvedPlan: { id: 'plan-2', version: 2, totalUpperAligners: 24 },
    });
    expect(result.requests.additional_aligners).toEqual({
      allowed: true,
      blockedReason: null,
      coverageStatus: SupplementalCoverageStatus.included,
      coverageReason: 'within_pack_allowance',
      activeRequestId: null,
      correctionNumber: 1,
      includedRemaining: 2,
    });
    expect(result.requests.replacement).toMatchObject({
      allowed: true,
      coverageStatus: SupplementalCoverageStatus.chargeable,
      coverageReason: 'requires_quote',
      correctionNumber: null,
      includedRemaining: null,
    });
  });

  it('keeps the blocking reason apart from the coverage reason', () => {
    const result = eligibility({
      children: [
        {
          id: 'child-1',
          orderType: OrderType.additional_aligners,
          status: OrderStatus.draft,
        },
      ],
    });
    expect(result.requests.additional_aligners).toMatchObject({
      allowed: false,
      blockedReason: 'active_request_exists',
      activeRequestId: 'child-1',
      coverageReason: 'within_pack_allowance',
    });
    expect(result.requests.replacement.allowed).toBe(true);
  });

  it('does not let the request being submitted block itself', () => {
    const result = eligibility(
      {
        children: [
          {
            id: 'child-1',
            orderType: OrderType.additional_aligners,
            status: OrderStatus.draft,
          },
        ],
      },
      doctor,
      'child-1',
    );
    expect(result.requests.additional_aligners).toMatchObject({
      allowed: true,
      blockedReason: null,
      coverageReason: 'within_pack_allowance',
    });
  });

  it.each([OrderStatus.finished, OrderStatus.canceled, OrderStatus.rejected])(
    'a %s child no longer blocks its kind',
    (status) => {
      const result = eligibility({
        children: [{ id: 'old', orderType: OrderType.replacement, status }],
      });
      expect(result.requests.replacement.allowed).toBe(true);
    },
  );

  it('needs an approved plan while the case is still in planning', () => {
    const result = eligibility({
      approvedPlans: [],
      status: OrderStatus.treatment_planning,
      quotation: null,
    });
    expect(result).toMatchObject({
      allowed: false,
      reason: 'approved_plan_required',
      approvedPlan: null,
    });
    expect(result.requests.warranty.blockedReason).toBe(
      'approved_plan_required',
    );
  });

  it.each<[string, Partial<SupplementalParentSnapshot>]>([
    ['draft case', { status: OrderStatus.draft }],
    ['cancelled case', { status: OrderStatus.cancelled }],
    ['rejected case', { status: OrderStatus.rejected }],
    ['archived case', { deletedAt: NOW }],
    [
      'supplemental child',
      { orderType: OrderType.replacement, parentOrderId: 'p' },
    ],
  ])('refuses a %s', (_, over) => {
    const result = eligibility(over);
    expect(result.reason).toBe('parent_not_eligible');
    expect(result.requests.additional_aligners.blockedReason).toBe(
      'parent_not_eligible',
    );
  });

  it('accepts a finished case (refinement after the end of treatment)', () => {
    expect(eligibility({ status: OrderStatus.finished }).allowed).toBe(true);
  });

  it('numbers the next included correction and counts what is left', () => {
    const result = eligibility({
      consumedCorrections: 1,
      correctionNumbers: [1],
    });
    expect(result.requests.additional_aligners).toMatchObject({
      correctionNumber: 2,
      includedRemaining: 1,
    });
  });

  it('numbers above the live corrections once a lower one was given back', () => {
    // #1 was cancelled after #2 was approved: one in use, numbered 2.
    const result = eligibility({
      consumedCorrections: 1,
      correctionNumbers: [2],
    });
    expect(result.requests.additional_aligners).toMatchObject({
      correctionNumber: 3,
      includedRemaining: 1,
    });
  });

  it('reports unlimited corrections', () => {
    const result = eligibility({
      quotation: {
        status: QuotationStatus.approved,
        paymentStatus: QuotationPaymentStatus.paid,
        treatmentValidityMonths: 12,
        includedCorrections: null,
        isUnlimitedCorrections: true,
        maxStepsPerArch: 20,
        isUnlimitedSteps: false,
      },
    });
    expect(result.requests.additional_aligners.includedRemaining).toBe(
      'unlimited',
    );
  });

  it.each<[Caller, boolean]>([
    [doctor, true],
    [admin, true],
    [designer, false],
    [otherDoctor, false],
  ])('canCreate for %j is %s', (caller, expected) => {
    expect(eligibility({}, caller).canCreate).toBe(expected);
  });
});

describe('permissionsFor', () => {
  const subject = (
    over: Partial<PermissionSubject> = {},
  ): PermissionSubject => ({
    doctorId: doctor.userId,
    orderType: OrderType.additional_aligners,
    status: OrderStatus.draft,
    request: {
      reviewStatus: SupplementalReviewStatus.draft,
      coverageStatus: SupplementalCoverageStatus.included,
    },
    hasLiveConversion: false,
    ...over,
  });
  const none = {
    canEdit: false,
    canSubmit: false,
    canDelete: false,
    canReview: false,
    canConvert: false,
  };
  const draftRights = {
    ...none,
    canEdit: true,
    canSubmit: true,
    canDelete: true,
  };

  it.each<[string, Caller, Partial<PermissionSubject>, typeof none]>([
    ['owner on a draft', doctor, {}, draftRights],
    ['admin on a draft', admin, {}, draftRights],
    ['designer on a draft', designer, {}, none],
    ['other dentist on a draft', otherDoctor, {}, none],
    [
      'owner once submitted',
      doctor,
      {
        status: OrderStatus.submitted,
        request: {
          reviewStatus: SupplementalReviewStatus.pending,
          coverageStatus: SupplementalCoverageStatus.included,
        },
      },
      none,
    ],
    [
      'admin on a pending request',
      admin,
      {
        status: OrderStatus.submitted,
        request: {
          reviewStatus: SupplementalReviewStatus.pending,
          coverageStatus: SupplementalCoverageStatus.included,
        },
      },
      { ...none, canReview: true },
    ],
    ...[
      OrderStatus.canceled,
      OrderStatus.cancelled,
      OrderStatus.fabrication,
    ].map(
      (status): [string, Caller, Partial<PermissionSubject>, typeof none] => [
        `admin on a pending request whose order an override moved to ${status}`,
        admin,
        {
          status,
          request: {
            reviewStatus: SupplementalReviewStatus.pending,
            coverageStatus: SupplementalCoverageStatus.included,
          },
        },
        none,
      ],
    ),
  ])('%s', (_, caller, over, expected) => {
    expect(permissionsFor(subject(over), caller)).toEqual(expected);
  });

  const rejectedWarranty = (over: Partial<PermissionSubject> = {}) =>
    subject({
      orderType: OrderType.warranty,
      status: OrderStatus.rejected,
      request: {
        reviewStatus: SupplementalReviewStatus.rejected,
        coverageStatus: SupplementalCoverageStatus.warranty_rejected,
      },
      ...over,
    });

  it('only the owning dentist may convert a rejected warranty', () => {
    expect(permissionsFor(rejectedWarranty(), doctor).canConvert).toBe(true);
    expect(permissionsFor(rejectedWarranty(), admin).canConvert).toBe(false);
    expect(permissionsFor(rejectedWarranty(), otherDoctor).canConvert).toBe(
      false,
    );
  });

  it('offers no conversion once a live replacement exists', () => {
    expect(
      permissionsFor(rejectedWarranty({ hasLiveConversion: true }), doctor)
        .canConvert,
    ).toBe(false);
  });
});

describe('buildEligibility without an approved plan on file', () => {
  it('opens requests on a case past planning (plan made outside ORALIGN), with the pack limit', () => {
    const result = eligibility({
      approvedPlans: [],
      status: OrderStatus.fabrication,
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.requests.additional_aligners.allowed).toBe(true);
    expect(result.alignerLimits).toEqual({
      upper: 20,
      lower: 20,
      source: 'pack',
    });
  });

  it('opens requests once the quotation is approved, whatever the case status', () => {
    const result = eligibility({
      approvedPlans: [],
      status: OrderStatus.treatment_planning,
    });
    expect(result.allowed).toBe(true);
  });

  it('still blocks a case in planning with no approved plan and no approved quote', () => {
    const result = eligibility({
      approvedPlans: [],
      status: OrderStatus.treatment_planning,
      quotation: null,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('approved_plan_required');
    expect(result.requests.replacement.blockedReason).toBe(
      'approved_plan_required',
    );
  });

  it('prefers the approved plan totals, then the pack, then the case total', () => {
    expect(eligibility().alignerLimits).toEqual({
      upper: 24,
      lower: 22,
      source: 'approved_plan',
    });
    expect(
      eligibility({
        approvedPlans: [],
        quotation: null,
        status: OrderStatus.shipped,
      }).alignerLimits,
    ).toEqual({ upper: 30, lower: 30, source: 'case' });
    expect(
      eligibility({
        approvedPlans: [],
        quotation: null,
        totalAligners: null,
        status: OrderStatus.shipped,
      }).alignerLimits,
    ).toEqual({ upper: null, lower: null, source: null });
  });
});
