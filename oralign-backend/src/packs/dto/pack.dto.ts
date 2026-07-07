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
  ValidateNested,
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

/**
 * A bilingual text bag — `Localized<string>` = { fr, en? }. Stored as a
 * JSONB column (same shape the Blog model uses). Both leaves are optional
 * at the validation layer; the service enforces "FR name required" for
 * the pack name specifically. English is always optional — when absent
 * the UI falls back to French.
 */
export class LocalizedTextDto {
  @ApiPropertyOptional({ example: 'Forfait Express' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  @Transform(({ value }) => normalizeOptionalString(value))
  fr?: string;

  @ApiPropertyOptional({ example: 'Express Pack' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  @Transform(({ value }) => normalizeOptionalString(value))
  en?: string;
}

export class CreatePackDto {
  // Legacy single-language name — kept OPTIONAL for backward-compat. New
  // clients send `nameI18n` instead; the service derives the effective
  // French name from `nameI18n.fr ?? name` and requires it to be present.
  @ApiPropertyOptional({ example: 'SMART' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Transform(({ value }) => normalizeOptionalString(value))
  name?: string;

  @ApiPropertyOptional({
    type: LocalizedTextDto,
    description:
      'Localized product name { fr, en? }. FR is required (falls back to the legacy `name`).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  nameI18n?: LocalizedTextDto;

  @ApiPropertyOptional({ example: '24 steps · 2 included corrections' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  @Transform(({ value }) => normalizeOptionalString(value))
  description?: string;

  @ApiPropertyOptional({ type: LocalizedTextDto, description: 'Localized description { fr?, en? }.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  descriptionI18n?: LocalizedTextDto;

  @ApiPropertyOptional({
    type: LocalizedTextDto,
    description: 'Treatment expiration / duration label { fr?, en? }.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  treatmentExpirationLabel?: LocalizedTextDto;

  @ApiPropertyOptional({
    type: LocalizedTextDto,
    description: 'Finishing-included label { fr?, en? }.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  finishingIncludedLabel?: LocalizedTextDto;

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
      'Legacy inline price → creates an ACTIVE two_arches PackPrice. Prefer `priceTwoArches`; kept for backward-compat.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Type(() => Number)
  price?: number;

  // ─── Arch-specific prices (table-style pricing) ─────────────────
  // When set, the service creates the ACTIVE PackPrice for that arch
  // atomically with the pack. At least one price (priceTwoArches,
  // priceSingleArch, or legacy `price`) is required — enforced in the
  // service. Both share the single `currency`.
  @ApiPropertyOptional({ example: 2100, description: 'Price for TWO arches.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Type(() => Number)
  priceTwoArches?: number;

  @ApiPropertyOptional({
    example: 1300,
    description:
      'Price for a SINGLE arch. Omit (or null) to not offer single-arch — orders then disable "Arcade unique" for this pack.',
    nullable: true,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Type(() => Number)
  priceSingleArch?: number | null;

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

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  nameI18n?: LocalizedTextDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(280)
  @Transform(({ value }) => normalizeOptionalString(value))
  description?: string;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  descriptionI18n?: LocalizedTextDto;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  treatmentExpirationLabel?: LocalizedTextDto;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  finishingIncludedLabel?: LocalizedTextDto;

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
      'Legacy inline price update → updates/creates the ACTIVE two_arches price. Prefer `priceTwoArches`.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Type(() => Number)
  price?: number;

  @ApiPropertyOptional({ example: 2100, description: 'Price for TWO arches.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Type(() => Number)
  priceTwoArches?: number;

  @ApiPropertyOptional({
    example: 1300,
    description:
      'Price for a SINGLE arch. Pass null to archive (stop offering) single-arch pricing.',
    nullable: true,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Type(() => Number)
  priceSingleArch?: number | null;

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
