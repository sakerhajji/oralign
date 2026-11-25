import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../common/decorators/is-calendar-date.decorator';
import { toOptionalTrimmed } from '../../common/dto/query-transforms';

/**
 * GET admin/invoices/accounting-summary: the accountant's period, Tunis
 * business days, both bounds included. Either bound may be left out (open
 * side); neither = the whole history.
 */
export class AccountingSummaryQueryDto {
  @ApiPropertyOptional({
    example: '2026-11-01',
    description: 'Premier jour inclus (YYYY-MM-DD, jours de Tunis), sur la date d emission.',
  })
  @Transform(({ value }) => toOptionalTrimmed(value))
  @IsOptional()
  @IsCalendarDate()
  issuedFrom?: string;

  @ApiPropertyOptional({
    example: '2026-11-30',
    description:
      'Dernier jour inclus (YYYY-MM-DD, jours de Tunis). Avant issuedFrom : 400 INVALID_DATE_RANGE.',
  })
  @Transform(({ value }) => toOptionalTrimmed(value))
  @IsOptional()
  @IsCalendarDate()
  issuedTo?: string;
}

/** GET admin/invoices/accounting-summary/pdf: the same period, printed. */
export class AccountingSummaryPdfQueryDto extends AccountingSummaryQueryDto {
  @ApiPropertyOptional({ enum: ['fr', 'en'], default: 'fr' })
  @Transform(({ value }) => toOptionalTrimmed(value))
  @IsOptional()
  @IsIn(['fr', 'en'])
  language?: 'fr' | 'en';
}
