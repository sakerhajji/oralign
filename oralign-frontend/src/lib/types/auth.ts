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
  /** Temporary password in use: send the user to /onboarding/password first. */
  mustChangePassword?: boolean;
  authToken: AuthTokenDto;
}

/**
 * `POST /auth/change-password` answer: the change revokes every session
 * (tokenVersion bump) and hands the caller a fresh pair, so the tab that
 * changed the password stays signed in.
 */
export interface ChangePasswordResponseDto {
  message: string;
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
