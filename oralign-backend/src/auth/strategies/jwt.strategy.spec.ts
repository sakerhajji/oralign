import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

process.env.JWT_SECRET ??= 'test-secret-for-jwt-strategy-spec';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JwtStrategy } = require('./jwt.strategy') as typeof import('./jwt.strategy');

/**
 * validate() is the ONE place a raw token claim becomes a typed principal.
 * Two invariants:
 *   1. an unknown role claim is refused, so downstream code can rely on
 *      `user.role: UserRole` without casting;
 *   2. the principal is resolved from the DATABASE, not from the claims —
 *      a 15-minute token is a snapshot, and both directions of a stale
 *      snapshot are bugs: a promoted account gets 403s on an admin UI that
 *      renders fine, and a demoted / blocked / archived one keeps access
 *      it should have lost.
 */

type Row = {
  email: string;
  role: UserRole;
  isActive: boolean;
  deletedAt: Date | null;
  tokenVersion: number;
};

const row = (over: Partial<Row> = {}): Row => ({
  email: 'admin@oralign.test',
  role: UserRole.admin,
  isActive: true,
  deletedAt: null,
  tokenVersion: 3,
  ...over,
});

function makeStrategy(user: Row | null) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
  } as unknown as PrismaService;
  return { strategy: new JwtStrategy(prisma), prisma };
}

/** A token issued while the account was still a dentist. */
const base = { sub: 'u1', email: 'stale@oralign.test', iat: 1, exp: 2, tv: 3 };

describe('JwtStrategy.validate', () => {
  it.each(Object.values(UserRole))(
    'accepts a token whose role claim is %s',
    async (role) => {
      const { strategy } = makeStrategy(row({ role }));
      await expect(strategy.validate({ ...base, role })).resolves.toMatchObject(
        { role },
      );
    },
  );

  it.each(['root', '', 'ADMIN', 42, null, undefined])(
    'rejects an unknown role claim (%p) with 401 — before any DB hit',
    async (role) => {
      const { strategy, prisma } = makeStrategy(row());
      await expect(strategy.validate({ ...base, role })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    },
  );

  it('preserves the tokenVersion claim used for revocation', async () => {
    const { strategy } = makeStrategy(row());
    const principal = await strategy.validate({
      ...base,
      role: UserRole.admin,
    });
    expect(principal.tv).toBe(3);
  });

  // ── the principal comes from the row, not the claims ────────────────

  it('authorizes with the CURRENT role, not the one frozen in the token', async () => {
    // Promoted to admin after this token was minted: the admin dashboard
    // rendered (that reads /auth/me) but every admin call used to 403.
    const { strategy } = makeStrategy(row({ role: UserRole.admin }));
    await expect(
      strategy.validate({ ...base, role: UserRole.dentist }),
    ).resolves.toMatchObject({ role: UserRole.admin });
  });

  it('drops privileges immediately when the account was demoted', async () => {
    const { strategy } = makeStrategy(row({ role: UserRole.dentist }));
    await expect(
      strategy.validate({ ...base, role: UserRole.admin }),
    ).resolves.toMatchObject({ role: UserRole.dentist });
  });

  it('returns the current e-mail as well', async () => {
    const { strategy } = makeStrategy(row({ email: 'new@oralign.test' }));
    await expect(
      strategy.validate({ ...base, role: UserRole.admin }),
    ).resolves.toMatchObject({ email: 'new@oralign.test' });
  });

  it.each([
    ['the account no longer exists', null],
    ['the account is archived (deletedAt)', row({ deletedAt: new Date() })],
    ['the account is blocked (isActive false)', row({ isActive: false })],
  ])('401s while %s', async (_label, user) => {
    const { strategy } = makeStrategy(user as Row | null);
    await expect(
      strategy.validate({ ...base, role: UserRole.admin }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('401s when tokenVersion moved on — password change / reset revokes REST too', async () => {
    const { strategy } = makeStrategy(row({ tokenVersion: 4 }));
    await expect(
      strategy.validate({ ...base, tv: 3, role: UserRole.admin }),
    ).rejects.toThrow(/revoked/i);
  });

  it('accepts a token with no tv claim while tokenVersion is still 0', async () => {
    const { strategy } = makeStrategy(row({ tokenVersion: 0 }));
    const { tv: _tv, ...noTv } = base;
    await expect(
      strategy.validate({ ...noTv, role: UserRole.admin }),
    ).resolves.toMatchObject({ role: UserRole.admin });
  });

  it('looks the account up by the token subject', async () => {
    const { strategy, prisma } = makeStrategy(row());
    await strategy.validate({ ...base, sub: 'u-42', role: UserRole.admin });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u-42' } }),
    );
  });
});
