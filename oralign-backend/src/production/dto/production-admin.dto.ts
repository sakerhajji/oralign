import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductionNoticeStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../common/decorators/is-calendar-date.decorator';
import { rawBoolean } from '../../common/dto/query-transforms';
import { NOTICE_MAX_ATTEMPTS } from '../production.constants';
import {
  ProductionPageQueryDto,
  ProductionSearchPageQueryDto,
} from './production-list.dto';

// Admin desk queries (ProductionAdminController, production/admin/*).
// Periods are Tunis days, both ends included (businessDayRange); the
// service refuses from > to (400 INVALID_DATE_RANGE) and a period longer
// than MAX_REPORT_DAYS (400 INVALID_DATE_RANGE).

/** GET production/admin/summary · anomalies */
export class ProductionPeriodQueryDto {
  @ApiProperty({
    example: '2026-11-01',
    description: 'First Tunis day (YYYY-MM-DD).',
  })
  @IsCalendarDate()
  from!: string;

  @ApiProperty({
    example: '2026-11-30',
    description: 'Last Tunis day, included. from = to is the daily journal.',
  })
  @IsCalendarDate()
  to!: string;
}

export enum ProductionExportFormat {
  /** One line per event, cancelled and legacy rows included and flagged. */
  detail = 'detail',
  /** One line per Tunis day: Σ quantity per act of the counted rows. */
  daily = 'daily',
}

/** GET production/admin/export.csv */
export class ProductionExportQueryDto extends ProductionPeriodQueryDto {
  @ApiPropertyOptional({
    enum: ProductionExportFormat,
    default: ProductionExportFormat.detail,
  })
  @IsOptional()
  @IsEnum(ProductionExportFormat)
  format?: ProductionExportFormat;
}

export enum ProductionProgressStateParam {
  all = 'all',
  active = 'active',
  done = 'done',
}

/** GET production/admin/progress */
export class ProductionProgressQueryDto extends ProductionSearchPageQueryDto {
  @ApiPropertyOptional({
    enum: ProductionProgressStateParam,
    default: ProductionProgressStateParam.all,
    description:
      'all = in the queue or with progress; active = the queue rule (D3); done = with progress, out of the queue.',
  })
  @IsOptional()
  @IsEnum(ProductionProgressStateParam)
  state?: ProductionProgressStateParam;
}

/** GET production/admin/notices */
export class ProductionNoticesQueryDto extends ProductionPageQueryDto {
  @ApiPropertyOptional({ enum: ProductionNoticeStatus })
  @IsOptional()
  @IsEnum(ProductionNoticeStatus)
  status?: ProductionNoticeStatus;

  @ApiPropertyOptional({
    description: `true = failed for good (status failed AND attempts >= ${NOTICE_MAX_ATTEMPTS}: no automatic retry left); false = every other notice. A failed row below the limit is retried by the dispatcher on its own.`,
  })
  @IsOptional()
  // From the raw value: implicit conversion would read "false" as true.
  @Transform(rawBoolean)
  @IsBoolean()
  exhausted?: boolean;
}
