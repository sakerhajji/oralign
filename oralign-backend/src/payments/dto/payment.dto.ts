import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsCalendarDate } from '../../common/decorators/is-calendar-date.decorator';
import {
  toOptionalTrimmed,
  toQueryList,
} from '../../common/dto/query-transforms';
import { BUSINESS_TIME_ZONE } from '../../common/time/business-day';

export class CreateClicToPaySessionDto {
  @ApiProperty({ description: 'Order being paid. Amount is resolved server-side.' })
  @IsString()
  @MaxLength(64)
  orderId!: string;

  @ApiProperty({ enum: PaymentPurpose })
  @IsEnum(PaymentPurpose)
  purpose!: PaymentPurpose;

  @ApiPropertyOptional({
    description: 'Required when purpose is installment.',
  })
  @ValidateIf((dto: CreateClicToPaySessionDto) =>
    dto.purpose === PaymentPurpose.installment,
  )
  @IsString()
  @MaxLength(64)
  installmentId?: string;

  @ApiPropertyOptional({ enum: ['fr', 'en', 'ar'], default: 'fr' })
  @IsOptional()
  @IsIn(['fr', 'en', 'ar'])
  language?: 'fr' | 'en' | 'ar';

  @ApiPropertyOptional({ enum: ['DESKTOP', 'MOBILE'] })
  @IsOptional()
  @IsIn(['DESKTOP', 'MOBILE'])
  pageView?: 'DESKTOP' | 'MOBILE';
}

export enum PaymentSortBy {
  createdAt = 'createdAt',
  amount = 'amount',
  paidAt = 'paidAt',
  status = 'status',
  /** The date the payment happened: paidAt when paid, else createdAt. */
  eventAt = 'eventAt',
}

export enum PaymentSortOrder {
  asc = 'asc',
  desc = 'desc',
}

/**
 * Declare a bank transfer. The doctor sends this AFTER initiating
 * the wire from their bank; the optional `bankReference` is the
 * doctor's note to the admin. `proofFile` rides on multipart and is
 * NOT modelled here — multer attaches it.
 */
