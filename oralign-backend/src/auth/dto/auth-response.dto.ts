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
    description: 'Object containing access and refresh tokens',
  })
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
