import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import {
  ALLOW_PENDING_PASSWORD_CHANGE_KEY,
  PASSWORD_CHANGE_REQUIRED,
  PasswordChangeGuard,
} from './password-change.guard';

function ctxWithUser(user: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

/** A guard whose route carries the given metadata flags. */
function guardFor(meta: { public?: boolean; allow?: boolean } = {}) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === IS_PUBLIC_KEY) return meta.public;
      if (key === ALLOW_PENDING_PASSWORD_CHANGE_KEY) return meta.allow;
      return undefined;
    }),
  } as unknown as Reflector;
  return new PasswordChangeGuard(reflector);
}

describe('PasswordChangeGuard', () => {
  it('lets an account without a pending change through', () => {
    expect(guardFor().canActivate(ctxWithUser({ sub: 'u1' }))).toBe(true);
    expect(
      guardFor().canActivate(
        ctxWithUser({ sub: 'u1', mustChangePassword: false }),
      ),
    ).toBe(true);
  });

  it('refuses every other route with 403 PASSWORD_CHANGE_REQUIRED while the change is pending', () => {
    let thrown: unknown;
    try {
      guardFor().canActivate(
        ctxWithUser({ sub: 'u1', mustChangePassword: true }),
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      statusCode: 403,
      errorCode: PASSWORD_CHANGE_REQUIRED,
    });
  });

  it('opens the @AllowPendingPasswordChange routes (me, change-password)', () => {
    expect(
      guardFor({ allow: true }).canActivate(
        ctxWithUser({ sub: 'u1', mustChangePassword: true }),
      ),
    ).toBe(true);
  });

  it('never touches public routes', () => {
    expect(guardFor({ public: true }).canActivate(ctxWithUser(undefined))).toBe(
      true,
    );
  });

  it('leaves an unauthenticated request to JwtAuthGuard', () => {
    expect(guardFor().canActivate(ctxWithUser(undefined))).toBe(true);
  });
});
