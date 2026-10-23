import { OrderStatus, Prisma } from '@prisma/client';
import type { QuarterRef } from './loyalty.types';
import { quarterPeriod } from './loyalty.types';

export interface LoyaltyTierRule {
  minTreatments: number;
  discountPercent: number;
}

export interface LoyaltyOrderCandidate {
  id: string;
  doctorId: string;
  status: OrderStatus;
  createdAt: Date;
  deletedAt: Date | null;
  quotation: {
    loyaltyDiscountPercent: Prisma.Decimal | null;
    loyaltyDiscountAmount: Prisma.Decimal | null;
  } | null;
}

export interface LoyaltyDoctorMetrics {
  eligibleOrderCount: number;
  excludedDiscountedOrderCount: number;
}

export type LoyaltyOrderClassification =
  | 'eligible'
  | 'discounted'
  | 'ineligible';

const isPositive = (value: Prisma.Decimal | null | undefined): boolean =>
  value != null && value.gt(0);

/** A reward is considered used only when its persisted quote snapshot is positive. */
export function hasAppliedLoyaltyDiscount(
  quotation: LoyaltyOrderCandidate['quotation'],
): boolean {
  return Boolean(
    quotation &&
    (isPositive(quotation.loyaltyDiscountPercent) ||
      isPositive(quotation.loyaltyDiscountAmount)),
  );
}

/**
 * Completion determines eligibility; the immutable order creation date
 * determines the source quarter. This deliberately ignores treatment-plan
 * and pack cardinality, so one order can contribute at most one unit.
 */
export function classifyOrderForQuarter(
  order: LoyaltyOrderCandidate,
  ref: QuarterRef,
): LoyaltyOrderClassification {
  const { start, end } = quarterPeriod(ref);
  if (
    order.deletedAt !== null ||
    order.status !== OrderStatus.finished ||
    order.createdAt < start ||
    order.createdAt >= end
  ) {
    return 'ineligible';
  }
  return hasAppliedLoyaltyDiscount(order.quotation) ? 'discounted' : 'eligible';
}

/** Defensive ID de-duplication makes retries and accidental joined rows harmless. */
export function summarizeOrdersForQuarter(
  orders: LoyaltyOrderCandidate[],
  ref: QuarterRef,
): Map<string, LoyaltyDoctorMetrics> {
  const result = new Map<string, LoyaltyDoctorMetrics>();
  const seenOrderIds = new Set<string>();

  for (const order of orders) {
    if (seenOrderIds.has(order.id)) continue;
    seenOrderIds.add(order.id);

    const classification = classifyOrderForQuarter(order, ref);
    if (classification === 'ineligible') continue;

    const current = result.get(order.doctorId) ?? {
      eligibleOrderCount: 0,
      excludedDiscountedOrderCount: 0,
    };
    if (classification === 'eligible') current.eligibleOrderCount += 1;
    if (classification === 'discounted') {
      current.excludedDiscountedOrderCount += 1;
    }
    result.set(order.doctorId, current);
  }

  return result;
}

export function highestReachedTier(
  count: number,
  tiers: LoyaltyTierRule[],
): LoyaltyTierRule | null {
  let reached: LoyaltyTierRule | null = null;
  for (const tier of tiers) {
    if (count >= tier.minTreatments) reached = tier;
  }
  return reached;
}
