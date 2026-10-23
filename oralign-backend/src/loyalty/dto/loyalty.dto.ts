import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** One admin-editable tier. minTreatments is the retained legacy API name. */
export class LoyaltyTierInputDto {
  @ApiProperty({
    example: 8,
    description: 'Eligible completed orders required within one quarter',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  minTreatments!: number;

  @ApiProperty({
    example: 5,
    description: 'Discount % on next-quarter pack quotes',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent!: number;
}

/**
 * Full-replacement update of the tier list. Replacement (rather than
 * per-row patching) keeps the invariant validation in one place:
 * thresholds strictly increasing, percents non-decreasing. Closed
 * quarters are untouched — they snapshot their percent.
 */
export class UpdateLoyaltyTiersDto {
  @ApiProperty({ type: [LoyaltyTierInputDto] })
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => LoyaltyTierInputDto)
  tiers!: LoyaltyTierInputDto[];
}

// ── Read shapes (service-built, serialized as-is) ────────────────────

export interface LoyaltyTierDto {
  id: string;
  minTreatments: number;
  /** decimal-as-string */
  discountPercent: string;
}

export interface LoyaltyQuarterInfoDto {
  year: number;
  quarter: number;
  label: string;
  startsAt: string;
  endsAt: string;
}

export interface LoyaltyDoctorRowDto {
  doctorId: string;
  doctorName: string;
  clinicName: string | null;
  /** Eligible completed orders created in the CURRENT quarter (live). */
  eligibleOrdersThisQuarter: number;
  /** Completed orders excluded because a loyalty reward was applied. */
  excludedDiscountedOrdersThisQuarter: number;
  /** Highest tier reached so far this quarter (projected reward). */
  achievedTierPercent: number;
  /** Discount applying to quotes created THIS quarter (earned last quarter). */
  activeDiscountPercent: number;
  /** Reward projected for NEXT quarter from current live progress. */
  projectedNextQuarterDiscountPercent: number;
  /** Next tier target, or null when the top tier is reached. */
  nextTierMinOrders: number | null;
  nextTierPercent: number | null;
  /** Eligible completed orders still missing to unlock the next tier. */
  remainingOrdersToNextTier: number | null;
  /** Previous quarter as CLOSED (historical snapshot). */
  previousEligibleOrderCount: number;
  previousExcludedDiscountedOrderCount: number;
  previousDiscountPercent: number;
}

export interface LoyaltyOverviewDto {
  enabled: boolean;
  currentQuarter: LoyaltyQuarterInfoDto;
  previousQuarter: LoyaltyQuarterInfoDto;
  tiers: LoyaltyTierDto[];
  kpis: {
    eligibleOrdersThisQuarter: number;
    excludedDiscountedOrdersThisQuarter: number;
    /** Doctors per active tier (live, current quarter), keyed by minTreatments. */
    eligibleByTier: {
      minTreatments: number;
      discountPercent: number;
      doctors: number;
    }[];
    /** Sum of loyalty discounts snapshotted on quotes created this quarter. */
    discountsGrantedThisQuarter: number;
    currency: string;
  };
  doctors: LoyaltyDoctorRowDto[];
}
