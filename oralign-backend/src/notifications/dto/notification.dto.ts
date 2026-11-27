import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { rawBoolean } from '../../common/dto/query-transforms';

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

  // Read from the RAW query value: with the global pipe's implicit
  // conversion, `?unreadOnly=false` used to arrive as Boolean('false'),
  // i.e. true, and listed the unread rows only.
  @ApiPropertyOptional({ default: false, type: Boolean })
  @IsOptional()
  @Transform(rawBoolean)
  @IsBoolean()
  unreadOnly?: boolean;
}

export class UnreadCountResponseDto {
  @ApiProperty({ example: 3 })
  count!: number;
}

/** POST notifications/subject/:subjectKey/read answer. */
export class SubjectReadResponseDto {
  @ApiProperty({
    example: 1,
    description:
      "The caller's rows of the subject that turned read (0 on a repeat).",
  })
  updated!: number;
}
