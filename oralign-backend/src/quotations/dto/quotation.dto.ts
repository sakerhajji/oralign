import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DevisLanguage, QuotationStatus } from '@prisma/client';

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
