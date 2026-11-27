// User DTOs
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

import { UserRole } from './enums';
import type { User } from './entities';

// ==========================================
// USER DTOs
// ==========================================

export interface CreateUserDto {
  email: string;
  fullName: string;
  /** Required unless `generateTemporaryPassword` is true. */
  password?: string;
  phone?: string;
  country?: string;
  role?: UserRole;
  avatarUrl?: string;
  /**
   * The server generates the password and returns it ONCE in
   * `CreateUserResponse.temporaryPassword` (never logged, never e-mailed).
   */
  generateTemporaryPassword?: boolean;
}

/** `POST /users` answer: the account, plus the generated password once. */
export interface CreateUserResponse extends User {
  temporaryPassword?: string;
}

/** `POST /users/:id/temporary-password` answer (technician accounts only). */
export interface TemporaryPasswordResponse {
  temporaryPassword: string;
}

/**
 * `GET /users/stats` — counts over every non-deleted user (the gift
 * counts over dentists only). Independent of the list's page/filters.
 */
export interface UserStats {
  total: number;
  active: number;
  blocked: number;
  pending: number;
  dentists: number;
  admins: number;
  technicians: number;
  giftAvailable: number;
  giftUsed: number;
  /** Dormant dentists (doctor inactivity, spec §5), not the blocked ones. */
  dormant: number;
}

export interface UpdateUserDto {
  fullName?: string;
  /** E.164; null clears the stored number, undefined leaves it untouched. */
  phone?: string | null;
  /** ISO 3166-1 alpha-2; null clears it, undefined leaves it untouched. */
  country?: string | null;
  avatarUrl?: string;
  /** 'fr' | 'en' — synced by the language switcher, read by the
   *  backend when rendering notifications + emails for this user. */
  preferredLanguage?: string;
  password?: string;
  role?: UserRole;
  isEmailVerified?: boolean;
}
