import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

/**
 * The verified access-token payload attached to `request.user`.
 * `role` is already narrowed to `UserRole` by JwtStrategy.validate() —
 * a token carrying an unknown role never reaches a handler.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  /** tokenVersion at issue time (session revocation). */
  tv?: number;
  /**
   * NOT a token claim: set by JwtStrategy.validate() from the user row it
   * reloads on every request, so the password-change gate (auth
   * PasswordChangeGuard) needs no extra query. True while the account runs
   * on a temporary password.
   */
  mustChangePassword?: boolean;
  iat: number;
  exp: number;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user;
  },
);