export class DeclareBankTransferDto {
  @ApiPropertyOptional({ example: 'TRF-2026-05-24-12345' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankReference?: string;
}

/**
 * Admin confirms a bank transfer (transitions awaiting_confirmation
 * → success). The optional `notes` is appended to Payment.notes for
 * the audit trail.
 */
export class ConfirmPaymentDto {
  @ApiPropertyOptional({ description: 'Admin note (audit log)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

/**
 * Admin rejects a manual payment. Reason is REQUIRED so the doctor
 * sees why their declaration was refused.
 */
export class RejectPaymentDto {
  @ApiProperty({ description: 'Why the manual payment is rejected.' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  rejectionReason!: string;
}

/**
 * Admin records a cash payment directly. Amount is loaded from the
 * installment server-side — the receipt + notes are optional admin
 * metadata.
 */
export class RecordCashPaymentDto {
  @ApiPropertyOptional({ example: 'CSH-1042' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  receiptNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

/**
 * Filter for the payment history + pending-confirmations queue.
 *
 * Two roles consume this:
 *   • admin/super_admin → every column is honoured (system-wide view)
 *   • dentist           → server scopes to caller's own orders before
 *                         applying filters (doctorId is silently
 *                         overwritten with the JWT user id)
 *
 * Designed to scale to hundreds of thousands of rows: every filter is
 * server-side, sorting is server-side, and the (orderId, status),
 * (status, createdAt) and (status, paidAt) indexes cover the common
 * access paths. Search is ILIKE; for very large scale, swap to a tsvector.
 */
export class PaymentFilterDto {
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
    enum: PaymentRecordStatus,
    description: 'Single-status filter — legacy field, prefer `statuses[]`.',
  })
  @IsOptional()
  @IsEnum(PaymentRecordStatus)
  status?: PaymentRecordStatus;

  @ApiPropertyOptional({
    enum: PaymentRecordStatus,
    isArray: true,
    description:
      'Filter by one or more PaymentRecordStatus values. Accepts a comma-separated string or repeated query params.',
  })
  @IsOptional()
  @Transform(({ value }) => toQueryList(value))
  @IsArray()
  @ArrayMaxSize(10)
  @IsEnum(PaymentRecordStatus, { each: true })
  statuses?: PaymentRecordStatus[];

  @ApiPropertyOptional({
    enum: PaymentMethod,
    description: 'Single-method filter — legacy field, prefer `methods[]`.',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    isArray: true,
    description:
      'Filter by one or more PaymentMethod values. Accepts a comma-separated string or repeated query params.',
  })
  @IsOptional()
  @Transform(({ value }) => toQueryList(value))
  @IsArray()
  @ArrayMaxSize(5)
  @IsEnum(PaymentMethod, { each: true })
  methods?: PaymentMethod[];

  @ApiPropertyOptional({
    enum: PaymentPurpose,
    description:
      'installment: the quote installments. treatment_fee: the card attempts of treatment fees, which GET /orders/admin/treatment-fees already lists from the orders themselves.',
  })
  @IsOptional()
  @IsEnum(PaymentPurpose)
  purpose?: PaymentPurpose;

  @ApiPropertyOptional({
    maxLength: 120,
    description:
      'Free-text search, case-insensitive: order code, doctor name, patient name, transaction id (gateway id, bank reference, cash receipt), receipt number (FAC-…), ClicToPay reference (ORA-…), and the exact amount when the term is one ("1500", "1500,5", "1 500,000", "1 500,000 TND"). Trimmed; blank means no search.',
  })
  @Transform(({ value }) => toOptionalTrimmed(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by owning doctor (admin only — dentists are scoped to themselves).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  doctorId?: string;

  @ApiPropertyOptional({
    description: 'Filter by patient on the parent order.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  patientId?: string;

  @ApiPropertyOptional({
    example: '2026-11-01',
    description:
      'First day, included (YYYY-MM-DD, Africa/Tunis days), of the date the payment happened: when it was received, or when it was made if it never was (an attempt, a transfer awaiting confirmation).',
  })
  @Transform(({ value }) => toOptionalTrimmed(value))
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-06',
    description:
      'Last day, included (YYYY-MM-DD, Africa/Tunis days). Before `from`: 400 INVALID_DATE_RANGE.',
  })
  @Transform(({ value }) => toOptionalTrimmed(value))
  @IsOptional()
  @IsCalendarDate()
  to?: string;

  @ApiPropertyOptional({
    deprecated: true,
    description:
      'Deprecated, use `from`. ISO date — payments created ON or AFTER this date (UTC day).',
    example: '2025-01-01',
  })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({
    deprecated: true,
    description:
      'Deprecated, use `to`. ISO date — payments created ON or BEFORE this date (UTC day).',
    example: '2025-12-31',
  })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({
    enum: PaymentSortBy,
    default: PaymentSortBy.createdAt,
    description:
      'eventAt: the date the payment happened, when it was received or else when it was made (the date `from` / `to` filter on). paidAt: the payments not received come last. Every sort ends on the id.',
  })
  @IsOptional()
  @IsEnum(PaymentSortBy)
  sortBy?: PaymentSortBy;

  @ApiPropertyOptional({
    enum: PaymentSortOrder,
    default: PaymentSortOrder.desc,
  })
  @IsOptional()
  @IsEnum(PaymentSortOrder)
  sortOrder?: PaymentSortOrder;
}

/**
 * Takings query (GET /payments/summary). No date at all means today; one
 * bound leaves the period open on the other side.
 */
export class PaymentSummaryQueryDto {
  @ApiPropertyOptional({
    example: '2026-11-01',
    description:
      'First day, included (YYYY-MM-DD, Africa/Tunis days). Neither `from` nor `to`: today.',
  })
  @Transform(({ value }) => toOptionalTrimmed(value))
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-06',
    description:
      'Last day, included (YYYY-MM-DD, Africa/Tunis days). Before `from`: 400 INVALID_DATE_RANGE.',
  })
  @Transform(({ value }) => toOptionalTrimmed(value))
  @IsOptional()
  @IsCalendarDate()
  to?: string;

  @ApiPropertyOptional({
    description:
      'Admin only: the takings of one dentist. Ignored for a dentist, who always gets their own.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  doctorId?: string;
}

export class PaymentBucketDto {
  @ApiProperty({
    example: '1250.500',
    description: 'Sum in TND, always written with 3 decimals.',
  })
  amount!: string;

  @ApiProperty({ example: 3, description: 'Number of payments summed.' })
  count!: number;
}

export class PaymentMethodBucketsDto {
  @ApiProperty({ type: PaymentBucketDto })
  cash!: PaymentBucketDto;

  @ApiProperty({ type: PaymentBucketDto })
  card!: PaymentBucketDto;

  @ApiProperty({ type: PaymentBucketDto })
  bank_transfer!: PaymentBucketDto;
}

export class PaymentPurposeSummaryDto extends PaymentBucketDto {
  @ApiProperty({ type: PaymentMethodBucketsDto })
  methods!: PaymentMethodBucketsDto;
}

export class PaymentPurposeSummariesDto {
  @ApiProperty({
    type: PaymentPurposeSummaryDto,
    description: 'Quote installments.',
  })
  installment!: PaymentPurposeSummaryDto;

  @ApiProperty({
    type: PaymentPurposeSummaryDto,
    description: 'Treatment fees, read from the orders.',
  })
  treatment_fee!: PaymentPurposeSummaryDto;
}

/** Money received (successful payments) over a period, per kind and per method. */
export class PaymentsSummaryDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-11-06',
    description: 'First day of the resolved period; null when open.',
  })
  from!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-11-06',
    description: 'Last day of the resolved period; null when open.',
  })
  to!: string | null;

  @ApiProperty({ enum: [BUSINESS_TIME_ZONE] })
  timeZone!: typeof BUSINESS_TIME_ZONE;

  @ApiProperty({ enum: ['TND'] })
  currency!: 'TND';

  @ApiProperty({
    type: PaymentBucketDto,
    description: 'Both kinds, every method.',
  })
  total!: PaymentBucketDto;

  @ApiProperty({
    type: PaymentMethodBucketsDto,
    description: 'Both kinds, per method.',
  })
  methods!: PaymentMethodBucketsDto;

  @ApiProperty({ type: PaymentPurposeSummariesDto })
  purposes!: PaymentPurposeSummariesDto;
}

// ─── Dev-only mock helper bodies ────────────────────────────────

export class MockForceInstallmentAvailableDto {
  @ApiProperty()
  @IsString()
  installmentId!: string;
}

export class MockSimulateCallbackDto {
  @ApiProperty()
  @IsString()
  paymentId!: string;

  @ApiProperty({ enum: ['success', 'failed', 'cancelled'] })
  @IsIn(['success', 'failed', 'cancelled'])
  status!: 'success' | 'failed' | 'cancelled';
}
