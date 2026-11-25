import { ApiProperty } from '@nestjs/swagger';
import { UserRole, VerificationStatus } from '@prisma/client';

export class AuthTokenDto {
  @ApiProperty({
    description: 'JWT access token for authorized requests',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'JWT refresh token to obtain a new access token',
  })
  refreshToken!: string;

  @ApiProperty({
    example: 900,
    description: 'Access token validity period in seconds',
  })
  expiresIn!: number;
}

export class AuthResponseDto {
  @ApiProperty({
    example: 'clbxx1a2b3c4d5e6f7g8h9i0',
    description: 'User ID',
  })
  id!: string;

  @ApiProperty({
    example: 'test.user@example.com',
    description: 'User email address',
  })
  email!: string;

  @ApiProperty({
    example: 'Test User',
    description: 'User full name',
  })
  fullName!: string;

  @ApiProperty({
    example: 'dentist',
    description: 'User role',
  })
  role!: string;

  @ApiProperty({
    example: false,
    description: 'Indicates if the user email has been verified',
  })
  isEmailVerified!: boolean;

  @ApiProperty({
    enum: VerificationStatus,
    example: VerificationStatus.pending,
    description:
      'Admin approval state for the account. The app must gate access ' +
      'until this reaches "approved".',
  })
  verificationStatus!: VerificationStatus;

  @ApiProperty({
    example: '/uploads/avatars/abc123.jpg',
    description: 'URL of the user avatar image',
    required: false,
  })
  avatarUrl?: string;

  @ApiProperty({
    example: 'fr',
    enum: ['fr', 'en'],
    description:
      'Preferred content language — the frontend seeds its i18n store ' +
      'from this right after sign-in.',
    required: false,
  })
  preferredLanguage?: string;

  @ApiProperty({
    example: false,
    description:
      'The account runs on a temporary password: send the user to the "choose your password" step first. Until then every route but GET /users/me and POST /auth/change-password answers 403 PASSWORD_CHANGE_REQUIRED.',
  })
  mustChangePassword!: boolean;

  @ApiProperty({
    description: 'Object containing access and refresh tokens',
  })
  authToken!: AuthTokenDto;
}

/**
 * `POST /auth/change-password`. The change revokes every session of the
 * account (tokenVersion + 1), this one included, so the caller gets a
 * fresh pair for the new version and stays signed in.
 */
export class ChangePasswordResponseDto {
  @ApiProperty({ example: 'Password changed successfully' })
  message!: string;

  @ApiProperty({ type: AuthTokenDto })
  authToken!: AuthTokenDto;
}

export class VerifyEmailUserDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  email!: string;
  @ApiProperty()
  fullName!: string;
  @ApiProperty({ enum: UserRole })
  role!: UserRole;
  @ApiProperty()
  isEmailVerified!: boolean;
  @ApiProperty({ enum: VerificationStatus })
  verificationStatus!: VerificationStatus;
}

export class VerifyEmailResponseDto {
  @ApiProperty()
  message!: string;

  @ApiProperty({ type: VerifyEmailUserDto, required: false })
  user?: VerifyEmailUserDto;

  @ApiProperty({ type: AuthTokenDto, required: false })
  authToken?: AuthTokenDto;
}
