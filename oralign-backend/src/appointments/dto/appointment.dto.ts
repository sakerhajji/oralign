import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Query params for GET /appointments/availability/:dentistProfileId.
 *
 * `from` is the first day of the window (defaults to today when omitted);
 * `days` is the window length in days (defaults to 14, capped at 30). With
 * the global ValidationPipe running `transform + enableImplicitConversion`,
 * `days` arrives as a number even though it's a query string — the explicit
 * `@Type(() => Number)` keeps the intent obvious.
 */
export class AvailabilityQueryDto {
  @ApiPropertyOptional({
    example: '2026-07-20',
    description: 'First day of the availability window (YYYY-MM-DD).',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from must be a date in YYYY-MM-DD format',
  })
  from?: string;

  @ApiPropertyOptional({
    example: 14,
    minimum: 1,
    maximum: 30,
    description: 'Number of days to look ahead (default 14, max 30).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  days?: number;
}

/**
 * Public appointment-request payload. The patient is NOT an app User — this
 * is an unauthenticated lead captured from the "Trouver un praticien"
 * directory, so every field is validated defensively.
 */
export class CreateAppointmentDto {
  @ApiProperty({ example: 'clxyz...', description: 'Target dentist profile ID.' })
  @IsString()
  @IsNotEmpty()
  dentistProfileId!: string;

  @ApiProperty({ example: 'Marie Dupont', description: 'Patient full name.' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  patientName!: string;

  @ApiProperty({ example: 'marie@example.com', description: 'Patient email.' })
  @IsEmail()
  patientEmail!: string;

  @ApiPropertyOptional({ example: '+216 20 123 456' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  patientPhone?: string;

  @ApiPropertyOptional({ example: '12 Rue de la Liberté, Tunis' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  patientAddress?: string;

  @ApiPropertyOptional({ example: 'I would like a first consultation.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @ApiProperty({
    example: '2026-07-20T09:00:00.000Z',
    description: 'Chosen slot start, ISO-8601 (must be an available slot).',
  })
  @IsISO8601()
  requestedAt!: string;

  @ApiProperty({ example: 'fr', enum: ['fr', 'en'] })
  @IsIn(['fr', 'en'])
  lang!: 'fr' | 'en';
}
