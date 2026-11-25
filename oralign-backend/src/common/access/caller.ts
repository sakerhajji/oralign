import { UserRole } from '@prisma/client';

/**
 * The authenticated principal as seen by every service method.
 *
 * Built by controllers from the JWT payload (`{ userId: user.sub, role:
 * user.role }`). One shared definition replaces the thirteen per-service
 * `type Caller = …` copies that had drifted between `role: string` and
 * `role: UserRole`. `role` IS a `UserRole`: the token is narrowed exactly
 * once, where it is verified (JwtStrategy for HTTP, SocketAuth for WS), so
 * no service ever needs to re-check or cast it.
 */
export type Caller = { userId: string; role: UserRole };

const USER_ROLES: readonly string[] = Object.values(UserRole);

/** Type guard used at the auth boundary to narrow a raw token claim. */
export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value);
}

/**
 * Roles with platform-wide read/write. Single source of truth — used by
 * controllers as `@Roles(...ADMIN_ROLES)` and by services via `isAdmin()`.
 * (Was copied into 18 files, three of them typed `string[]`, the rest
 * `UserRole[]`.)
 */
export const ADMIN_ROLES: readonly UserRole[] = [
  UserRole.admin,
  UserRole.super_admin,
];

/** `true` for admin / super_admin. The ONE admin check for services. */
export function isAdmin(caller: Pick<Caller, 'role'>): boolean {
  return ADMIN_ROLES.includes(caller.role);
}

/**
 * `true` for the lab technician only. Never folded into isAdmin: she
 * reaches the production routes and nothing that carries money.
 */
export function isTechnician(caller: Pick<Caller, 'role'>): boolean {
  return caller.role === UserRole.technician;
}

/**
 * Who may use the lab production screens: the technician plus the admins
 * (`@Roles(...PRODUCTION_ROLES)`). A separate list on purpose, so adding
 * the technician here never widens ADMIN_ROLES.
 */
export const PRODUCTION_ROLES: readonly UserRole[] = [
  UserRole.technician,
  ...ADMIN_ROLES,
];
