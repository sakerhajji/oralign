import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '../../common/exceptions/app.exception';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

export const ALLOW_PENDING_PASSWORD_CHANGE_KEY = 'allowPendingPasswordChange';

/**
 * Opens a route to an account that still runs on a temporary password.
 * Only what the "choose your password" step needs carries it: GET
 * /users/me and POST /auth/change-password.
 */
export const AllowPendingPasswordChange = () =>
  SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, true);

/**
 * Global guard, registered right after JwtAuthGuard (app.module.ts): while
 * the caller's account has `mustChangePassword`, every authenticated route
 * answers 403 PASSWORD_CHANGE_REQUIRED except the @AllowPendingPasswordChange
 * ones. Public routes (sign-in, refresh-token…) are never touched.
 *
 * Costs no query: JwtStrategy.validate() already reloads the user row on
 * every request and copies the flag onto `request.user`.
 */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    const user = context
      .switchToHttp()
      .getRequest<{ user?: Partial<JwtPayload> }>().user;
    if (user?.mustChangePassword !== true) return true;
    if (
      this.reflector.getAllAndOverride<boolean>(
        ALLOW_PENDING_PASSWORD_CHANGE_KEY,
        targets,
      )
    ) {
      return true;
    }
    throw new ForbiddenException(
      'Choose a new password before using the application.',
      PASSWORD_CHANGE_REQUIRED,
    );
  }
}
