import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { REASON_MAX_LENGTH } from '../../common/exceptions/domain-error-codes';
import type { ReactivateDoctorBody } from './doctor-activity.contract';

/**
 * POST users/:id/reactivate. The 3-500 character rule is checked by the
 * service (validReason) so every bad reason answers the SAME stable
 * 400 REACTIVATION_REASON_REQUIRED; the DTO only bounds the payload.
 */
export class ReactivateDoctorDto implements Partial<ReactivateDoctorBody> {
  @ApiProperty({
    description:
      'Why the account is reactivated (3-500 characters once trimmed), kept in the activity journal.',
    example: 'Le praticien reprend ses cas en janvier.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(REASON_MAX_LENGTH * 4)
  reason?: string;
}

export const ACTIVITY_EVENTS_MAX_LIMIT = 50;

/** GET users/:id/activity-events: newest first. */
export class ActivityEventsQueryDto {
  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({
    required: false,
    default: 10,
    minimum: 1,
    maximum: ACTIVITY_EVENTS_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ACTIVITY_EVENTS_MAX_LIMIT)
  limit: number = 10;
}
