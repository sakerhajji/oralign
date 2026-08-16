import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

function ctxWithUser(user: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardRequiring(roles: UserRole[] | undefined) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(roles),
  } as unknown as Reflector;
  return { guard: new RolesGuard(reflector), reflector };
}

describe('RolesGuard', () => {
  it('lets every request through when the route declares no @Roles()', () => {
    const { guard } = guardRequiring(undefined);
    expect(guard.canActivate(ctxWithUser({ role: UserRole.dentist }))).toBe(true);
    expect(guard.canActivate(ctxWithUser(undefined))).toBe(true);
  });

  it('reads the ROLES_KEY metadata (handler first, then class)', () => {
    const { guard, reflector } = guardRequiring([UserRole.admin]);
    guard.canActivate(ctxWithUser({ role: UserRole.admin }));
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      ROLES_KEY,
      expect.any(Array),
    );
  });

  it('refuses when there is no authenticated user', () => {
    const { guard } = guardRequiring([UserRole.admin]);
    expect(guard.canActivate(ctxWithUser(undefined))).toBe(false);
  });

  it('allows a user whose role is in the required list', () => {
    const { guard } = guardRequiring([UserRole.admin, UserRole.designer]);
    expect(guard.canActivate(ctxWithUser({ role: UserRole.designer }))).toBe(true);
  });

  it('refuses a user whose role is not in the list', () => {
    const { guard } = guardRequiring([UserRole.admin]);
    expect(guard.canActivate(ctxWithUser({ role: UserRole.dentist }))).toBe(false);
  });

  it('super_admin bypasses every role restriction', () => {
    const { guard } = guardRequiring([UserRole.dentist]);
    expect(guard.canActivate(ctxWithUser({ role: UserRole.super_admin }))).toBe(true);
  });
});
