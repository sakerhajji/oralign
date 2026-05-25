import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ArchType, DevisLanguage, PaymentMode, QuotationStatus } from '@prisma/client';

// ─── Create ────────────────────────────────────────────────────────────────

/**
 * Create a quotation for an order.
 *
 * All fee fields are optional on create (admin often opens the form,
 * picks the language, then iterates). The service falls back to 0 for
 * any missing fee and to the default TVA rate / currency from
 * CompanyBillingSettings.
 */
export class CreateQuotationDto {
  @ApiPropertyOptional({ enum: DevisLanguage, default: DevisLanguage.fr })
  @IsOptional()
  @IsEnum(DevisLanguage)
  language?: DevisLanguage;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  treatmentFees?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  fabricationFees?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  deliveryFees?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  tvaRate?: number;

  @ApiPropertyOptional({
    description: 'ISO 4217 currency code',
    default: 'TND',
  })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Admin-only block of text rendered above totals',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminMessage?: string;
}

// ─── Update ────────────────────────────────────────────────────────────────

// All fields optional — admin can save partial progress while iterating.
export class UpdateQuotationDto extends PartialType(CreateQuotationDto) {}

// ─── Reject ────────────────────────────────────────────────────────────────

export class RejectQuotationDto {
  @ApiPropertyOptional({
    description: 'Optional rejection reason shown to admin / planner',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectionReason?: string;
}

// ─── Admin filter (GET /admin/quotations) ─────────────────────────────────

export class QuotationFilterDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ enum: QuotationStatus })
  @IsOptional()
  @IsEnum(QuotationStatus)
  status?: QuotationStatus;

  @ApiPropertyOptional({ enum: DevisLanguage })
  @IsOptional()
  @IsEnum(DevisLanguage)
  language?: DevisLanguage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  doctorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  orderCode?: string;

  @ApiPropertyOptional({
    description: 'ISO date — quotes created ON or AFTER this date',
  })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({
    description: 'ISO date — quotes created ON or BEFORE this date',
  })
  @IsOptional()
  @IsDateString()
  createdTo?: string;
}

// ─── Response ─────────────────────────────────────────────────────────────

export class QuotationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiPropertyOptional() quotationNumber?: string | null;
  @ApiProperty({ enum: DevisLanguage }) language!: DevisLanguage;
  @ApiProperty({ enum: QuotationStatus }) status!: QuotationStatus;

  @ApiProperty() treatmentFees!: number;
  @ApiProperty() fabricationFees!: number;
  @ApiProperty() deliveryFees!: number;
  @ApiProperty() discountAmount!: number;

  @ApiProperty() subTotalHt!: number;
  @ApiProperty() tvaRate!: number;
  @ApiProperty() tvaAmount!: number;
  @ApiProperty() totalTtc!: number;
  @ApiProperty() currency!: string;

  @ApiPropertyOptional() notes?: string | null;
  @ApiPropertyOptional() adminMessage?: string | null;

  @ApiPropertyOptional({ type: Object }) companySnapshot?: Record<
    string,
    unknown
  > | null;
  @ApiPropertyOptional({ type: Object }) clinicSnapshot?: Record<
    string,
    unknown
  > | null;

  @ApiPropertyOptional() pdfFilePath?: string | null;

  @ApiPropertyOptional() sentAt?: Date | null;
  @ApiPropertyOptional() approvedAt?: Date | null;
  @ApiPropertyOptional() rejectedAt?: Date | null;
  @ApiPropertyOptional() rejectionReason?: string | null;

  @ApiProperty() createdById!: string;
  @ApiPropertyOptional() approvedById?: string | null;
  @ApiPropertyOptional() rejectedById?: string | null;

  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

// ─── Pack attachment + payment plan configuration ────────────────
// Admin-only DTOs added in the packs/payments rollout. The service
// computes price from the selected (pack, archType) — the client
// NEVER provides an amount.

/**
 * Attach a pack + arch to a draft quotation. Service looks up the
 * active PackPrice, snapshots its fields onto the Quotation, sets
 * totalPrice. Cannot be used once the quote is approved or partially
 * paid — those gates are enforced server-side.
 */
export class AttachPackToQuotationDto {
  @ApiProperty()
  @IsString()
  packId!: string;

  // archType is OPTIONAL now — the admin UI shows a single price per
  // pack (no arch picker), so callers default to two_arches. The
  // enum stays in the schema for backward compatibility with legacy
  // quotations + the historical PDF "(Single arch)" suffix, but new
  // attachments don't need to pass it.
  @ApiPropertyOptional({
    enum: ArchType,
    default: ArchType.two_arches,
    description:
      'Defaults to two_arches when omitted — the canonical pricing unit.',
  })
  @IsOptional()
  @IsEnum(ArchType)
  archType?: ArchType;
}

/**
 * Step range linked to a single installment. Declared BEFORE
 * PaymentPlanInstallmentDto so the `@Type(() => PaymentPlanBatchDto)`
 * decorator metadata emitted by tsc resolves at class-definition time
 * — referencing it from a later class triggers a `ReferenceError:
 * Cannot access ... before initialization` TDZ crash at module load.
 */
export class PaymentPlanBatchDto {
  @ApiProperty({ example: 1, description: '1-based step index' })
  @IsInt()
  @Min(1)
  fromStep!: number;

  @ApiProperty({ example: 8 })
  @IsInt()
  @Min(1)
  toStep!: number;
}

/**
 * One row of the installment plan. `batch.fromStep`/`toStep` carry
 * the linked step batch range — the service enforces that:
 *   • ranges within the plan are disjoint
 *   • every step ≤ pack.maxStepsPerArch (when not unlimited)
 *   • Σ amounts == quote.totalPrice (with the diff parked on the
 *     last row to absorb rounding)
 *
 * `availableFrom` defaults to "now" when omitted, but for installments
 * 2+ the admin typically sets a later date.
 */
export class PaymentPlanInstallmentDto {
  @ApiProperty({ example: '350.000' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Type(() => Number)
  amount!: number;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  @ApiPropertyOptional({ example: '2026-06-15T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => PaymentPlanBatchDto)
  batch!: PaymentPlanBatchDto;
}

export class ConfigurePaymentPlanDto {
  @ApiProperty({ enum: PaymentMode })
  @IsEnum(PaymentMode)
  paymentMode!: PaymentMode;

  // FULL_PAYMENT requires exactly one installment covering the whole
  // step range. INSTALLMENTS requires 2+; the service enforces both.
  @ApiProperty({ type: [PaymentPlanInstallmentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => PaymentPlanInstallmentDto)
  installments!: PaymentPlanInstallmentDto[];
}
