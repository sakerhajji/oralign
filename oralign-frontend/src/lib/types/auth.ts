// Auth DTOs
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

import { UserRole, VerificationStatus } from './enums';

// ==========================================
// AUTH DTOs
// ==========================================

export interface SignUpDto {
  email: string;
  fullName: string;
  password: string;
  phone?: string;
  country?: string;
}

export interface SignInDto {
  email: string;
  password: string;
}

export interface VerifyEmailDto {
  email: string;
  verificationCode: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

export interface AuthTokenDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponseDto {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isEmailVerified: boolean;
  verificationStatus: VerificationStatus;
  avatarUrl?: string;
  /** 'fr' | 'en' — seeds the i18n store right after sign-in. */
  preferredLanguage?: string;
  authToken: AuthTokenDto;
}

export interface VerifyEmailResponseDto {
  message: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    isEmailVerified: boolean;
    verificationStatus: VerificationStatus;
  };
  authToken?: AuthTokenDto;
}
