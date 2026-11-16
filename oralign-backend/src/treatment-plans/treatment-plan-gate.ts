import {
  OrderType,
  SupplementalReviewStatus,
  type Prisma,
} from '@prisma/client';

/** Codes of the refusals below; the frontend translates by code. */
export const TREATMENT_PLAN_GATE_ERROR = {
  /** Replacement, transfer template and warranty requests have no plan. */
  KIND_HAS_NO_PLAN: 'SUPPLEMENTAL_PLAN_NOT_AVAILABLE',
  /** A refinement is planned only once an admin approved the request. */
  REQUEST_NOT_APPROVED: 'SUPPLEMENTAL_PLAN_REQUIRES_APPROVAL',
} as const;

/** The order columns the gate decides on. */
export const PLAN_GATE_SELECT = {
  orderType: true,
  treatmentFeePaidAt: true,
  welcomeGiftAppliedAt: true,
  supplementalRequest: { select: { reviewStatus: true } },
} satisfies Prisma.DentalOrderSelect;

export type PlanGateOrder = Prisma.DentalOrderGetPayload<{
  select: typeof PLAN_GATE_SELECT;
}>;

export type PlanGateDecision =
  /** A plan may be created. */
  | { kind: 'open' }
  /** An initial case whose fee is unpaid: open only if no fee is configured. */
  | { kind: 'treatment_fee_due' }
  | { kind: 'refused'; message: string; errorCode: string };

const OPEN: PlanGateDecision = { kind: 'open' };

/**
 * May a treatment plan be created on this order?
 *   • initial case: once the professional fee is paid or waived by the
 *     welcome gift (otherwise the caller checks whether a fee is configured
 *     at all: tenants without one keep the legacy, ungated flow);
 *   • additional aligners: once the request is approved, whatever its
 *     coverage. The fee gate never applies to a child, and a chargeable
 *     refinement is paid through its quotation AFTER the plan, as a case
 *     is (plan → approval → quote → payment → fabrication);
 *   • replacement, transfer template, warranty: never, they reuse the
 *     case's plan.
 */
export function planCreationGate(order: PlanGateOrder): PlanGateDecision {
  switch (order.orderType) {
    case OrderType.initial:
      return order.treatmentFeePaidAt || order.welcomeGiftAppliedAt
        ? OPEN
        : { kind: 'treatment_fee_due' };
    case OrderType.additional_aligners:
      return order.supplementalRequest?.reviewStatus ===
        SupplementalReviewStatus.approved
        ? OPEN
        : {
            kind: 'refused',
            message:
              'A treatment plan can be created once the additional-aligner request is approved.',
            errorCode: TREATMENT_PLAN_GATE_ERROR.REQUEST_NOT_APPROVED,
          };
    default:
      return {
        kind: 'refused',
        message:
          'Treatment plans are only available for initial cases and additional-aligner requests.',
        errorCode: TREATMENT_PLAN_GATE_ERROR.KIND_HAS_NO_PLAN,
      };
  }
}
