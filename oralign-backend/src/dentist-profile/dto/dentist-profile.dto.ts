import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  Max,
  IsArray,
  ValidateNested,
  IsEnum,
  IsBoolean,
  Matches,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';
import { DayOfWeek } from '@prisma/client';

/** Upper bound of DentistProfile.registrationNumber. */
export const REGISTRATION_NUMBER_MAX_LENGTH = 64;

/**
 * Optional free text: trimmed, and a blank value becomes null so a field
 * the doctor emptied is really cleared (undefined still means "leave it").
 */
export function trimToNull(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * An optional number the client emptied: a blank string or null in the
 * RAW body becomes null (cleared). Read from `obj`, the raw body: the
 * global pipe's implicit conversion has already turned "" into 0 by the
 * time the transform runs, and 0 is a real coordinate.
 */
export function blankNumberToNull({
  value,
  key,
  obj,
}: {
  value: unknown;
  key: string;
  obj: Record<string, unknown>;
}): unknown {
  const raw = obj[key];
  if (raw === null) return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  return value;
}

/** Swagger wording of the clear rule shared by the optional clinic fields. */
const CLEARS =
  'Trimmed; an empty string or null clears the stored value, an omitted ' +
  'field leaves it unchanged.';

export class CreateDentistProfileDto {
  @ApiProperty({
    example: 'Bright Smiles Dental Clinic',
    description: 'Name of the dental clinic',
  })
  @IsString()
  clinicName!: string;

  @ApiProperty({
    example: '123 Dental St, Smileville',
    description: `Full address of the clinic. ${CLEARS}`,
    required: false,
    nullable: true,
  })
  @Transform(({ value }: { value: unknown }) => trimToNull(value))
  @IsOptional()
  @IsString()
  clinicAddress?: string | null;

  @ApiProperty({
    example: 'Smileville',
    description: `City where the clinic is located. ${CLEARS}`,
    required: false,
    nullable: true,
  })
  @Transform(({ value }: { value: unknown }) => trimToNull(value))
  @IsOptional()
  @IsString()
  city?: string | null;

  @ApiProperty({
    example: 'USA',
    description: `Country where the clinic is located. ${CLEARS}`,
    required: false,
    nullable: true,
  })
  @Transform(({ value }: { value: unknown }) => trimToNull(value))
  @IsOptional()
  @IsString()
  country?: string | null;

  @ApiProperty({
    example: 34.0522,
    description: `Latitude for clinic location. ${CLEARS}`,
    required: false,
    nullable: true,
  })
  @Transform(blankNumberToNull)
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiProperty({
    example: -118.2437,
    description: `Longitude for clinic location. ${CLEARS}`,
    required: false,
    nullable: true,
  })
  @Transform(blankNumberToNull)
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiProperty({
    example: '+1-555-123-4567',
    description: `Clinic contact phone number. ${CLEARS}`,
    required: false,
    nullable: true,
  })
  @Transform(({ value }: { value: unknown }) => trimToNull(value))
  @IsOptional()
  @IsString()
  clinicPhone?: string | null;

  @ApiProperty({
    example: 'contact@brightsmiles.com',
    description: `Clinic contact email address. ${CLEARS}`,
    required: false,
    nullable: true,
  })
  @Transform(({ value }: { value: unknown }) => trimToNull(value))
  @IsOptional()
  @IsString()
  clinicEmail?: string | null;

  @ApiProperty({
    example: '1234567/A/M/000',
    description:
      "The clinic's tax registration number (Matricule fiscal). Shown on " +
      'the invoice "Billed to" block. Distinct from the company tax id. ' +
      CLEARS,
    required: false,
    nullable: true,
  })
  @Transform(({ value }: { value: unknown }) => trimToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxId?: string | null;

  @ApiProperty({
    example: 'CNOMDT-12345',
    description:
      "The practitioner's professional-order registration number. Optional " +
      'and private like taxId: only the doctor and admins read it, never ' +
      'the public directory; not printed on documents. Trimmed; an empty ' +
      'string or null clears it.',
    required: false,
    nullable: true,
    maxLength: REGISTRATION_NUMBER_MAX_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) => trimToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(REGISTRATION_NUMBER_MAX_LENGTH)
  registrationNumber?: string | null;

  @ApiProperty({
    description: `A brief description of the clinic and its services. ${CLEARS}`,
    required: false,
    nullable: true,
  })
  @Transform(({ value }: { value: unknown }) => trimToNull(value))
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({
    example: 'https://example.com/logo.png',
    description: `URL of the clinic logo. ${CLEARS}`,
    required: false,
    nullable: true,
  })
  @Transform(({ value }: { value: unknown }) => trimToNull(value))
  @IsOptional()
  @IsString()
  logoUrl?: string | null;

  @ApiProperty({
    example: 'Orthodontics',
    description:
      'Practitioner specialty shown on the public "Trouver un praticien" ' +
      `finder. ${CLEARS}`,
    required: false,
    nullable: true,
  })
  @Transform(({ value }: { value: unknown }) => trimToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  specialty?: string | null;

  @ApiProperty({
    example: false,
    description:
      'Explicit opt-in to appear in the public practitioner directory. ' +
      'Defaults to false — a clinic must consciously choose to be public.',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isListedPublicly?: boolean;
}

export class UpdateDentistProfileDto extends CreateDentistProfileDto {}

const HHMM = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

export class WeeklyHoursEntryDto {
  @ApiProperty({ enum: DayOfWeek, example: 'monday' })
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @ApiProperty({ example: '09:00', description: 'HH:mm 24-hour format' })
  @IsString()
  @Matches(HHMM, { message: 'openTime must be HH:mm (24h)' })
  openTime!: string;

  @ApiProperty({ example: '17:00', description: 'HH:mm 24-hour format' })
  @IsString()
  @Matches(HHMM, { message: 'closeTime must be HH:mm (24h)' })
  closeTime!: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  isClosed!: boolean;
}

/**
 * Combined create-or-update payload for the onboarding flow. Saves the
 * clinic profile AND the seven-day weekly schedule in a single atomic
 * request — eliminates the two-step UI dance where the frontend has to
 * wait for the profile to exist before it can save working hours.
 */
export class SetupClinicDto extends CreateDentistProfileDto {
  @ApiProperty({
    type: [WeeklyHoursEntryDto],
    description:
      'Full weekly schedule (replaces any existing rows). Each entry must ' +
      'cover one weekday — typically 7 entries, max 7.',
  })
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => WeeklyHoursEntryDto)
  workingHours!: WeeklyHoursEntryDto[];
}

export class DentistProfileResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  userId!: string;
  @ApiProperty()
  clinicName!: string;
  @ApiProperty({ required: false })
  clinicAddress?: string;
  @ApiProperty({ required: false })
  city?: string;
  @ApiProperty({ required: false })
  country?: string;
  @ApiProperty({ required: false })
  latitude?: number;
  @ApiProperty({ required: false })
  longitude?: number;
  @ApiProperty({ required: false })
  clinicPhone?: string;
  @ApiProperty({ required: false })
  clinicEmail?: string;
  @ApiProperty({ required: false })
  taxId?: string;
  /** Owner and admins only (redacted like taxId). */
  @ApiProperty({ required: false })
  registrationNumber?: string;
  @ApiProperty({ required: false })
  description?: string;
  @ApiProperty({ required: false })
  logoUrl?: string;
  @ApiProperty({ required: false })
  specialty?: string;
  @ApiProperty({ required: false })
  isListedPublicly?: boolean;
  @ApiProperty({ required: false })
  userFullName?: string;
  @ApiProperty({ required: false })
  userAvatarUrl?: string;
  @ApiProperty()
  createdAt!: Date;
  @ApiProperty()
  updatedAt!: Date;
}

// ─────────────────────────────────────────────────────────────────────────
// PUBLIC "Trouver un praticien" directory
// ─────────────────────────────────────────────────────────────────────────

/**
 * Query params for the public practitioner finder. All optional; `@Type`
 * coercions turn the raw query strings into numbers so class-validator can
 * range-check them. When `lat` & `lng` are both present the service sorts
 * results by haversine distance ascending.
 */
export class PublicFinderQueryDto {
  @ApiProperty({ required: false, example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, example: 24, default: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 24;

  @ApiProperty({ required: false, description: 'Filter by city (contains)' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({
    required: false,
    description: 'Filter by specialty (contains)',
  })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiProperty({
    required: false,
    description: 'Free-text search on clinic name or practitioner name',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    required: false,
    description: 'Latitude — when paired with lng, sorts results by distance',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiProperty({
    required: false,
    description: 'Longitude — when paired with lat, sorts results by distance',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}

/**
 * The page of the two admin directory searches. Validated here: a raw
 * `parseInt` let `?limit=abc` reach the query as NaN.
 */
class DirectorySearchPageQueryDto {
  @ApiProperty({ required: false, example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, example: 10, default: 10, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;
}

/**
 * GET dentist-profile/search/by-city. The city is required: without it the
 * cache key was built from undefined and the route answered 500.
 */
export class SearchByCityQueryDto extends DirectorySearchPageQueryDto {
  @ApiProperty({ example: 'Tunis', description: 'City name', maxLength: 120 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city!: string;
}

/** GET dentist-profile/search/nearby: a point on the globe and a bounded radius. */
export class NearbySearchQueryDto extends DirectorySearchPageQueryDto {
  @ApiProperty({ example: 36.8065, minimum: -90, maximum: 90 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 10.1815, minimum: -180, maximum: 180 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiProperty({
    required: false,
    example: 5,
    default: 5,
    minimum: 1,
    maximum: 500,
    description: 'Search radius in kilometres',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  radiusKm: number = 5;
}

/** One working-hours row exposed on the public single-practitioner view. */
export class PublicWorkingHoursDto {
  @ApiProperty({ enum: DayOfWeek, example: 'monday' })
  dayOfWeek!: DayOfWeek;
  @ApiProperty({ example: '09:00' })
  openTime!: string;
  @ApiProperty({ example: '17:00' })
  closeTime!: string;
  @ApiProperty({ example: false })
  isClosed!: boolean;
}

/**
 * PUBLIC-SAFE practitioner shape. Intentionally omits every private field
 * (taxId, clinicEmail, userId, …) — only fields safe for an unauthenticated
 * directory are present. `distanceKm` is set only when the finder query
 * carried lat/lng. `workingHours` is populated only by the single endpoint.
 */
export class PublicDentistProfileDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  practitionerName!: string;
  @ApiProperty()
  clinicName!: string;
  @ApiProperty({ nullable: true })
  specialty!: string | null;
  @ApiProperty({ nullable: true })
  clinicAddress!: string | null;
  @ApiProperty({ nullable: true })
  city!: string | null;
  @ApiProperty({ nullable: true })
  country!: string | null;
  @ApiProperty({ nullable: true })
  latitude!: number | null;
  @ApiProperty({ nullable: true })
  longitude!: number | null;
  @ApiProperty({ nullable: true })
  clinicPhone!: string | null;
  @ApiProperty({ nullable: true })
  description!: string | null;
  @ApiProperty({ nullable: true })
  logoUrl!: string | null;
  @ApiProperty({ nullable: true })
  avatarUrl!: string | null;
  @ApiProperty({ required: false, description: 'Only when lat/lng supplied' })
  distanceKm?: number;
  @ApiProperty({ required: false, type: [PublicWorkingHoursDto] })
  workingHours?: PublicWorkingHoursDto[];
}

/** Paginated envelope for the public finder list endpoint. */
export class PublicFinderResponseDto {
  @ApiProperty({ type: [PublicDentistProfileDto] })
  data!: PublicDentistProfileDto[];
  @ApiProperty({ example: 100 })
  total!: number;
  @ApiProperty({ example: 1 })
  page!: number;
  @ApiProperty({ example: 24 })
  limit!: number;
}
