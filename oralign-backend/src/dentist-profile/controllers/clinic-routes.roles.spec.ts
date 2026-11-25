import { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WorkingHoursController } from '../../working-hours/controllers/working-hours.controller';
import { DentistProfileController } from './dentist-profile.controller';

/**
 * The real RolesGuard over the controllers' real decorators: every
 * authenticated route of a clinic's profile and weekly schedule names the
 * roles of its callers, and a lab account (technician) reaches none of
 * them. A route added without an entry below fails the spec, so a new
 * role-less read cannot slip in unnoticed.
 */
type Controller = { prototype: object; name: string };
type Gate = readonly UserRole[] | 'public';

const guard = new RolesGuard(new Reflector());

function handler(controller: Controller, method: string) {
  return (controller.prototype as Record<string, () => unknown>)[method];
}

function contextFor(controller: Controller, method: string, role: UserRole) {
  return {
    getHandler: () => handler(controller, method),
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({ user: { sub: `u-${role}`, role } }),
    }),
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

/** Guards Nest runs for a handler, the class-level ones included. */
function guardsOf(controller: Controller, method: string): unknown[] {
  return [
    ...((Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[]) ?? []),
    ...((Reflect.getMetadata(
      GUARDS_METADATA,
      handler(controller, method),
    ) as unknown[]) ?? []),
  ];
}

const DENTIST_OR_ADMIN: readonly UserRole[] = [
  UserRole.dentist,
  UserRole.admin,
];
const ADMIN: readonly UserRole[] = [UserRole.admin];

const EXPECTED: Array<[Controller, Record<string, Gate>]> = [
  [
    DentistProfileController,
    {
      createProfile: DENTIST_OR_ADMIN,
      setupClinic: DENTIST_OR_ADMIN,
      createProfileForUser: ADMIN,
      getAllProfiles: ADMIN,
      // Phone, address and GPS of every clinic, unlisted ones included.
      searchByCity: ADMIN,
      findNearby: ADMIN,
      getProfileById: ADMIN,
      updateProfile: DENTIST_OR_ADMIN,
      deleteProfile: DENTIST_OR_ADMIN,
      // The public finder: opted-in, approved clinics only.
      getPublicList: 'public',
      getPublicById: 'public',
    },
  ],
  [
    WorkingHoursController,
    {
      createWorkingHours: DENTIST_OR_ADMIN,
      getWorkingHoursById: DENTIST_OR_ADMIN,
      getWorkingHoursByDentistProfile: DENTIST_OR_ADMIN,
      updateWorkingHours: DENTIST_OR_ADMIN,
      deleteWorkingHours: DENTIST_OR_ADMIN,
    },
  ],
];

describe.each(EXPECTED.map(([c, table]) => [c.name, c, table] as const))(
  '%s: role gates on the real routes',
  (_name, controller, table) => {
    const gated = Object.entries(table).filter(
      (entry): entry is [string, readonly UserRole[]] => entry[1] !== 'public',
    );
    const open = Object.entries(table)
      .filter(([, gate]) => gate === 'public')
      .map(([method]) => method);

    it('the table lists every route handler', () => {
      expect([...routes(controller)].sort()).toEqual(Object.keys(table).sort());
    });

    it.each(gated)(
      '%s runs RolesGuard (not only the global JWT check)',
      (method) => {
        expect(guardsOf(controller, method)).toContain(RolesGuard);
      },
    );

    it.each(gated)('%s refuses a technician', (method) => {
      expect(
        guard.canActivate(contextFor(controller, method, UserRole.technician)),
      ).toBe(false);
    });

    it.each(gated)(
      '%s admits exactly %p (and super_admin)',
      (method, allowed) => {
        for (const role of Object.values(UserRole)) {
          expect({
            role,
            admitted: guard.canActivate(contextFor(controller, method, role)),
          }).toEqual({
            role,
            admitted: role === UserRole.super_admin || allowed.includes(role),
          });
        }
      },
    );

    if (open.length > 0) {
      it.each(open)('%s is @Public() by design', (method) => {
        expect(
          Reflect.getMetadata(IS_PUBLIC_KEY, handler(controller, method)),
        ).toBe(true);
      });
    }
  },
);
