import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query params accepted by `GET /notifications`. Matches the
 * `PaginatedResponse<T>` shape used by every other list endpoint.
 *
 * `unreadOnly` is the common filter on the bell dropdown — defaults
 * to `false` so the full inbox is the implicit catch-all.
 */
export class NotificationFilterDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;
}

export class UnreadCountResponseDto {
  @ApiProperty({ example: 3 })
  count!: number;
}
