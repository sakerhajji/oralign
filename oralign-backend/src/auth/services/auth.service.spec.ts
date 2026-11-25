import { JwtService } from '@nestjs/jwt';
import { UserRole, VerificationStatus } from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { MailService } from '../../mail/mail.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';

// Fast, deterministic hashing: what is under test is the bookkeeping.
jest.mock('bcryptjs', () => ({
  hash: jest.fn((plain: string) => Promise.resolve(`hash:${plain}`)),
  compare: jest.fn((plain: string, hash: string) =>
    Promise.resolve(hash === `hash:${plain}`),
  ),
}));

const SECRETS = {
  JWT_SECRET: 'spec-access-0123456789abcdefghijklmnop',
  JWT_REFRESH_SECRET: 'spec-refresh-0123456789abcdefghijklmnop',
  JWT_RESET_SECRET: 'spec-reset-0123456789abcdefghijklmnopq',
};
Object.assign(process.env, SECRETS);

const jwt = new JwtService({});

const account = (over: Record<string, unknown> = {}) => ({
  id: 'u-tech',
  email: 'tech@lab.tn',
  fullName: 'Technicienne',
  role: UserRole.technician,
  isActive: true,
  deletedAt: null,
  lockedUntil: null,
  failedLoginAttempts: 0,
  isEmailVerified: true,
  verificationStatus: VerificationStatus.approved,
  avatarUrl: null,
  preferredLanguage: 'fr',
  passwordHash: 'hash:Temp0rary-Pass',
  tokenVersion: 4,
  mustChangePassword: true,
  ...over,
});

function makeService(user: ReturnType<typeof account> | null) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn(
        (args: { data: { tokenVersion?: { increment: number } } }) =>
          Promise.resolve({
            ...user,
            tokenVersion:
              (user?.tokenVersion ?? 0) +
              (args.data.tokenVersion?.increment ?? 0),
          }),
      ),
    },
  };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt,
    {} as MailService,
    { emit: jest.fn() } as unknown as EventEmitter2,
  );
  return { service, prisma };
}

describe('AuthService.signIn — the temporary-password flag', () => {
  it('tells the client the account must choose its password', async () => {
    const { service } = makeService(account());
    await expect(
      service.signIn({ email: 'tech@lab.tn', password: 'Temp0rary-Pass' }),
    ).resolves.toMatchObject({ mustChangePassword: true });
  });

  it('false for an ordinary account', async () => {
    const { service } = makeService(
      account({ role: UserRole.dentist, mustChangePassword: false }),
    );
    await expect(
      service.signIn({ email: 'tech@lab.tn', password: 'Temp0rary-Pass' }),
    ).resolves.toMatchObject({ mustChangePassword: false });
  });
});

// The sentence is English; the sign-in screen words the delay itself.
describe('AuthService.signIn — a locked account gets its delay as a number', () => {
  it('a locked account: the minutes left, rounded up', async () => {
    const { service } = makeService(
      account({ lockedUntil: new Date(Date.now() + 4 * 60_000 + 1_000) }),
    );
    await expect(
      service.signIn({ email: 'tech@lab.tn', password: 'Temp0rary-Pass' }),
    ).rejects.toMatchObject({
      statusCode: 401,
      errorCode: 'ACCOUNT_LOCKED',
      details: { retryAfterMinutes: 5 },
    });
  });

  it('the failed attempt that locks it: the whole lock, 15 minutes', async () => {
    const { service } = makeService(account({ failedLoginAttempts: 4 }));
    await expect(
      service.signIn({ email: 'tech@lab.tn', password: 'not-the-password' }),
    ).rejects.toMatchObject({
      errorCode: 'ACCOUNT_LOCKED',
      details: { retryAfterMinutes: 15 },
    });
  });

  it('an ordinary wrong password carries nothing more (no enumeration)', async () => {
    const { service } = makeService(account());
    const error: unknown = await service
      .signIn({ email: 'tech@lab.tn', password: 'not-the-password' })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ errorCode: 'INVALID_CREDENTIALS' });
    expect((error as { details?: unknown }).details).toBeUndefined();
  });
});

describe('AuthService.changePassword', () => {
  const dto = {
    currentPassword: 'Temp0rary-Pass',
    newPassword: 'Her-0wn-Passw0rd',
  };

  it('clears the flag, revokes every session and hands back a fresh pair for the new version', async () => {
    const { service, prisma } = makeService(account({ tokenVersion: 4 }));

    const result = await service.changePassword('u-tech', dto);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-tech' },
        data: {
          passwordHash: 'hash:Her-0wn-Passw0rd',
          tokenVersion: { increment: 1 },
          mustChangePassword: false,
        },
      }),
    );
    // The handover trace is left as it is (it records the last handover).
    const data = (prisma.user.update.mock.calls[0][0] as { data: object }).data;
    expect(data).not.toHaveProperty('temporaryPasswordIssuedAt');
    expect(data).not.toHaveProperty('temporaryPasswordIssuedById');

    expect(result.message).toBe('Password changed successfully');
    const access = jwt.verify<{ sub: string; tv: number; role: string }>(
      result.authToken.accessToken,
      { secret: SECRETS.JWT_SECRET },
    );
    const refresh = jwt.verify<{ sub: string; tv: number }>(
      result.authToken.refreshToken,
      { secret: SECRETS.JWT_REFRESH_SECRET },
    );
    // tv 5: the JwtStrategy / refresh checks accept it, every older token is dead.
    expect(access).toMatchObject({ sub: 'u-tech', tv: 5, role: 'technician' });
    expect(refresh).toMatchObject({ sub: 'u-tech', tv: 5 });
  });

  it('a wrong current password changes nothing', async () => {
    const { service, prisma } = makeService(account());
    await expect(
      service.changePassword('u-tech', { ...dto, currentPassword: 'nope' }),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses to keep the temporary password as the new one', async () => {
    const { service, prisma } = makeService(account());
    await expect(
      service.changePassword('u-tech', {
        currentPassword: 'Temp0rary-Pass',
        newPassword: 'Temp0rary-Pass',
      }),
    ).rejects.toMatchObject({ errorCode: 'SAME_PASSWORD' });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('AuthService.resetPassword (forgot password)', () => {
  it('clears a pending temporary password as well', async () => {
    const { service, prisma } = makeService(account({ tokenVersion: 2 }));
    const token = jwt.sign(
      { sub: 'u-tech', purpose: 'password-reset', tv: 2 },
      { secret: SECRETS.JWT_RESET_SECRET, expiresIn: 60 },
    );

    await service.resetPassword({ token, newPassword: 'Her-0wn-Passw0rd' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-tech' },
      data: {
        passwordHash: 'hash:Her-0wn-Passw0rd',
        tokenVersion: { increment: 1 },
        mustChangePassword: false,
      },
    });
  });
});
