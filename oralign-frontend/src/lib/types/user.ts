// User DTOs
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

import { UserRole } from './enums';

// ==========================================
// USER DTOs
// ==========================================

export interface CreateUserDto {
  email: string;
  fullName: string;
  password: string;
  phone?: string;
  country?: string;
  role?: UserRole;
  avatarUrl?: string;
}

export interface UpdateUserDto {
  fullName?: string;
  phone?: string;
  country?: string;
  avatarUrl?: string;
  /** 'fr' | 'en' — synced by the language switcher, read by the
   *  backend when rendering notifications + emails for this user. */
  preferredLanguage?: string;
  password?: string;
  role?: UserRole;
  isEmailVerified?: boolean;
}
