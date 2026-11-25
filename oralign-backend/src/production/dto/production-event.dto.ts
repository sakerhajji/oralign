import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryRecipient, ProductionEventType } from '@prisma/client';
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
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  rawBoolean,
  toOptionalTrimmed,
} from '../../common/dto/query-transforms';
import { BadRequestException } from '../../common/exceptions/app.exception';
import {
  CANCEL_REASON_MAX_LENGTH,
  CANCEL_REASON_MIN_LENGTH,
  IDEMPOTENCY_KEY_SHAPE,
  MAX_EVENT_QUANTITY,
  MAX_PRODUCTION_STEP,
  MIN_PRODUCTION_STEP,
  NOTE_MAX_LENGTH,
  RECIPIENT_NAME_MAX_LENGTH,
} from '../production.constants';
import {
  PRODUCTION_ERROR,
  PRODUCTION_WARNING,
  type ProductionWarningCode,
} from '../production.contract';

// Shape-level validation only. The business rules (from ≤ to, planned
// total, released steps, date window, warnings) need the persisted state
// and run in the service under the order lock.

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const optionalTrimmed = ({ value }: { value: unknown }): unknown =>
  toOptionalTrimmed(value);

const WARNING_CODES = Object.values(PRODUCTION_WARNING);

// The act's day and time are checked for their SHAPE only: whether that
// day or time exists is the service's businessInstant(), whose coded 400
// INVALID_DATE / INVALID_TIME the declare form maps to its own message.
// IsCalendarDate / IsClockTime would refuse first with an uncoded 400.
const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_SHAPE = /^\d{2}:\d{2}$/;

/** The form's arch choice: `both` writes one row per arch. */
export enum ProductionArchChoiceParam {
  upper = 'upper',
  lower = 'lower',
  both = 'both',
}

/** POST production/events (header Idempotency-Key required). */
export class DeclareProductionEventDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({ enum: ProductionEventType })
  @IsEnum(ProductionEventType)
  type!: ProductionEventType;

  @ApiProperty({ enum: ProductionArchChoiceParam })
  @IsEnum(ProductionArchChoiceParam)
  arch!: ProductionArchChoiceParam;

  @ApiProperty({ minimum: MIN_PRODUCTION_STEP, maximum: MAX_PRODUCTION_STEP })
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PRODUCTION_STEP)
  @Max(MAX_PRODUCTION_STEP)
  stepFrom!: number;

  @ApiProperty({ minimum: MIN_PRODUCTION_STEP, maximum: MAX_PRODUCTION_STEP })
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PRODUCTION_STEP)
  @Max(MAX_PRODUCTION_STEP)
  stepTo!: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_EVENT_QUANTITY,
    description:
      'Per arch. Defaults to stepTo - stepFrom + 1; another value raises the quantity_differs warning.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_EVENT_QUANTITY)
  quantity?: number;

  @ApiPropertyOptional({
    example: '2026-11-25',
    description:
      'Tunis day of the act (YYYY-MM-DD). Sent together with performedTime, or neither: then the server time is used.',
  })
  @ValidateIf(
    (dto: DeclareProductionEventDto) =>
      dto.performedDay !== undefined || dto.performedTime !== undefined,
  )
  @Matches(DAY_SHAPE, { message: 'performedDay must be written YYYY-MM-DD' })
  performedDay?: string;

  @ApiPropertyOptional({
    example: '09:30',
    description:
      'Tunis wall-clock time of the act (HH:mm, 24 h). See performedDay.',
  })
  @ValidateIf(
    (dto: DeclareProductionEventDto) =>
      dto.performedDay !== undefined || dto.performedTime !== undefined,
  )
  @Matches(TIME_SHAPE, { message: 'performedTime must be written HH:mm' })
  performedTime?: string;

  @ApiPropertyOptional({
    maxLength: NOTE_MAX_LENGTH,
    description:
      'Required (400 NOTE_REQUIRED) as soon as warnings are confirmed.',
  })
  @IsOptional()
  @Transform(optionalTrimmed)
  @IsString()
  @MaxLength(NOTE_MAX_LENGTH)
  note?: string;

  @ApiPropertyOptional({
    enum: DeliveryRecipient,
    description:
      'Required for aligner_delivered; ignored (stored null) for the other acts.',
  })
  @ValidateIf(
    (dto: DeclareProductionEventDto) =>
      dto.type === ProductionEventType.aligner_delivered ||
      dto.deliveredTo !== undefined,
  )
  @IsEnum(DeliveryRecipient)
  deliveredTo?: DeliveryRecipient;

  @ApiPropertyOptional({
    maxLength: RECIPIENT_NAME_MAX_LENGTH,
    description: 'Optional courier / person name (deliveries only).',
  })
  @IsOptional()
  @Transform(optionalTrimmed)
  @IsString()
  @MaxLength(RECIPIENT_NAME_MAX_LENGTH)
  deliveredToName?: string;

  @ApiPropertyOptional({
    enum: WARNING_CODES,
    isArray: true,
    description:
      'The warning codes the user saw (from the 409 PRODUCTION_CONFIRM_REQUIRED) and confirmed. Every warning that applies must be in it, or the 409 comes back with the new list.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(WARNING_CODES.length)
  @IsIn(WARNING_CODES, { each: true })
  confirmWarnings?: ProductionWarningCode[];
}

/** PATCH production/events/:id/cancel */
export class CancelProductionEventDto {
  @ApiProperty({
    minLength: CANCEL_REASON_MIN_LENGTH,
    maxLength: CANCEL_REASON_MAX_LENGTH,
    description: 'Why. Staff only: never shown to the practitioner.',
  })
  @Transform(trimmed)
  @IsString()
  @MinLength(CANCEL_REASON_MIN_LENGTH)
  @MaxLength(CANCEL_REASON_MAX_LENGTH)
  reason!: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Also cancel the other arch of the same declaration.',
  })
  @IsOptional()
  @Transform(rawBoolean)
  @IsBoolean()
  alsoSibling?: boolean;
}

/**
 * The Idempotency-Key header of POST production/events, or a 400
 * PRODUCTION_IDEMPOTENCY_KEY_REQUIRED. Same shape as the order and
 * supplemental creations (8-128 of A-Z a-z 0-9 _ -).
 */
export function requireIdempotencyKey(raw: string | undefined): string {
  const key = raw?.trim();
  if (!key || !IDEMPOTENCY_KEY_SHAPE.test(key)) {
    throw new BadRequestException(
      'An Idempotency-Key header (8-128 letters, digits, _ or -) is required.',
      PRODUCTION_ERROR.IDEMPOTENCY_KEY_REQUIRED,
    );
  }
  return key;
}
