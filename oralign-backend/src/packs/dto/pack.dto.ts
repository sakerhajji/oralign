import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArchType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Normalise an optional text field by trimming + collapsing empty
 * strings to `undefined` so the service can use `?? null` cleanly.
 * Matches the pattern already used by the patient + order DTOs.
 */
const normalizeOptionalString = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class CreatePackDto {
  @ApiProperty({ example: 'SMART' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Transform(({ value }) => normalizeOptionalString(value))
  name!: string;

  @ApiPropertyOptional({ example: '24 steps · 2 included corrections' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  @Transform(({ value }) => normalizeOptionalString(value))
  description?: string;

  // `maxStepsPerArch` MUST be null when `isUnlimitedSteps` is true.
  // The service enforces that — class-validator can't express the
  // cross-field rule, so we only validate the individual shape here.
  @ApiPropertyOptional({ example: 24, description: 'Null when unlimited steps' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxStepsPerArch?: number | null;

  @ApiPropertyOptional({ example: 2, description: 'Null when unlimited corrections' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  includedCorrections?: number | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isUnlimitedSteps?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isUnlimitedCorrections?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Restricts the pack to orthodontists when true.',
  })
  @IsOptional()
  @IsBoolean()
  isForOrthodontists?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // ─── Inline price (single source of truth in the admin UI) ──
  // When provided, the service creates an ACTIVE PackPrice (archType
  // defaults to two_arches — the canonical pricing unit) atomically
  // with the Pack so the admin doesn't need a second "Manage prices"
  // trip. Passing only one of price/currency is treated as a
  // configuration error.
  @ApiPropertyOptional({
    example: '2100.000',
    description:
      'Optional inline price. When set, the service creates an ACTIVE PackPrice with archType=two_arches atomically with the pack.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Type(() => Number)
  price?: number;

  @ApiPropertyOptional({ example: 'TND', default: 'TND' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;
}

export class UpdatePackDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Transform(({ value }) => normalizeOptionalString(value))
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(280)
  @Transform(({ value }) => normalizeOptionalString(value))
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxStepsPerArch?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  includedCorrections?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isUnlimitedSteps?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isUnlimitedCorrections?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isForOrthodontists?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // ─── Inline price update ────────────────────────────────────
  // When provided, the service updates the pack's ACTIVE
  // two_arches price atomically with the pack update. If no
  // active price exists yet, one is created. Existing quotations
  // that snapshotted the old price are untouched (we never edit
  // the snapshot — only the catalogue row).
  @ApiPropertyOptional({
    description:
      'Inline price update. Updates (or creates) the ACTIVE PackPrice row for archType=two_arches.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Type(() => Number)
  price?: number;

  @ApiPropertyOptional({ example: 'TND' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;
}

export class CreatePackPriceDto {
  @ApiProperty({ enum: ArchType })
  @IsEnum(ArchType)
  archType!: ArchType;

  // Money is sent as a string to preserve 3-decimal precision (TND
  // millimes) — JavaScript numbers can't safely represent "0.001"
  // round-trips. The service converts to Prisma.Decimal.
  @ApiProperty({ example: '2100.000', description: 'TND amount as string with up to 3 decimals' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Type(() => Number)
  price!: number;

  @ApiPropertyOptional({ default: 'TND' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;
}

export class UpdatePackPriceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Type(() => Number)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  /**
   * Setting `isActive: false` archives this price — the snapshot on
   * existing quotes remains intact, but new quotes can no longer
   * pick this price. Re-activating is also allowed.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PackFilterDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Match name (case-insensitive)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'When true, includes soft-deleted + inactive packs.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;
}
