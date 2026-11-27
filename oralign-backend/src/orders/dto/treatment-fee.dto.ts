import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentRecordStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
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
import {
  TRANSFER_STATES,
  type TransferState,
} from '../../payments/services/transfer-state';
import { PayTreatmentFeeDto, SortOrder } from './order.dto';

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
      'One or more statuses, comma-separated or as repeated query params. A fee is awaiting_confirmation (a declared transfer), rejected (a transfer the admin refused, with its reason) or success.',
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

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 347.5,
    description:
      'Cash collected: the fee due + the droit de timbre, net of any retenue à la source.',
  })
  amount!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 1 })
  withholdingRate!: number | null;

  @ApiProperty({
    example: 3.5,
    description:
      'Retenue à la source kept back (0 when none), computed on the fee due (stamp excluded).',
  })
  withholdingAmount!: number;

  @ApiProperty({
    example: 1,
    description:
      'Droit de timbre charged on top with the payment (0 on fees paid before 2026-11-20). Fee due = amount + withholdingAmount - stampAmount.',
  })
  stampAmount!: number;

  @ApiProperty({ enum: PaymentMethod, nullable: true })
  method!: PaymentMethod | null;

  @ApiProperty({ enum: PaymentRecordStatus, nullable: true })
  status!: PaymentRecordStatus | null;

  @ApiProperty({ type: Date, nullable: true })
  paidAt!: Date | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Stored path of the receipt, for the owning dentist and admins (the only callers of these lists). Never a URL: the file is read through GET orders/:id/treatment-fee/proof.',
  })
  proofPath!: string | null;

  @ApiProperty({ description: 'A receipt is attached to the declaration.' })
  hasProof!: boolean;

  @ApiProperty({
    enum: TRANSFER_STATES,
    description:
      'Derived transfer state (transfer-state.ts): awaiting_receipt, receipt_sent, to_verify (an admin opened the receipt), paid, refused.',
  })
  state!: TransferState;

  @ApiProperty({
    type: Date,
    nullable: true,
    description:
      "When the transfer was declared (the declaration's identity: subject treatment_fee:<orderId>:<epoch ms>).",
  })
  declaredAt!: Date | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'The FIRST time an admin opened the receipt.',
  })
  reviewOpenedAt!: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  rejectedAt!: Date | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "The admin's reason, when the transfer was refused.",
  })
  rejectionReason!: string | null;

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

/** Upper bound of a free-text input; the trimmed 3-500 rule is the service's. */
const NOTE_MAX_INPUT = 2000;

/**
 * POST orders/:id/treatment-fee/pay. `bank_transfer` is for an admin
 * declaring for the doctor WITHOUT a receipt, with `overrideNote`; a
 * dentist declares through the receipt upload (400 PROOF_REQUIRED here).
 */
export class PayTreatmentFeeRequestDto extends PayTreatmentFeeDto {
  @ApiPropertyOptional({
    maxLength: NOTE_MAX_INPUT,
    description:
      'Admin, bank_transfer without a receipt: why (trimmed, 3-500 characters, else 400 PROOF_OVERRIDE_NOTE_REQUIRED).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(NOTE_MAX_INPUT)
  overrideNote?: string;
}

/** POST orders/:id/treatment-fee/confirm. */
export class ConfirmTreatmentFeeDto {
  @ApiPropertyOptional({
    maxLength: NOTE_MAX_INPUT,
    description:
      'Required to confirm a declaration that has NO receipt (trimmed, 3-500 characters, else 400 PROOF_OVERRIDE_NOTE_REQUIRED). Journaled.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(NOTE_MAX_INPUT)
  overrideNote?: string;

  @ApiPropertyOptional({
    example: '2026-11-27T09:30:00.000Z',
    description:
      'Optional: the declaredAt of the declaration the admin reviewed. A receipt replaced since is a 409 TRANSFER_ALREADY_PROCESSED, never confirmed unseen.',
  })
  @IsOptional()
  @IsDateString()
  declaredAt?: string;
}

/** POST orders/:id/treatment-fee/reject. */
export class RejectTreatmentFeeDto {
  @ApiProperty({
    minLength: 3,
    maxLength: 500,
    description:
      'Why the transfer is refused, shown to the doctor as « Motif : … ». Trimmed, 3-500 characters (400 REJECTION_REASON_INVALID).',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(NOTE_MAX_INPUT)
  rejectionReason!: string;

  @ApiPropertyOptional({
    example: '2026-11-27T09:30:00.000Z',
    description:
      'Optional: the declaredAt of the declaration the admin reviewed (409 TRANSFER_ALREADY_PROCESSED when replaced since).',
  })
  @IsOptional()
  @IsDateString()
  declaredAt?: string;
}

/** POST orders/:id/treatment-fee/review-opened. */
export class TreatmentFeeReviewOpenedDto {
  @ApiProperty()
  orderId!: string;

  @ApiProperty({
    example: 'treatment_fee:2b1c…:1764235800000',
    description: 'notification-subject.ts key of the declaration.',
  })
  subjectKey!: string;

  @ApiProperty({
    type: Date,
    nullable: true,
    description:
      'The FIRST opening by an admin. Null on a declaration processed before anyone opened it.',
  })
  reviewOpenedAt!: Date | null;

  @ApiProperty({ description: 'True when this call stamped reviewOpenedAt.' })
  firstOpen!: boolean;
}

/**
 * The treatment-fee transfer fields every order response carries next to
 * OrderResponseDto (order.mapper.ts). `treatmentFeeProofPath` stays on
 * OrderResponseDto, for the owning dentist and admins only.
 */
export class OrderTreatmentFeeTransferDto {
  @ApiProperty({
    description:
      'A receipt is attached to the fee declaration. Read it through GET orders/:id/treatment-fee/proof (owner and admins).',
  })
  treatmentFeeHasProof!: boolean;

  @ApiProperty({ type: Date, nullable: true })
  treatmentFeeDeclaredAt!: Date | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'The FIRST time an admin opened the receipt.',
  })
  treatmentFeeReviewOpenedAt!: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  treatmentFeeRejectedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  treatmentFeeRejectionReason!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Retenue threshold in force when the fee was charged (snapshot; null = before the threshold existed).',
  })
  treatmentFeeWithholdingThreshold!: number | null;
}
