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

/** One admin-editable tier: "minTreatments in a quarter → discountPercent". */
export class LoyaltyTierInputDto {
  @ApiProperty({ example: 8, description: 'Treatments required within one quarter' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  minTreatments!: number;

  @ApiProperty({ example: 5, description: 'Discount % on next-quarter pack quotes' })
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
  /** Approved treatments counted in the CURRENT quarter (live). */
  currentCount: number;
  /** Highest tier reached so far this quarter (percent, live). */
  currentTierPercent: number;
  /** Discount applying to quotes created THIS quarter (earned last quarter). */
  activeDiscountPercent: number;
  /** Discount already secured for NEXT quarter = currentTierPercent. */
  nextQuarterDiscountPercent: number;
  /** Next tier target, or null when the top tier is reached. */
  nextTierMinTreatments: number | null;
  nextTierPercent: number | null;
  /** Treatments still missing to unlock the next tier. */
  remainingToNextTier: number | null;
  /** Previous quarter as CLOSED (historical snapshot). */
  previousCount: number;
  previousDiscountPercent: number;
}

export interface LoyaltyOverviewDto {
  enabled: boolean;
  currentQuarter: LoyaltyQuarterInfoDto;
  previousQuarter: LoyaltyQuarterInfoDto;
  tiers: LoyaltyTierDto[];
  kpis: {
    treatmentsThisQuarter: number;
    /** Doctors per active tier (live, current quarter), keyed by minTreatments. */
    eligibleByTier: { minTreatments: number; discountPercent: number; doctors: number }[];
    /** Sum of loyalty discounts snapshotted on quotes created this quarter. */
    discountsGrantedThisQuarter: number;
    currency: string;
  };
  doctors: LoyaltyDoctorRowDto[];
}
