import { UserRole, VerificationStatus } from '@prisma/client';
import type { MailService } from '../../mail/mail.service';
import type { Caller } from '../../common/access/caller';
import { UserListQueryDto } from '../dto/user.dto';
import type {
  UserRepository,
  UserWithProfile,
} from '../repositories/user.repository';
import { UserService } from './user.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const superAdmin: Caller = { userId: 'u-root', role: UserRole.super_admin };

/** A repository row as `findMany` / `create` return it (USER_INCLUDE). */
const row = (over: Partial<UserWithProfile> = {}): UserWithProfile =>
  ({
    id: 'u-1',
    email: 'dr@test.tn',
    fullName: 'Dr Test',
    phone: null,
    role: UserRole.dentist,
    isActive: true,
    isEmailVerified: true,
    avatarUrl: null,
    country: 'TN',
    preferredLanguage: 'fr',
    lastLoginAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    deletedAt: null,
    verificationStatus: VerificationStatus.approved,
    welcomeGiftUsedAt: null,
    dentistProfile: null,
    doctorOrders: [],
    ...over,
  }) as unknown as UserWithProfile;

function makeService(repo: Partial<Record<keyof UserRepository, jest.Mock>>) {
  const service = new UserService(
    repo as unknown as UserRepository,
    {} as MailService,
  );
  return service;
}

const listQuery = (over: Partial<UserListQueryDto> = {}) =>
  Object.assign(new UserListQueryDto(), over);

describe('UserService.createUser', () => {
  const base = {
    email: 'new@test.tn',
    fullName: 'New User',
    password: 'P@ssword123',
  };

  function creatingRepo() {
    return {
      findByEmail: jest.fn().mockResolvedValue(null),
      findByPhone: jest.fn().mockResolvedValue(null),
      create: jest.fn((data: { role?: UserRole }) =>
        Promise.resolve(row({ role: data.role ?? UserRole.dentist })),
      ),
    };
  }

  it('honours the requested role', async () => {
    const repo = creatingRepo();
    const service = makeService(repo);

    const created = await service.createUser(
      { ...base, role: UserRole.designer },
      admin,
    );

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.designer }),
    );
    expect(created.role).toBe(UserRole.designer);
  });

  it('leaves the role to the schema default (dentist) when omitted', async () => {
    const repo = creatingRepo();
    const service = makeService(repo);

    await service.createUser(base, admin);

    expect(
      (repo.create.mock.calls[0][0] as { role?: UserRole }).role,
    ).toBeUndefined();
  });

  it('only a super admin can create a super admin (403, nothing written)', async () => {
    const repo = creatingRepo();
    const service = makeService(repo);

    await expect(
      service.createUser({ ...base, role: UserRole.super_admin }, admin),
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.create).not.toHaveBeenCalled();

    await expect(
      service.createUser({ ...base, role: UserRole.super_admin }, superAdmin),
    ).resolves.toMatchObject({ role: UserRole.super_admin });
  });
});

