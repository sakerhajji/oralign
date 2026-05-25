import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Date-range filter shared by admin + doctor dashboard endpoints.
 *
 * Defaults (when both fields are omitted): last 30 days ending now.
 * Service layer materialises the defaults so we keep DTO validation
 * permissive and reusable for "all time" sentinels.
 */
export class DashboardRangeDto {
  @ApiPropertyOptional({
    description: 'ISO date — inclusive lower bound. Defaults to (now − 30 days).',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    description: 'ISO date — inclusive upper bound. Defaults to now.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class AdminAnalyticsLimitDto extends DashboardRangeDto {
  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
