import { ExecutionContext } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { UserController } from '../../users/controllers/user.controller';
import { AuthController } from '../controllers/auth.controller';
import {
  PASSWORD_CHANGE_REQUIRED,
  PasswordChangeGuard,
} from './password-change.guard';

/**
 * The guard against the REAL route metadata (a real Reflector over the
 * controllers' decorators): an account on a temporary password reaches
 * exactly what the "choose your password" step needs, and nothing else.
 */
type Controller = { prototype: object; name: string };

const guard = new PasswordChangeGuard(new Reflector());
const pending = {
  sub: 'u-tech',
  role: UserRole.technician,
  mustChangePassword: true,
};

function handler(controller: Controller, method: string) {
  return (controller.prototype as Record<string, () => unknown>)[method];
}

function contextFor(controller: Controller, method: string, user: unknown) {
  return {
    getHandler: () => handler(controller, method),
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

/** Every route handler of a controller. */
function routes(controller: Controller): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter(
    (name) =>
      name !== 'constructor' &&
      Reflect.getMetadata(METHOD_METADATA, handler(controller, name)) !==
        undefined,
  );
}

const ALLOWED: Array<[Controller, string]> = [
  [UserController, 'getCurrentUser'],
  [AuthController, 'changePassword'],
];

describe('PasswordChangeGuard — the allowlist on the real routes', () => {
  it.each(ALLOWED.map(([c, m]) => [c.name, m, c] as const))(
    'opens %s.%s while the change is pending',
    (_name, method, controller) => {
      expect(guard.canActivate(contextFor(controller, method, pending))).toBe(
        true,
      );
    },
  );

  const refused = [UserController, AuthController].flatMap((controller) =>
    routes(controller)
      .filter(
        (method) =>
          !ALLOWED.some(([c, m]) => c === controller && m === method) &&
          Reflect.getMetadata(IS_PUBLIC_KEY, handler(controller, method)) !==
            true,
      )
      .map((method) => [controller.name, method, controller] as const),
  );

  it('there are authenticated routes left to refuse (the list is not empty)', () => {
    expect(refused.length).toBeGreaterThan(10);
  });

  it.each(refused)(
    'refuses %s.%s with 403 PASSWORD_CHANGE_REQUIRED',
    (_name, method, controller) => {
      let thrown: unknown;
      try {
        guard.canActivate(contextFor(controller, method, pending));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({
        statusCode: 403,
        errorCode: PASSWORD_CHANGE_REQUIRED,
      });
    },
  );

  it('the public auth routes (sign-in, refresh, forgot / reset) stay reachable', () => {
    for (const method of [
      'signIn',
      'refreshToken',
      'forgotPassword',
      'resetPassword',
    ]) {
      expect(
        guard.canActivate(contextFor(AuthController, method, undefined)),
      ).toBe(true);
    }
  });

  it('an account without a pending change reaches every route', () => {
    for (const method of routes(UserController)) {
      expect(
        guard.canActivate(
          contextFor(UserController, method, {
            ...pending,
            mustChangePassword: false,
          }),
        ),
      ).toBe(true);
    }
  });
});
