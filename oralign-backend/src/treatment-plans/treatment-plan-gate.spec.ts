import { OrderType, SupplementalReviewStatus } from '@prisma/client';
import {
  planCreationGate,
  TREATMENT_PLAN_GATE_ERROR,
  type PlanGateOrder,
} from './treatment-plan-gate';

const order = (over: Partial<PlanGateOrder> = {}): PlanGateOrder => ({
  orderType: OrderType.initial,
  treatmentFeePaidAt: null,
  welcomeGiftAppliedAt: null,
  supplementalRequest: null,
  ...over,
});

const PAID = new Date('2026-11-01T10:00:00.000Z');

describe('planCreationGate', () => {
  describe('initial case', () => {
    it('is open once the fee is paid', () => {
      expect(planCreationGate(order({ treatmentFeePaidAt: PAID }))).toEqual({
        kind: 'open',
      });
    });

    it('is open once the welcome gift waived the fee', () => {
      expect(planCreationGate(order({ welcomeGiftAppliedAt: PAID }))).toEqual({
        kind: 'open',
      });
    });

    it('leaves an unpaid case to the configured-fee check', () => {
      expect(planCreationGate(order())).toEqual({ kind: 'treatment_fee_due' });
    });
  });

  describe('additional aligners', () => {
    const refinement = (reviewStatus: SupplementalReviewStatus | null) =>
      order({
        orderType: OrderType.additional_aligners,
        supplementalRequest: reviewStatus ? { reviewStatus } : null,
      });

    it('is open once approved, whatever was paid', () => {
      expect(
        planCreationGate(refinement(SupplementalReviewStatus.approved)),
      ).toEqual({ kind: 'open' });
    });

    it.each([
      SupplementalReviewStatus.draft,
      SupplementalReviewStatus.pending,
      SupplementalReviewStatus.rejected,
      null,
    ])('is refused while the review is %s', (reviewStatus) => {
      expect(planCreationGate(refinement(reviewStatus))).toMatchObject({
        kind: 'refused',
        errorCode: TREATMENT_PLAN_GATE_ERROR.REQUEST_NOT_APPROVED,
      });
    });

    it('never falls back to the fee gate, even with a paid fee on the row', () => {
      expect(
        planCreationGate({
          ...refinement(SupplementalReviewStatus.pending),
          treatmentFeePaidAt: PAID,
        }),
      ).toMatchObject({ kind: 'refused' });
    });
  });

  it.each([
    OrderType.replacement,
    OrderType.transfer_template,
    OrderType.warranty,
  ])('refuses a %s request, approved or not', (orderType) => {
    expect(
      planCreationGate(
        order({
          orderType,
          supplementalRequest: {
            reviewStatus: SupplementalReviewStatus.approved,
          },
        }),
      ),
    ).toMatchObject({
      kind: 'refused',
      errorCode: TREATMENT_PLAN_GATE_ERROR.KIND_HAS_NO_PLAN,
    });
  });
});
