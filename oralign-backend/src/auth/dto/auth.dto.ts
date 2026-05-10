import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

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

export class SignUpDto {
  @ApiProperty({
    example: 'test.user@example.com',
    description: 'User email address',
  })
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'Test User',
    description: 'User full name',
  })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({
    example: 'Str0ngP@ssw0rd!',
    description: 'User password (at least 8 characters)',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;

  @ApiProperty({
    example: '+1234567890',
    description: 'User phone number in E.164 format (optional)',
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
    description: 'User country ISO code (optional)',
    required: false,
  })
  @Transform(({ value }) => normalizeCountryCode(value))
  @IsOptional()
  @IsString()
  @Matches(ISO_COUNTRY_REGEX, {
    message: 'Country must be ISO 3166-1 alpha-2 (e.g. TN)',
  })
  country?: string;
}

export class SignInDto {
  @ApiProperty({
    example: 'test.user@example.com',
    description: 'User email address',
  })
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'Str0ngP@ssw0rd!',
    description: 'User password',
  })
  @IsString()
  password!: string;
}

export class VerifyEmailDto {
  @ApiProperty({
    example: 'test.user@example.com',
    description: 'User email address',
  })
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: '123456',
    description: 'Verification code sent to the user email',
  })
  @IsString()
  verificationCode!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'test.user@example.com',
    description: 'User email address to send reset link',
  })
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    description: 'The password reset token received via email',
  })
  @IsString()
  token!: string;

  @ApiProperty({
    example: 'NewStr0ngP@ssw0rd!',
    description:
      'The new password for the user account (at least 8 characters)',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword!: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    description: 'The refresh token used to obtain a new access token',
  })
  @IsString()
  refreshToken!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current account password' })
  @IsString()
  @MinLength(1, { message: 'Current password is required' })
  currentPassword!: string;

  @ApiProperty({ description: 'New password (at least 8 characters)' })
  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters' })
  newPassword!: string;
}

export class ResendVerificationDto {
  @ApiProperty({
    example: 'test.user@example.com',
    description: 'Email address to resend verification code to',
  })
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  @IsEmail()
  email!: string;
}
