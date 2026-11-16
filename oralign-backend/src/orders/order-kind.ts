import { OrderType, Prisma, ToothInstructionType } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
} from '../common/exceptions/app.exception';
import { CLOSED_ORDER_STATUSES } from './order-status-groups';

/**
 * Rules that tell an initial case from a supplemental child order
 * (additional aligners, replacement, transfer template, warranty) where the
 * generic order flows meet both. A child is created, edited, submitted,
 * reviewed and archived through the supplemental endpoints only; the
 * generic endpoints refuse it with these codes.
 */
export const ORDER_KIND_ERROR = {
  /** A generic order endpoint was called on a supplemental child. */
  DEDICATED_FLOW: 'SUPPLEMENTAL_DEDICATED_FLOW',
  /** Archiving an initial case whose supplemental requests are still open. */
  ACTIVE_CHILDREN: 'SUPPLEMENTAL_ACTIVE_CHILDREN',
  /** The case already has an open request of this kind (one per kind). */
  ACTIVE_REQUEST_EXISTS: 'SUPPLEMENTAL_ACTIVE_REQUEST_EXISTS',
  /** The treatment fee belongs to initial cases only. */
  TREATMENT_FEE_INITIAL_ONLY: 'TREATMENT_FEE_INITIAL_ONLY',
} as const;

/** `where` fragment for counts of CASES: supplemental children excluded. */
export const INITIAL_ORDERS_ONLY = {
  orderType: OrderType.initial,
} satisfies Prisma.DentalOrderWhereInput;

/**
 * `where` fragment for the OPEN supplemental requests of a case: live, and
 * not closed (a draft counts). The set the one-open-request-per-kind rule
 * and the archive guard read.
 */
export function openChildrenOf(
  parentOrderId: string,
): Prisma.DentalOrderWhereInput {
  return {
    parentOrderId,
    deletedAt: null,
    status: { notIn: [...CLOSED_ORDER_STATUSES] },
  };
}

export function isInitialOrder(order: { orderType: OrderType }): boolean {
  return order.orderType === OrderType.initial;
}

/** 409 SUPPLEMENTAL_DEDICATED_FLOW unless `order` is an initial case. */
export function assertInitialOrder(order: { orderType: OrderType }): void {
  if (!isInitialOrder(order)) {
    throw new ConflictException(
      'This is a supplemental request: use the supplemental request endpoints to change it.',
      ORDER_KIND_ERROR.DEDICATED_FLOW,
    );
  }
}

/**
 * 400 TREATMENT_FEE_INITIAL_ONLY unless `order` is an initial case. The
 * professional fee is paid once per case; a supplemental child is covered
 * by its parent or charged through its own quotation.
 */
export function assertTreatmentFeeApplies(order: {
  orderType: OrderType;
}): void {
  if (!isInitialOrder(order)) {
    throw new BadRequestException(
      'No treatment fee is due on a supplemental request.',
      ORDER_KIND_ERROR.TREATMENT_FEE_INITIAL_ONLY,
    );
  }
}

/**
 * The odontogram types the treatment-plan editor owns. On a child the
 * doctor's prescription lives on the supplemental request; the order's
 * tooth instructions only ever carry the planner's attachments.
 */
export const PLANNER_TOOTH_INSTRUCTION_TYPES: readonly ToothInstructionType[] =
  [ToothInstructionType.attachment];

/**
 * True when a tooth-instruction write declares a scope made of planner
 * types only: the one write a supplemental child accepts (from a planner).
 * No scope means "replace everything", which a child never accepts.
 */
export function isPlannerToothScope(
  replaceTypes: readonly ToothInstructionType[] | undefined,
): boolean {
  return (
    replaceTypes !== undefined &&
    replaceTypes.length > 0 &&
    replaceTypes.every((type) => PLANNER_TOOTH_INSTRUCTION_TYPES.includes(type))
  );
}
