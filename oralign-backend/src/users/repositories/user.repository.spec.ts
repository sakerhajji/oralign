import { Prisma, UserRole, VerificationStatus } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { UserRepository } from './user.repository';

const LIVE: Prisma.UserWhereInput = { deletedAt: null };

describe('UserRepository.buildWhere', () => {
  it('is just the scope without filters', () => {
    expect(UserRepository.buildWhere(LIVE)).toEqual(LIVE);
    expect(UserRepository.buildWhere(LIVE, {})).toEqual(LIVE);
  });

  it('ANDs every filter with the scope', () => {
    expect(
      UserRepository.buildWhere(LIVE, {
        role: UserRole.dentist,
        isActive: false,
        isEmailVerified: true,
        verificationStatus: VerificationStatus.pending,
      }),
    ).toEqual({
      AND: [
        LIVE,
        { role: UserRole.dentist },
        { isActive: false },
        { isEmailVerified: true },
        { verificationStatus: VerificationStatus.pending },
      ],
    });
  });

  it('welcomeGift filters dentists by their mark', () => {
    expect(UserRepository.buildWhere(LIVE, { welcomeGift: 'used' })).toEqual({
      AND: [LIVE, { role: UserRole.dentist, welcomeGiftUsedAt: { not: null } }],
    });
    expect(
      UserRepository.buildWhere(LIVE, { welcomeGift: 'available' }),
    ).toEqual({
      AND: [LIVE, { role: UserRole.dentist, welcomeGiftUsedAt: null }],
    });
  });

  it('never lets the gift filter overwrite a role filter (separate AND terms)', () => {
    const where = UserRepository.buildWhere(LIVE, {
      role: UserRole.admin,
      welcomeGift: 'available',
    });
    expect(where.AND).toEqual([
      LIVE,
      { role: UserRole.admin },
      { role: UserRole.dentist, welcomeGiftUsedAt: null },
    ]);
  });

  it('applies the same filters to the deleted scope (isActive included)', () => {
    expect(
      UserRepository.buildWhere(
        { deletedAt: { not: null } },
        { isActive: true, search: 'ali' },
      ),
    ).toEqual({
      AND: [
        { deletedAt: { not: null } },
        { OR: UserRepository.searchConditions('ali') },
        { isActive: true },
      ],
    });
  });
});

describe('UserRepository.searchConditions', () => {
  it('matches name, email and clinic name, case-insensitive', () => {
    expect(UserRepository.searchConditions('Smile')).toEqual([
      { fullName: { contains: 'Smile', mode: 'insensitive' } },
      { email: { contains: 'Smile', mode: 'insensitive' } },
      {
        dentistProfile: {
          is: { clinicName: { contains: 'Smile', mode: 'insensitive' } },
        },
      },
    ]);
  });

  it.each([
    ['12 345 678', '12345678'],
    ['+216 12-345-678', '+21612345678'],
    ['(71) 000.000', '71000000'],
  ])('matches the phone with separators stripped: "%s"', (term, digits) => {
    expect(UserRepository.searchConditions(term)).toContainEqual({
      phone: { contains: digits },
    });
  });

  it('does not search the phone column for a term without digits', () => {
    expect(
      UserRepository.searchConditions('ben ali').some((c) => 'phone' in c),
    ).toBe(false);
  });
});

describe('UserRepository reads', () => {
  function repoWith(user: Record<string, jest.Mock>) {
    const prisma = { user } as unknown as PrismaService;
    return new UserRepository(prisma);
  }

  it('lists with the clinic profile and ONLY the latest gift order (id + code)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const repo = repoWith({ findMany, count });

    await repo.findAll(20, 10, { search: 'ali' });

    const args = (
      findMany.mock.calls as unknown[][]
    )[0][0] as Prisma.UserFindManyArgs;
    expect(args.skip).toBe(20);
    expect(args.take).toBe(10);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(args.include).toEqual({
      dentistProfile: true,
      doctorOrders: {
        where: { welcomeGiftAppliedAt: { not: null } },
        orderBy: { welcomeGiftAppliedAt: 'desc' },
        take: 1,
        select: { id: true, orderCode: true, deletedAt: true },
      },
    });
    // The count runs on the very same filter.
    expect(count).toHaveBeenCalledWith({ where: args.where });
  });

  it('counts the stats in parallel over non-deleted accounts', async () => {
    const answers: Array<[Prisma.UserWhereInput, number]> = [
      [{ deletedAt: null }, 50],
      [{ deletedAt: null, isActive: true }, 45],
      [{ deletedAt: null, verificationStatus: VerificationStatus.pending }, 4],
      [
        {
          deletedAt: null,
          role: { in: [UserRole.admin, UserRole.super_admin] },
        },
        3,
      ],
      [{ deletedAt: null, role: UserRole.technician }, 2],
      [
        { deletedAt: null, role: UserRole.dentist, welcomeGiftUsedAt: null },
        30,
      ],
      [
        {
          deletedAt: null,
          role: UserRole.dentist,
          welcomeGiftUsedAt: { not: null },
        },
        12,
      ],
      [
        {
          role: UserRole.dentist,
          deletedAt: null,
          inactiveSince: { not: null },
        },
        6,
      ],
    ];
    const count = jest.fn((args: { where: Prisma.UserWhereInput }) => {
      const hit = answers.find(
        ([where]) => JSON.stringify(where) === JSON.stringify(args.where),
      );
      if (!hit) throw new Error(`unexpected count ${JSON.stringify(args)}`);
      return Promise.resolve(hit[1]);
    });
    const repo = repoWith({ count });

    await expect(repo.countStats()).resolves.toEqual({
      total: 50,
      active: 45,
      blocked: 5,
      pending: 4,
      dentists: 42,
      admins: 3,
      technicians: 2,
      giftAvailable: 30,
      giftUsed: 12,
      dormant: 6,
    });
    expect(count).toHaveBeenCalledTimes(8);
  });
});

describe('UserRepository — doctor activity', () => {
  it('adds the resolved activity filter as its own AND term', () => {
    const activity: Prisma.UserWhereInput = {
      role: UserRole.dentist,
      inactiveSince: { not: null },
    };
    expect(
      UserRepository.buildWhere(LIVE, { role: UserRole.admin }, activity),
    ).toEqual({ AND: [LIVE, { role: UserRole.admin }, activity] });
  });

  it('bulk block: locks in id order, journals only the accounts it flips, keeps the historic count', async () => {
    const flipped = [{ id: 'a', role: UserRole.dentist }];
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: {
        findMany: jest.fn().mockResolvedValue(flipped),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    } as unknown as PrismaService;
    const journal = jest.fn().mockResolvedValue(1);

    const count = await new UserRepository(prisma).bulkUpdateStatus(
      ['a', 'b'],
      false,
      { spareSuperAdmins: true },
      journal,
    );

    expect(count).toBe(2);
    const lock = (tx.$queryRaw.mock.calls[0] as unknown[])[0] as string[];
    expect(lock.join('?')).toContain('ORDER BY "id" FOR UPDATE');
    expect(tx.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['a', 'b'] },
          deletedAt: null,
          role: { not: UserRole.super_admin },
          isActive: true,
        },
      }),
    );
    expect(journal).toHaveBeenCalledWith(tx, flipped, expect.any(Date));
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.user.findMany.mock.invocationCallOrder[0],
    );
  });

  it('bulk block with an empty selection touches nothing', async () => {
    const prisma = { $transaction: jest.fn() } as unknown as PrismaService;
    await expect(
      new UserRepository(prisma).bulkUpdateStatus([], true),
    ).resolves.toBe(0);
  });
});
