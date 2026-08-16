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
  iat: number;
  exp: number;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user;
  },
);
