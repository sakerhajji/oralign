/**
 * Loyalty program (grille 2026) — read shapes mirror the backend DTOs
 * in oralign-backend/src/loyalty/dto/loyalty.dto.ts. All money and
 * percent figures arrive as plain numbers except tier percents, which
 * are decimal-as-string like every Prisma.Decimal at the API boundary.
 */

export interface LoyaltyTier {
  id: string;
  minTreatments: number;
  /** decimal-as-string, e.g. "5.00" */
  discountPercent: string;
}

export interface LoyaltyTierInput {
  minTreatments: number;
  discountPercent: number;
}

export interface LoyaltyQuarterInfo {
  year: number;
  quarter: number;
  /** "2026-T3" */
  label: string;
  startsAt: string;
  endsAt: string;
}

export interface LoyaltyDoctorRow {
  doctorId: string;
  doctorName: string;
  clinicName: string | null;
  eligibleOrdersThisQuarter: number;
  excludedDiscountedOrdersThisQuarter: number;
  achievedTierPercent: number;
  activeDiscountPercent: number;
  projectedNextQuarterDiscountPercent: number;
  nextTierMinOrders: number | null;
  nextTierPercent: number | null;
  remainingOrdersToNextTier: number | null;
  previousEligibleOrderCount: number;
  previousExcludedDiscountedOrderCount: number;
  previousDiscountPercent: number;
}

export interface LoyaltyOverview {
  enabled: boolean;
  currentQuarter: LoyaltyQuarterInfo;
  previousQuarter: LoyaltyQuarterInfo;
  tiers: LoyaltyTier[];
  kpis: {
    eligibleOrdersThisQuarter: number;
    excludedDiscountedOrdersThisQuarter: number;
    eligibleByTier: {
      minTreatments: number;
      discountPercent: number;
      doctors: number;
    }[];
    discountsGrantedThisQuarter: number;
    currency: string;
  };
  doctors: LoyaltyDoctorRow[];
}
