import {
  ArchTreatment,
  ReplacementReason,
  SupplementalApCorrection,
  SupplementalApOption,
  SupplementalAttachmentPlan,
  SupplementalClinicalObjective,
  SupplementalContactPurpose,
  SupplementalCoverageStatus,
  SupplementalCutoutPlan,
  SupplementalExistingAttachments,
  SupplementalImpressionMethod,
  SupplementalIprPlan,
  SupplementalPreviousIpr,
  SupplementalRequestReason,
  SupplementalResidualSpaces,
  SupplementalTeethScope,
  SupplementalToothPurpose,
  SupplementalUrgency,
  TransferTemplatePurpose,
  WarrantyDefectCategory,
} from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsCalendarDate } from '../../common/decorators/is-calendar-date.decorator';
import {
  ALIGNER_NUMBER_MAX,
  CLINICAL_TEXT_MAX,
  CONTACT_AMOUNT_DECIMALS,
  CONTACT_AMOUNT_MM,
  NOTES_TEXT_MAX,
  PERMANENT_TEETH,
  QUANTITY_RANGE,
  REASON_TEXT_MAX,
  SHORT_TEXT_MAX,
  SUPPLEMENTAL_ORDER_TYPES,
  SUPPLEMENTAL_REVIEW_DECISIONS,
} from '../supplemental/supplemental.constants';
import type {
  SupplementalOrderType,
  SupplementalReviewDecision,
} from '../supplemental/supplemental.types';

/** Trimmed text; an empty answer clears the field (null), like `null` does. */
const trimToNull = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() || null : value;

// Upper bounds only (the service checks the real rules): one row per tooth
// and purpose; fewer contacts than teeth per purpose.
const MAX_TEETH =
  PERMANENT_TEETH.length * Object.keys(SupplementalToothPurpose).length;
const MAX_CONTACTS =
  PERMANENT_TEETH.length * Object.keys(SupplementalContactPurpose).length;
const MAX_CONTACT_MM = Math.max(
  ...Object.values(CONTACT_AMOUNT_MM).map((range) => range.max),
);
const MIN_CONTACT_MM = Math.min(
  ...Object.values(CONTACT_AMOUNT_MM).map((range) => range.min),
);
const MAX_QUANTITY = Math.max(
  ...Object.values(QUANTITY_RANGE).map((range) => range.max),
);

export class CreateSupplementalOrderDto {
  @ApiProperty({ enum: SUPPLEMENTAL_ORDER_TYPES })
  @IsIn(SUPPLEMENTAL_ORDER_TYPES)
  type!: SupplementalOrderType;
}

export class SupplementalToothSelectionDto {
  @ApiProperty({ enum: SupplementalToothPurpose })
  @IsEnum(SupplementalToothPurpose)
  purpose!: SupplementalToothPurpose;

  @ApiProperty({ description: 'FDI number of a permanent tooth (11-48).' })
  @IsInt()
  @IsIn(PERMANENT_TEETH)
  toothNumber!: number;
}

export class SupplementalToothContactDto {
  @ApiProperty({ enum: SupplementalContactPurpose })
  @IsEnum(SupplementalContactPurpose)
  purpose!: SupplementalContactPurpose;

  @ApiProperty({ description: 'FDI number; the pair must be adjacent.' })
  @IsInt()
  @IsIn(PERMANENT_TEETH)
  fromTooth!: number;

  @ApiProperty()
  @IsInt()
  @IsIn(PERMANENT_TEETH)
  toTooth!: number;

  @ApiProperty({
    description: 'mm: performed IPR 0.05-2.00, residual space 0.05-9.99.',
  })
  @IsNumber({ maxDecimalPlaces: CONTACT_AMOUNT_DECIMALS })
  @Min(MIN_CONTACT_MM)
  @Max(MAX_CONTACT_MM)
  amountMm!: number;
}

