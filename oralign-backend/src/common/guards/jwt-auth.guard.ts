import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * The principal this guard put on the request. A symbol, defined
 * non-enumerable: no header, body, query or other middleware can produce
 * it, and nothing serializes it.
 */
const AUTHENTICATED_USER = Symbol('JwtAuthGuard.authenticatedUser');

type GuardedRequest = {
  user?: unknown;
  [AUTHENTICATED_USER]?: unknown;
};

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  /**
   * The guard is global (app.module.ts) AND repeated by most controllers'
   * @UseGuards(JwtAuthGuard, RolesGuard), so Nest runs it twice per
   * request; JwtStrategy.validate() reads the user row each time. The
   * second pass on the SAME request returns at once when the user it
   * finds is exactly the one the first pass authenticated. A `req.user`
   * set by anything else, or replaced since, is validated again.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // HTTP only: on another transport the "request" (a socket) can outlive
    // a single message, and a mark on it would skip the revocation checks.
    const request =
      context.getType() === 'http'
        ? (this.getRequest(context) as GuardedRequest)
        : null;
    if (
      request?.user !== undefined &&
      request[AUTHENTICATED_USER] === request.user
    ) {
      return true;
    }

    const allowed = await (super.canActivate(context) as Promise<boolean>);
    if (allowed && request) {
      Object.defineProperty(request, AUTHENTICATED_USER, {
        value: request.user,
        enumerable: false,
        configurable: true,
        writable: false,
      });
    }
    return allowed;
  }

  handleRequest<TUser = any>(
    err: any,
    user: any,
    _info: any,
    _context: ExecutionContext,
    _status?: any,
  ): TUser {
    if (err || !user) {
      throw (
        (err as Error) || new UnauthorizedException('Invalid or expired token')
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return user;
  }
}
