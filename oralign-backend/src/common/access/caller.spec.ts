import { UserRole } from '@prisma/client';
import { ADMIN_ROLES, isAdmin, isUserRole } from './caller';

describe('caller helpers', () => {
  describe('isAdmin', () => {
    it.each([UserRole.admin, UserRole.super_admin])(
      'is true for %s',
      (role) => {
        expect(isAdmin({ role })).toBe(true);
      },
    );

    it.each([UserRole.dentist, UserRole.designer])(
      'is false for %s',
      (role) => {
        expect(isAdmin({ role })).toBe(false);
      },
    );

    it('ADMIN_ROLES is exactly admin + super_admin (the @Roles() decorator input)', () => {
      expect([...ADMIN_ROLES].sort()).toEqual(
        [UserRole.admin, UserRole.super_admin].sort(),
      );
    });
  });

  describe('isUserRole (auth-boundary narrowing)', () => {
    it('accepts every UserRole value', () => {
      for (const role of Object.values(UserRole)) {
        expect(isUserRole(role)).toBe(true);
      }
    });

    it.each([
      ['unknown string', 'root'],
      ['empty string', ''],
      ['wrong case', 'ADMIN'],
      ['number', 1],
      ['null', null],
      ['undefined', undefined],
      ['object', { role: 'admin' }],
    ])('rejects %s', (_label, value) => {
      expect(isUserRole(value)).toBe(false);
    });
  });
});
