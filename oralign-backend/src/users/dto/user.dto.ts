import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  IsArray,
  IsBoolean,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { UserRole } from '@prisma/client';

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
    example: 'https://example.com/new-avatar.png',
    description: 'URL for user avatar image',
    required: false,
  })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

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
}

export class UserFilterDto {
  @ApiProperty({ required: false, description: 'Search by name or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    enum: UserRole,
    required: false,
    description: 'Filter by role',
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiProperty({ required: false, description: 'Filter by active status' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    required: false,
    description: 'Filter by email verified status',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isEmailVerified?: boolean;
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
