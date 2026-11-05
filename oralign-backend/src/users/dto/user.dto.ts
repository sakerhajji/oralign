import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsOptional,
  IsEnum,
  IsIn,
  IsInt,
  MinLength,
  MaxLength,
  Min,
  Max,
  IsArray,
  IsBoolean,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { UserRole, VerificationStatus } from '@prisma/client';

const E164_PHONE_REGEX = /^\+[1-9]\d{1,14}$/;
const ISO_COUNTRY_REGEX = /^[A-Z]{2}$/;

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const normalizeCountryCode = (value: unknown) => {
  const normalized = normalizeOptionalString(value);
  if (typeof normalized !== 'string') return normalized;
  return normalized.toUpperCase();
};

/**
 * Update semantics for an optional, clearable text field: absent →
 * undefined ("unchanged"), blank → null ("clear"), else trimmed. Null
 * skips the validators (@IsOptional), so a clear never trips @Matches.
 */
const normalizeClearableString = (value: unknown) => {
  if (value === null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const normalizeClearableCountryCode = (value: unknown) => {
  const normalized = normalizeClearableString(value);
  if (typeof normalized !== 'string') return normalized;
  return normalized.toUpperCase();
};

/**
 * Query-string boolean, read from the RAW value: enableImplicitConversion
 * runs Boolean() first, which turns the string "false" into true. Absent or
 * blank → undefined (no filter); anything but true/false → 400.
 */
const toOptionalBoolean = ({ obj, key }: { obj: unknown; key: string }) => {
  const raw = (obj as Record<string, unknown>)[key];
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (raw === true || raw === 'true') return true;
  if (raw === false || raw === 'false') return false;
  return raw;
};

/** Query-string enum / text: a blank value means "no filter". */
const blankToUndefined = ({ obj, key }: { obj: unknown; key: string }) => {
  const raw = (obj as Record<string, unknown>)[key];
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
};

/** Values of the `welcomeGift` list filter (dentists only). */
export const WELCOME_GIFT_FILTERS = ['used', 'available'] as const;
export type WelcomeGiftFilter = (typeof WELCOME_GIFT_FILTERS)[number];

/**
 * Upper bound of `limit` on the users lists. The admin dentist pickers
 * (orders / patients filters) still request 200 rows in one page.
 */
export const USERS_LIST_MAX_LIMIT = 200;

const normalizeEmail = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  return value.toLowerCase().trim();
};

export class CreateUserDto {
  @ApiProperty({
    example: 'new.user@example.com',
    description: 'User email address',
  })
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'New User',
    description: 'User full name',
  })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({
    example: 'P@ssword123',
    description: 'User password (at least 8 characters)',
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    example: '+1987654321',
    description: 'User phone number in E.164 format',
    required: false,
  })
  @Transform(({ value }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  @Matches(E164_PHONE_REGEX, {
    message: 'Phone must be in E.164 format (e.g. +21612345678)',
  })
  phone?: string;

  @ApiProperty({
    enum: UserRole,
    example: UserRole.dentist,
    description: 'User role',
    required: false,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiProperty({
    example: 'TN',
    description: 'User country ISO code',
    required: false,
  })
  @Transform(({ value }) => normalizeCountryCode(value))
  @IsOptional()
  @IsString()
  @Matches(ISO_COUNTRY_REGEX, {
    message: 'Country must be ISO 3166-1 alpha-2 (e.g. TN)',
  })
  country?: string;

  @ApiProperty({
    example: 'https://example.com/avatar.png',
    description: 'URL for user avatar image',
    required: false,
  })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class UpdateUserDto {
  @ApiProperty({
    example: 'Updated Name',
    description: 'User full name',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @ApiProperty({
    example: '+1122334455',
    description:
      'User phone number in E.164 format. "" or null clears it; omit to keep it.',
    required: false,
    type: String,
    nullable: true,
  })
  @Transform(({ value }) => normalizeClearableString(value))
  @IsOptional()
  @IsString()
  @Matches(E164_PHONE_REGEX, {
    message: 'Phone must be in E.164 format (e.g. +21612345678)',
  })
  phone?: string | null;

  @ApiProperty({
    example: 'TN',
    description:
      'User country ISO code. "" or null clears it; omit to keep it.',
    required: false,
    type: String,
    nullable: true,
  })
  @Transform(({ value }) => normalizeClearableCountryCode(value))
  @IsOptional()
  @IsString()
  @Matches(ISO_COUNTRY_REGEX, {
    message: 'Country must be ISO 3166-1 alpha-2 (e.g. TN)',
  })
  country?: string | null;

  @ApiProperty({
    example: 'https://example.com/new-avatar.png',
    description: 'URL for user avatar image',
    required: false,
  })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiProperty({
    example: 'fr',
    description:
      'Preferred content language — drives the dashboard UI, notifications and emails for this user.',
    enum: ['fr', 'en'],
    required: false,
  })
  @IsOptional()
  @IsIn(['fr', 'en'], { message: 'preferredLanguage must be "fr" or "en"' })
  preferredLanguage?: string;

  @ApiProperty({
    example: 'NewP@ssword123',
    description: 'New user password (at least 8 characters)',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty({
    example: UserRole.admin,
    description: 'User role (admin only)',
    required: false,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiProperty({
    example: true,
    description: 'Email verification status (admin only)',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isEmailVerified?: boolean;
}

export class UserResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  email!: string;
  @ApiProperty()
  fullName!: string;
  @ApiProperty({ required: false })
  phone?: string;
  @ApiProperty({ enum: UserRole })
  role!: string;
  @ApiProperty()
  isActive!: boolean;
  @ApiProperty()
  isEmailVerified!: boolean;
  @ApiProperty({ required: false })
  avatarUrl?: string;
  @ApiProperty({ required: false })
  country?: string;
  @ApiProperty({ required: false, enum: ['fr', 'en'] })
  preferredLanguage?: string;
  @ApiProperty({ required: false })
  lastLoginAt?: Date;
  @ApiProperty()
  createdAt!: Date;
  @ApiProperty()
  updatedAt!: Date;
  @ApiProperty({ required: false })
  verificationStatus?: string;
  @ApiProperty({ required: false, type: Object, nullable: true })
  dentistProfile?: {
    id: string;
    clinicName: string;
    clinicAddress?: string | null;
    city?: string | null;
    country?: string | null;
    clinicPhone?: string | null;
    clinicEmail?: string | null;
    description?: string | null;
    logoUrl?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Welcome gift doctor mark: when the gift was used, null while it is available (always null for non-dentists in practice).',
  })
  welcomeGiftUsedAt!: Date | null;

  @ApiProperty({
    type: Object,
    nullable: true,
    description:
      "The doctor's most recent order carrying the welcome gift ({ id, orderCode, archived }); null when none, and always null for non-dentists. `archived` is true when that order was archived (soft-deleted): the gift still counts as used on it, but the order page is no longer reachable, so do not link to it.",
  })
  welcomeGiftOrder!: {
    id: string;
    orderCode: string;
    archived: boolean;
  } | null;
}

/** Filters shared by the active (`GET /users`) and deleted users lists. */
export class UserFilterDto {
  @ApiProperty({
    required: false,
    description:
      'Matches full name, email, clinic name (case-insensitive) and phone (spaces, dashes, dots and parentheses ignored).',
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiProperty({
    enum: UserRole,
    required: false,
    description: 'Filter by role',
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiProperty({
    required: false,
    type: Boolean,
    description: 'Filter by active status (true = active, false = blocked)',
  })
  @Transform(toOptionalBoolean)
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    required: false,
    type: Boolean,
    description: 'Filter by email verified status',
  })
  @Transform(toOptionalBoolean)
  @IsOptional()
  @IsBoolean()
  isEmailVerified?: boolean;

  @ApiProperty({
    enum: VerificationStatus,
    required: false,
    description: 'Filter by account approval status',
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @ApiProperty({
    enum: [...WELCOME_GIFT_FILTERS],
    required: false,
    description:
      'Welcome gift mark (dentists only): used = marked, available = not marked. Non-dentists never match.',
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsIn(WELCOME_GIFT_FILTERS)
  welcomeGift?: WelcomeGiftFilter;
}

/**
 * Query of `GET /users` and `GET /users/deleted/list`: pagination + the
 * shared filters. Bound with `@Query()` so the global ValidationPipe
 * rejects a bad page / limit / enum with a 400 instead of sending NaN or
 * a negative skip to Prisma.
 */
export class UserListQueryDto extends UserFilterDto {
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
    maximum: USERS_LIST_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(USERS_LIST_MAX_LIMIT)
  limit: number = 10;
}

/**
 * `GET /users/stats` — counts over non-deleted accounts. `blocked` is
 * `total - active`; the gift counts cover dentists only
 * (`giftAvailable + giftUsed = dentists`).
 */
export class UsersStatsDto {
  @ApiProperty({ description: 'Non-deleted accounts' })
  total!: number;
  @ApiProperty({ description: 'Active accounts' })
  active!: number;
  @ApiProperty({ description: 'Blocked (inactive) accounts' })
  blocked!: number;
  @ApiProperty({
    description:
      'Accounts awaiting approval (verificationStatus = pending), every role — the same set as the verificationStatus=pending filter.',
  })
  pending!: number;
  @ApiProperty({ description: 'Dentist accounts' })
  dentists!: number;
  @ApiProperty({ description: 'Admin and super admin accounts' })
  admins!: number;
  @ApiProperty({
    description: 'Dentists whose welcome gift is still available',
  })
  giftAvailable!: number;
  @ApiProperty({ description: 'Dentists whose welcome gift is used' })
  giftUsed!: number;
}

export class BulkActionDto {
  @ApiProperty({ description: 'Array of user IDs', type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class BulkUpdateStatusDto extends BulkActionDto {
  @ApiProperty({ description: 'New active status' })
  @IsBoolean()
  isActive!: boolean;
}

export class UpdateRoleDto {
  @ApiProperty({
    enum: UserRole,
    description: 'New user role',
  })
  @IsEnum(UserRole)
  role!: UserRole;
}

export class UpdateEmailVerificationDto {
  @ApiProperty({
    description: 'Email verification status',
  })
  @IsBoolean()
  isEmailVerified!: boolean;
}

export class UpdateApprovalDto {
  @ApiProperty({
    enum: VerificationStatus,
    description:
      'Admin decision on the account: approved unlocks the dashboard, ' +
      'rejected blocks it, pending keeps it in the holding area.',
  })
  @IsEnum(VerificationStatus)
  verificationStatus!: VerificationStatus;
}
