import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DashboardRangeDto } from '../../dashboard/dto/dashboard.dto';

export const REPORT_EXPORT_TYPES = ['revenue', 'doctors', 'packs'] as const;
export type ReportExportType = (typeof REPORT_EXPORT_TYPES)[number];

export class ReportSummaryDto extends DashboardRangeDto {
  @ApiPropertyOptional({
    default: 10,
    minimum: 1,
    maximum: 50,
    description: 'Maximum rows returned for doctor and pack report tables.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class ReportExportParamDto {
  @ApiPropertyOptional({
    enum: REPORT_EXPORT_TYPES,
    description: 'CSV report to export.',
  })
  @IsIn(REPORT_EXPORT_TYPES)
  type!: ReportExportType;
}