describe('UserService.updateUserRole — hierarchy', () => {
  const roleRepo = (current: UserRole) => ({
    findById: jest.fn().mockResolvedValue(row({ role: current })),
    update: jest
      .fn()
      .mockImplementation((_id: string, data: { role: UserRole }) =>
        Promise.resolve(row({ role: data.role })),
      ),
  });

  it('an admin cannot grant super admin (403, nothing written)', async () => {
    const repo = roleRepo(UserRole.dentist);
    await expect(
      makeService(repo).updateUserRole('u-1', UserRole.super_admin, admin),
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('an admin cannot demote a super admin (403, nothing written)', async () => {
    const repo = roleRepo(UserRole.super_admin);
    await expect(
      makeService(repo).updateUserRole('u-1', UserRole.dentist, admin),
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('an admin can still move a user between ordinary roles', async () => {
    const repo = roleRepo(UserRole.dentist);
    await expect(
      makeService(repo).updateUserRole('u-1', UserRole.designer, admin),
    ).resolves.toMatchObject({ role: UserRole.designer });
  });

  it('a super admin can grant and remove super admin', async () => {
    await expect(
      makeService(roleRepo(UserRole.admin)).updateUserRole(
        'u-1',
        UserRole.super_admin,
        superAdmin,
      ),
    ).resolves.toMatchObject({ role: UserRole.super_admin });
    await expect(
      makeService(roleRepo(UserRole.super_admin)).updateUserRole(
        'u-1',
        UserRole.admin,
        superAdmin,
      ),
    ).resolves.toMatchObject({ role: UserRole.admin });
  });
});

describe('UserService lists', () => {
  it('pages from the validated query (skip = (page - 1) * limit)', async () => {
    const findAll = jest.fn().mockResolvedValue({ users: [row()], total: 31 });
    const service = makeService({ findAll });
    const query = listQuery({ page: 3, limit: 10, search: 'ali' });

    const res = await service.getAllUsers(query);

    expect(findAll).toHaveBeenCalledWith(20, 10, query);
    expect(res).toMatchObject({ total: 31, page: 3, limit: 10, totalPages: 4 });
    expect(res.data).toHaveLength(1);
  });

  it('the deleted list takes the same query, filters included', async () => {
    const findAllDeleted = jest.fn().mockResolvedValue({ users: [], total: 0 });
    const service = makeService({ findAllDeleted });
    const query = listQuery({ page: 1, limit: 25, isActive: false });

    const res = await service.getDeletedUsers(query);

    expect(findAllDeleted).toHaveBeenCalledWith(0, 25, query);
    expect(res).toMatchObject({ total: 0, totalPages: 0, data: [] });
  });

  it('exposes the gift mark and the latest gift order of a dentist', async () => {
    const usedAt = new Date('2026-11-04T09:00:00Z');
    const findAll = jest.fn().mockResolvedValue({
      users: [
        row({
          welcomeGiftUsedAt: usedAt,
          doctorOrders: [{ id: 'o-9', orderCode: 'ORD-9', deletedAt: null }],
        } as Partial<UserWithProfile>),
        row({ id: 'u-2' }),
      ],
      total: 2,
    });
    const service = makeService({ findAll });

    const { data } = await service.getAllUsers(listQuery());

    expect(data[0]).toMatchObject({
      welcomeGiftUsedAt: usedAt,
      welcomeGiftOrder: { id: 'o-9', orderCode: 'ORD-9', archived: false },
    });
    expect(data[1]).toMatchObject({
      welcomeGiftUsedAt: null,
      welcomeGiftOrder: null,
    });
  });

  it('keeps an archived gift order but flags it (no link to a 404)', async () => {
    const findById = jest.fn().mockResolvedValue(
      row({
        welcomeGiftUsedAt: new Date('2026-11-04T09:00:00Z'),
        doctorOrders: [
          {
            id: 'o-7',
            orderCode: 'ORD-7',
            deletedAt: new Date('2026-11-05T10:00:00Z'),
          },
        ],
      } as Partial<UserWithProfile>),
    );
    const service = makeService({ findById });

    const user = await service.getUserById('u-1');

    // The exact shape: deletedAt itself never leaks into the payload.
    expect(user.welcomeGiftOrder).toEqual({
      id: 'o-7',
      orderCode: 'ORD-7',
      archived: true,
    });
  });

  it('never shows a gift order for a non-dentist', async () => {
    const findById = jest.fn().mockResolvedValue(
      row({
        role: UserRole.admin,
        doctorOrders: [{ id: 'o-1', orderCode: 'ORD-1', deletedAt: null }],
      } as Partial<UserWithProfile>),
    );
    const service = makeService({ findById });

    await expect(service.getUserById('u-1')).resolves.toMatchObject({
      welcomeGiftOrder: null,
    });
  });

  it('stats come straight from the repository counts', async () => {
    const stats = {
      total: 10,
      active: 8,
      blocked: 2,
      pending: 1,
      dentists: 7,
      admins: 2,
      giftAvailable: 5,
      giftUsed: 2,
    };
    const countStats = jest.fn().mockResolvedValue(stats);
    const service = makeService({ countStats });

    await expect(service.getStats()).resolves.toEqual(stats);
  });
});

describe('UserService.updateUser — phone', () => {
  const self = { id: 'u-1', role: UserRole.dentist };

  it('clears the phone when the DTO carries null', async () => {
    const update = jest.fn().mockResolvedValue(row());
    const service = makeService({
      findById: jest.fn().mockResolvedValue(row({ phone: '+21612345678' })),
      findByPhone: jest.fn(),
      update,
    });

    await service.updateUser('u-1', { phone: null, country: null }, self);

    expect(update).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ phone: null, country: null }),
    );
  });

  it('keeps refusing a number held by another account', async () => {
    const service = makeService({
      findById: jest.fn().mockResolvedValue(row()),
      findByPhone: jest.fn().mockResolvedValue({ id: 'u-other' }),
      update: jest.fn(),
    });

    await expect(
      service.updateUser('u-1', { phone: '+21612345678' }, self),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
