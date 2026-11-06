import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentRecordStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsCalendarDate } from '../../common/decorators/is-calendar-date.decorator';
import {
  toOptionalTrimmed,
  toQueryList,
} from '../../common/dto/query-transforms';
import { SortOrder } from './order.dto';

export enum TreatmentFeeSortBy {
  paidAt = 'paidAt',
  amount = 'amount',
}

/**
 * Query of the treatment-fee history (GET /orders/admin/treatment-fees):
 * one row per order whose fee has a payment on record.
 */
export class TreatmentFeeFilterDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    maxLength: 120,
    description:
      'Order code, dentist or patient name, receipt number (TF-…), or the exact amount ("1500", "1500,5", "1 500,000", "1 500,000 TND"). Case-insensitive; trimmed, blank means no search.',
  })
  @Transform(({ value }) => toOptionalTrimmed(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    example: '2026-11-01',
    description:
      'First day the fee was paid, included (YYYY-MM-DD, Africa/Tunis days). A period leaves out the fees not paid yet.',
  })
  @Transform(({ value }) => toOptionalTrimmed(value))
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-06',
    description:
      'Last day the fee was paid, included (YYYY-MM-DD, Africa/Tunis days). Before `from`: 400 INVALID_DATE_RANGE.',
  })
  @Transform(({ value }) => toOptionalTrimmed(value))
  @IsOptional()
  @IsCalendarDate()
  to?: string;

  @ApiPropertyOptional({
    description:
      'Admin only: one dentist. Ignored for a dentist, who always gets their own orders.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  doctorId?: string;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    isArray: true,
    description:
      'One or more payment methods, comma-separated or as repeated query params.',
  })
  @IsOptional()
  @Transform(({ value }) => toQueryList(value))
  @IsArray()
  @ArrayMaxSize(5)
  @IsEnum(PaymentMethod, { each: true })
  methods?: PaymentMethod[];

  @ApiPropertyOptional({
    enum: PaymentRecordStatus,
    isArray: true,
    description:
      'One or more statuses, comma-separated or as repeated query params. A fee is awaiting_confirmation (a declared transfer) or success.',
  })
  @IsOptional()
  @Transform(({ value }) => toQueryList(value))
  @IsArray()
  @ArrayMaxSize(10)
  @IsEnum(PaymentRecordStatus, { each: true })
  statuses?: PaymentRecordStatus[];

  @ApiPropertyOptional({
    enum: TreatmentFeeSortBy,
    default: TreatmentFeeSortBy.paidAt,
    description:
      'paidAt, newest first: the fees awaiting confirmation (not paid yet) come on top, they need an action. Oldest first puts them last.',
  })
  @IsOptional()
  @IsEnum(TreatmentFeeSortBy)
  sortBy?: TreatmentFeeSortBy;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.desc })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;
}

/**
 * Query of the confirmation queue (GET /orders/admin/treatment-fees/pending):
 * a page of the fee transfers awaiting an admin, nothing else. Same page
 * rules as the history; any other param is a 400.
 */
export class TreatmentFeeQueueQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class TreatmentFeeDoctorDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  email!: string;
}

export class TreatmentFeePatientDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fullName!: string;
}

export class TreatmentFeeRowDto {
  @ApiProperty()
  orderId!: string;

  @ApiProperty()
  orderCode!: string;

  @ApiProperty({ type: Number, nullable: true, example: 350 })
  amount!: number | null;

  @ApiProperty({ enum: PaymentMethod, nullable: true })
  method!: PaymentMethod | null;

  @ApiProperty({ enum: PaymentRecordStatus, nullable: true })
  status!: PaymentRecordStatus | null;

  @ApiProperty({ type: Date, nullable: true })
  paidAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  proofPath!: string | null;

  @ApiProperty({ type: Date, nullable: true })
  submittedAt!: Date | null;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'TF-000042',
    description:
      'Receipt number, allocated when the paid receipt is first rendered.',
  })
  invoiceNumber!: string | null;

  @ApiProperty({ type: TreatmentFeeDoctorDto, nullable: true })
  doctor!: TreatmentFeeDoctorDto | null;

  @ApiProperty({ type: TreatmentFeePatientDto, nullable: true })
  patient!: TreatmentFeePatientDto | null;
}

export class TreatmentFeePageDto {
  @ApiProperty({ type: TreatmentFeeRowDto, isArray: true })
  data!: TreatmentFeeRowDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  limit!: number;

  @ApiProperty({ example: 2, description: '0 when there is no row.' })
  totalPages!: number;
}