/**
 * Whole-form draft PUT. Each field: omitted = unchanged, null = cleared.
 * Answers a kind does not ask are ignored; per-kind requirements are
 * checked at submission (SUPPLEMENTAL_INCOMPLETE).
 */
export class UpdateSupplementalOrderDto {
  @ApiPropertyOptional({ enum: ArchTreatment, nullable: true })
  @IsOptional()
  @IsEnum(ArchTreatment)
  archTreatment?: ArchTreatment | null;

  // ── additional_aligners ─────────────────────────────────────────────
  @ApiPropertyOptional({ enum: SupplementalRequestReason, nullable: true })
  @IsOptional()
  @IsEnum(SupplementalRequestReason)
  reason?: SupplementalRequestReason | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(REASON_TEXT_MAX)
  reasonDetails?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(ALIGNER_NUMBER_MAX)
  currentUpperAligner?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(ALIGNER_NUMBER_MAX)
  currentLowerAligner?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsBoolean()
  passiveOppositeArch?: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsBoolean()
  newUpperScan?: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsBoolean()
  newLowerScan?: boolean | null;

  @ApiPropertyOptional({ enum: SupplementalClinicalObjective, nullable: true })
  @IsOptional()
  @IsEnum(SupplementalClinicalObjective)
  clinicalObjective?: SupplementalClinicalObjective | null;

  @ApiPropertyOptional({ enum: SupplementalTeethScope, nullable: true })
  @IsOptional()
  @IsEnum(SupplementalTeethScope)
  movementRestriction?: SupplementalTeethScope | null;

  @ApiPropertyOptional({ enum: SupplementalApCorrection, nullable: true })
  @IsOptional()
  @IsEnum(SupplementalApCorrection)
  apRelationshipRight?: SupplementalApCorrection | null;

  @ApiPropertyOptional({ enum: SupplementalApCorrection, nullable: true })
  @IsOptional()
  @IsEnum(SupplementalApCorrection)
  apRelationshipLeft?: SupplementalApCorrection | null;

