import { UserRole } from '@prisma/client';
import {
  ADMIN_ROLES,
  PRODUCTION_ROLES,
  isAdmin,
  isTechnician,
  isUserRole,
} from './caller';

describe('caller helpers', () => {
  describe('isAdmin', () => {
    it.each([UserRole.admin, UserRole.super_admin])(
      'is true for %s',
      (role) => {
        expect(isAdmin({ role })).toBe(true);
      },
    );

    it.each([UserRole.dentist, UserRole.designer, UserRole.technician])(
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

  describe('isTechnician', () => {
    it('is true for the technician only', () => {
      for (const role of Object.values(UserRole)) {
        expect(isTechnician({ role })).toBe(role === UserRole.technician);
      }
    });
  });

  describe('PRODUCTION_ROLES', () => {
    it('is exactly technician + the admin roles', () => {
      expect([...PRODUCTION_ROLES].sort()).toEqual(
        [UserRole.technician, UserRole.admin, UserRole.super_admin].sort(),
      );
    });

    it('never lets dentists or designers in', () => {
      expect(PRODUCTION_ROLES).not.toContain(UserRole.dentist);
      expect(PRODUCTION_ROLES).not.toContain(UserRole.designer);
    });

    it('adding the technician did not widen ADMIN_ROLES', () => {
      expect(ADMIN_ROLES).not.toContain(UserRole.technician);
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
