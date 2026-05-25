import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentRecordStatus } from '@prisma/client';
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
} from 'class-validator';

export enum PaymentSortBy {
  createdAt = 'createdAt',
  amount = 'amount',
  paidAt = 'paidAt',
  status = 'status',
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
 * server-side, sorting is server-side, and the (orderId, status) +
 * (status, createdAt) indexes cover the common access paths. Search
 * is ILIKE on order code; for very large scale, swap to a tsvector.
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
  @Transform(({ value }) => normaliseEnumArray(value))
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
  @Transform(({ value }) => normaliseEnumArray(value))
  @IsArray()
  @ArrayMaxSize(5)
  @IsEnum(PaymentMethod, { each: true })
  methods?: PaymentMethod[];

  @ApiPropertyOptional({
    description:
      'Free-text search across order code, doctor name, patient name, and bank reference. Case-insensitive.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
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
    description: 'ISO date — payments created ON or AFTER this date.',
    example: '2025-01-01',
  })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({
    description: 'ISO date — payments created ON or BEFORE this date.',
    example: '2025-12-31',
  })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({
    enum: PaymentSortBy,
    default: PaymentSortBy.createdAt,
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
 * Normalises a query param that may arrive as:
 *   • undefined / null
 *   • a comma-separated string ("a,b,c")
 *   • a repeated query array (["a","b","c"])
 * into a clean array. Empty strings are dropped so a stray comma
 * doesn't fail validation.
 */
function normaliseEnumArray(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
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