  @ApiPropertyOptional({
    enum: SupplementalApOption,
    isArray: true,
    nullable: true,
    description: 'null clears to [].',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(Object.keys(SupplementalApOption).length)
  @IsEnum(SupplementalApOption, { each: true })
  apOptions?: SupplementalApOption[] | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsBoolean()
  elasticCutouts?: boolean | null;

  @ApiPropertyOptional({ enum: SupplementalAttachmentPlan, nullable: true })
  @IsOptional()
  @IsEnum(SupplementalAttachmentPlan)
  attachmentPolicy?: SupplementalAttachmentPlan | null;

  @ApiPropertyOptional({
    enum: SupplementalExistingAttachments,
    nullable: true,
  })
  @IsOptional()
  @IsEnum(SupplementalExistingAttachments)
  existingAttachmentPolicy?: SupplementalExistingAttachments | null;

  @ApiPropertyOptional({ enum: SupplementalIprPlan, nullable: true })
  @IsOptional()
  @IsEnum(SupplementalIprPlan)
  iprPolicy?: SupplementalIprPlan | null;

  @ApiPropertyOptional({ enum: SupplementalPreviousIpr, nullable: true })
  @IsOptional()
  @IsEnum(SupplementalPreviousIpr)
  previousIpr?: SupplementalPreviousIpr | null;

  @ApiPropertyOptional({ enum: SupplementalCutoutPlan, nullable: true })
  @IsOptional()
  @IsEnum(SupplementalCutoutPlan)
  precisionCutPolicy?: SupplementalCutoutPlan | null;

  @ApiPropertyOptional({ enum: SupplementalResidualSpaces, nullable: true })
  @IsOptional()
  @IsEnum(SupplementalResidualSpaces)
  residualSpacePolicy?: SupplementalResidualSpaces | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(CLINICAL_TEXT_MAX)
  upperInstructions?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(CLINICAL_TEXT_MAX)
  lowerInstructions?: string | null;

  @ApiPropertyOptional({ enum: SupplementalImpressionMethod, nullable: true })
  @IsOptional()
  @IsEnum(SupplementalImpressionMethod)
  impressionMethod?: SupplementalImpressionMethod | null;

  @ApiPropertyOptional({
    type: [SupplementalToothSelectionDto],
    nullable: true,
    description:
      "Replaces the request's teeth; selections whose question is not answered accordingly are dropped.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TEETH)
  @ValidateNested({ each: true })
  @Type(() => SupplementalToothSelectionDto)
  teeth?: SupplementalToothSelectionDto[] | null;

  @ApiPropertyOptional({
    type: [SupplementalToothContactDto],
    nullable: true,
    description: "Replaces the request's contacts (pairs normalised low-high).",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CONTACTS)
  @ValidateNested({ each: true })
  @Type(() => SupplementalToothContactDto)
  contacts?: SupplementalToothContactDto[] | null;

  // ── replacement ─────────────────────────────────────────────────────
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(ALIGNER_NUMBER_MAX)
  replacementFromAligner?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(ALIGNER_NUMBER_MAX)
  replacementToAligner?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Replacement 1-10 per aligner, transfer template 1-5.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  quantity?: number | null;

  @ApiPropertyOptional({ enum: ReplacementReason, nullable: true })
  @IsOptional()
  @IsEnum(ReplacementReason)
  replacementReason?: ReplacementReason | null;

  @ApiPropertyOptional({ enum: SupplementalUrgency, nullable: true })
  @IsOptional()
  @IsEnum(SupplementalUrgency)
  urgency?: SupplementalUrgency | null;

  // ── transfer_template ───────────────────────────────────────────────
  @ApiPropertyOptional({
    nullable: true,
    description:
      'An approved plan of the parent case; its version is read from the plan.',
  })
  @IsOptional()
  @IsUUID()
  sourceTreatmentPlanId?: string | null;

  @ApiPropertyOptional({ enum: TransferTemplatePurpose, nullable: true })
  @IsOptional()
  @IsEnum(TransferTemplatePurpose)
  transferPurpose?: TransferTemplatePurpose | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(NOTES_TEXT_MAX)
  transferNotes?: string | null;

  // ── warranty ────────────────────────────────────────────────────────
  @ApiPropertyOptional({
    type: [Number],
    nullable: true,
    description: 'Every defective aligner. null clears to [].',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(ALIGNER_NUMBER_MAX)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(ALIGNER_NUMBER_MAX, { each: true })
  defectiveAligners?: number[] | null;

  @ApiPropertyOptional({ enum: WarrantyDefectCategory, nullable: true })
  @IsOptional()
  @IsEnum(WarrantyDefectCategory)
  warrantyDefectCategory?: WarrantyDefectCategory | null;

  @ApiPropertyOptional({ example: '2026-11-12', nullable: true })
  @IsOptional()
  @IsCalendarDate()
  warrantyDiscoveredAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(SHORT_TEXT_MAX)
  warrantyLotReference?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(CLINICAL_TEXT_MAX)
  warrantyComments?: string | null;
}

export class ReviewSupplementalOrderDto {
  @ApiProperty({ enum: SUPPLEMENTAL_REVIEW_DECISIONS })
  @IsIn(SUPPLEMENTAL_REVIEW_DECISIONS)
  decision!: SupplementalReviewDecision;

  @ApiPropertyOptional({
    enum: SupplementalCoverageStatus,
    description:
      'Approval only: included | chargeable (additional aligners), chargeable (replacement, transfer template). A warranty decision sets its own coverage.',
  })
  @IsOptional()
  @IsEnum(SupplementalCoverageStatus)
  coverageStatus?: SupplementalCoverageStatus;

  @ApiPropertyOptional({ description: 'Required to reject (1-1000 chars).' })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(REASON_TEXT_MAX)
  reason?: string | null;
}
