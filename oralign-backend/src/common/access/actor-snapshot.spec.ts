import type { PrismaService } from '../../prisma/prisma.service';
import {
  FULL_NAME_MAX_LENGTH,
  clampFullName,
  lookupActorName,
} from './actor-snapshot';

function prismaWith(user: unknown) {
  const findUnique = jest.fn().mockResolvedValue(user);
  return {
    prisma: { user: { findUnique } } as unknown as Pick<PrismaService, 'user'>,
    findUnique,
  };
}

describe('lookupActorName: the name snapshotted next to an actor FK', () => {
  it('reads only the full name, by id', async () => {
    const { prisma, findUnique } = prismaWith({ fullName: 'Ana Ben Ali' });
    await expect(lookupActorName(prisma, 'u1')).resolves.toBe('Ana Ben Ali');
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { fullName: true },
    });
  });

  it('null when the account is gone', async () => {
    const { prisma } = prismaWith(null);
    await expect(lookupActorName(prisma, 'u1')).resolves.toBeNull();
  });

  it('trims, and clamps a name saved before the bound existed', async () => {
    const { prisma } = prismaWith({
      fullName: `  ${'x'.repeat(900_000)}  `,
    });
    const name = await lookupActorName(prisma, 'u1');
    expect(name).toBe('x'.repeat(FULL_NAME_MAX_LENGTH));
  });
});

describe('clampFullName', () => {
  it('keeps a name within the bound as is, trimmed', () => {
    expect(clampFullName('  Zoé Ben Salah ')).toBe('Zoé Ben Salah');
    const exact = 'a'.repeat(FULL_NAME_MAX_LENGTH);
    expect(clampFullName(exact)).toBe(exact);
  });

  it('cuts at the bound, without a trailing space', () => {
    const name = `${'a'.repeat(FULL_NAME_MAX_LENGTH - 1)} ${'b'.repeat(10)}`;
    expect(clampFullName(name)).toBe('a'.repeat(FULL_NAME_MAX_LENGTH - 1));
  });

  it('never splits an emoji (a surrogate pair) at the cut', () => {
    const name = `${'a'.repeat(FULL_NAME_MAX_LENGTH - 1)}😀tail`;
    const clamped = clampFullName(name);
    expect(clamped).toBe('a'.repeat(FULL_NAME_MAX_LENGTH - 1));
    expect(clamped.length).toBeLessThanOrEqual(FULL_NAME_MAX_LENGTH);
  });
});
