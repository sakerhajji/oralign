import {
  type ExecutionContext,
  type ArgumentMetadata,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WelcomeGiftMarkDto } from '../dto/welcome-gift.dto';
import type { WelcomeGiftService } from '../services/welcome-gift.service';
import { WelcomeGiftController } from './welcome-gift.controller';

/** The global pipe exactly as main.ts configures it. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const body: ArgumentMetadata = { type: 'body', metatype: WelcomeGiftMarkDto };

/** RolesGuard on one controller method, for a caller of `role`. */
function canActivate(
  handler: keyof WelcomeGiftController,
  role: UserRole,
): boolean {
  const guard = new RolesGuard(new Reflector());
  const context = {
    getHandler: () => WelcomeGiftController.prototype[handler],
    getClass: () => WelcomeGiftController,
    switchToHttp: () => ({
      getRequest: () => ({ user: { sub: 'u-1', role } }),
    }),
  } as unknown as ExecutionContext;
  return guard.canActivate(context);
}

describe('WelcomeGiftController — roles', () => {
  it('the banner stays dentist-only', () => {
    expect(canActivate('getStatus', UserRole.dentist)).toBe(true);
    expect(canActivate('getStatus', UserRole.admin)).toBe(false);
  });

  it('the mark control is admin / super admin only (method @Roles overrides the dentist class default)', () => {
    expect(canActivate('setDoctorMark', UserRole.admin)).toBe(true);
    expect(canActivate('setDoctorMark', UserRole.super_admin)).toBe(true);
    // A dentist must never reset their own gift: 403.
    expect(canActivate('setDoctorMark', UserRole.dentist)).toBe(false);
    expect(canActivate('setDoctorMark', UserRole.designer)).toBe(false);
  });

  it('passes the doctor id, the flag and the admin caller to the service', async () => {
    const setDoctorMark = jest
      .fn()
      .mockResolvedValue({ doctorId: 'u-doc', welcomeGiftUsedAt: null });
    const controller = new WelcomeGiftController({
      setDoctorMark,
    } as unknown as WelcomeGiftService);
    const user = { sub: 'u-admin', role: UserRole.admin } as JwtPayload;

    await expect(
      controller.setDoctorMark('u-doc', { used: false }, user),
    ).resolves.toEqual({ doctorId: 'u-doc', welcomeGiftUsedAt: null });
    expect(setDoctorMark).toHaveBeenCalledWith('u-doc', false, {
      userId: 'u-admin',
      role: UserRole.admin,
    });
  });
});

describe('WelcomeGiftMarkDto (global ValidationPipe)', () => {
  it.each([true, false])('accepts used=%s', async (used) => {
    await expect(pipe.transform({ used }, body)).resolves.toEqual({ used });
  });

  it.each([
    [
      'the string "false" (implicit conversion would make it true)',
      { used: 'false' },
    ],
    ['a missing flag', {}],
    ['a number', { used: 0 }],
    ['an unknown field', { used: true, welcomeGiftUsedAt: null }],
  ])('rejects %s with a 400', async (_label, payload) => {
    await expect(pipe.transform(payload, body)).rejects.toMatchObject({
      status: 400,
    });
  });
});
