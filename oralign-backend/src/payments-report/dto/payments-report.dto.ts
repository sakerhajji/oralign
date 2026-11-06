import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentRecordStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsCalendarDate } from '../../common/decorators/is-calendar-date.decorator';
import { toOptionalTrimmed } from '../../common/dto/query-transforms';

/** Which money the report covers. */
export enum PaymentsReportKind {
  treatmentFee = 'treatment_fee',
  installment = 'installment',
  /** Both kinds, each in its own section, one overall total. */
  consolidated = 'consolidated',
}

/** The desk's row orders: the report prints its rows in the same order. */
export enum PaymentsReportSort {
  recent = 'recent',
  oldest = 'oldest',
  amountDesc = 'amount-desc',
  amountAsc = 'amount-asc',
}

export type PaymentsReportLanguage = 'fr' | 'en';

/**
 * The filters of one tab of the payments desk, sent as they are on
 * screen: a report holds exactly the rows the tab lists (every page).
 */
export class PaymentsReportSectionDto {
  @ApiPropertyOptional({
    maxLength: 120,
    description:
      "The tab's search: dentist or patient name, order code, transaction reference, receipt number, exact amount.",
  })
  @Transform(({ value }) => toOptionalTrimmed(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    description:
      'Admin only: one dentist. Ignored for a dentist, whose report is always their own.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  doctorId?: string;

  @ApiPropertyOptional({ enum: PaymentMethod, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsEnum(PaymentMethod, { each: true })
  methods?: PaymentMethod[];

  @ApiPropertyOptional({ enum: PaymentRecordStatus, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEnum(PaymentRecordStatus, { each: true })
  statuses?: PaymentRecordStatus[];

  @ApiPropertyOptional({
    enum: PaymentsReportSort,
    default: PaymentsReportSort.recent,
  })
  @IsOptional()
  @IsEnum(PaymentsReportSort)
  sort?: PaymentsReportSort;
}

export class PaymentsReportInstallmentsDto extends PaymentsReportSectionDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 99,
    description:
      'Lowest installment rank on its quote, included (1 = the first).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  installmentMin?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 99,
    description: 'Highest installment rank on its quote, included.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  installmentMax?: number;
}

/** POST /payments/report: the PDF of what the payments desk shows. */
export class PaymentsReportRequestDto {
  @ApiProperty({ enum: PaymentsReportKind })
  @IsEnum(PaymentsReportKind)
  kind!: PaymentsReportKind;

  @ApiPropertyOptional({
    example: '2026-11-01',
    description:
      'First day, included (YYYY-MM-DD, Africa/Tunis days). Neither `from` nor `to`: today. Only `to`: every date up to it.',
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
      '"All dates": the rows carry no date filter (a treatment fee still to confirm has no paid date and stays listed); the money is counted up to `to`, today by default. `from` must then be absent.',
  })
  @IsOptional()
  @IsBoolean()
  allDates?: boolean;

  @ApiPropertyOptional({ enum: ['fr', 'en'], default: 'fr' })
  @IsOptional()
  @IsIn(['fr', 'en'])
  lang?: PaymentsReportLanguage;

  @ApiPropertyOptional({
    type: PaymentsReportSectionDto,
    description:
      'The treatment-fees tab filters (kinds treatment_fee and consolidated).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentsReportSectionDto)
  treatmentFees?: PaymentsReportSectionDto;

  @ApiPropertyOptional({
    type: PaymentsReportInstallmentsDto,
    description:
      'The installments tab filters (kinds installment and consolidated).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentsReportInstallmentsDto)
  installments?: PaymentsReportInstallmentsDto;
}
