import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

process.env.JWT_SECRET ??= 'test-secret-for-jwt-strategy-spec';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JwtStrategy } = require('./jwt.strategy') as typeof import('./jwt.strategy');

/**
 * validate() is the ONE place a raw token claim becomes a typed principal:
 * downstream code relies on `user.role: UserRole` without casting, so an
 * unknown role must be refused here, not tolerated.
 */
describe('JwtStrategy.validate', () => {
  const strategy = new JwtStrategy();
  const base = { sub: 'u1', email: 'a@b.c', iat: 1, exp: 2, tv: 3 };

  it.each(Object.values(UserRole))('passes a token whose role is %s', (role) => {
    expect(strategy.validate({ ...base, role })).toEqual({ ...base, role });
  });

  it.each(['root', '', 'ADMIN', 42, null, undefined])(
    'rejects an unknown role claim (%p) with 401',
    (role) => {
      expect(() => strategy.validate({ ...base, role })).toThrow(
        UnauthorizedException,
      );
    },
  );

  it('preserves the tokenVersion claim used for revocation', () => {
    expect(strategy.validate({ ...base, role: UserRole.dentist }).tv).toBe(3);
  });
});
