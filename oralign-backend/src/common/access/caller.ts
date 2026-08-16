import { UserRole } from '@prisma/client';

/**
 * The authenticated principal as seen by every service method.
 *
 * Built by controllers from the JWT payload (`{ userId: user.sub, role:
 * user.role }`). One shared definition replaces the eight per-service
 * `type Caller = …` copies that had drifted between `role: string` and
 * `role: UserRole`. `role` is a plain string on purpose: it comes straight
 * from the JWT payload (untyped at the boundary) and every rule compares it
 * against the UserRole enum's string values.
 */
export type Caller = { userId: string; role: string };

/** Roles with platform-wide read/write. Single source of truth. */
export const ADMIN_ROLES: readonly string[] = [
  UserRole.admin,
  UserRole.super_admin,
];

export function isAdmin(caller: Pick<Caller, 'role'>): boolean {
  return ADMIN_ROLES.includes(caller.role);
}
