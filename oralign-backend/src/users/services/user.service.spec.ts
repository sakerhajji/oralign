import { UserRole, VerificationStatus } from '@prisma/client';
import type { MailService } from '../../mail/mail.service';
import type { Caller } from '../../common/access/caller';
import { UserListQueryDto } from '../dto/user.dto';
import type {
  UserRepository,
  UserWithProfile,
} from '../repositories/user.repository';
import { UserService } from './user.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { DoctorActivityService } from '../activity/doctor-activity.service';

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
  // The activity rules have their own specs (users/activity): no block here.
  const activity = {
    summaries: jest.fn().mockResolvedValue(new Map()),
    listFilterWhere: jest.fn(),
    journalStatusChange: jest.fn(),
  };
  const service = new UserService(
    repo as unknown as UserRepository,
    {} as MailService,
    activity as unknown as DoctorActivityService,
    { emit: jest.fn() } as unknown as EventEmitter2,
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

describe('UserService.updateUser (PUT /users/:id) — same hierarchy', () => {
  const asAdmin = { id: admin.userId, role: UserRole.admin };
  const asSuperAdmin = { id: superAdmin.userId, role: UserRole.super_admin };

  const editRepo = (target: Partial<UserWithProfile>) => ({
    findById: jest.fn().mockResolvedValue(row(target)),
    findByPhone: jest.fn().mockResolvedValue(null),
    update: jest
      .fn()
      .mockImplementation((_id: string, data: Partial<UserWithProfile>) =>
        Promise.resolve(row({ ...target, ...data })),
      ),
  });

  it('an admin cannot grant super admin (403, nothing written)', async () => {
    const repo = editRepo({ id: 'u-1', role: UserRole.dentist });
    await expect(
      makeService(repo).updateUser(
        'u-1',
        { role: UserRole.super_admin },
        asAdmin,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('an admin cannot promote their own account to super admin', async () => {
    const repo = editRepo({ id: admin.userId, role: UserRole.admin });
    await expect(
      makeService(repo).updateUser(
        admin.userId,
        { role: UserRole.super_admin },
        asAdmin,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('an admin cannot demote a super admin (403, nothing written)', async () => {
    const repo = editRepo({ id: 'u-1', role: UserRole.super_admin });
    await expect(
      makeService(repo).updateUser('u-1', { role: UserRole.admin }, asAdmin),
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('an admin cannot edit a super admin account at all: no password reset, no profile change', async () => {
    for (const dto of [
      { password: 'N3wPassword!' },
      { fullName: 'Renamed' },
      { isEmailVerified: false },
      { role: UserRole.super_admin },
    ]) {
      const repo = editRepo({ id: 'u-1', role: UserRole.super_admin });
      await expect(
        makeService(repo).updateUser('u-1', dto, asAdmin),
      ).rejects.toMatchObject({ status: 403 });
      expect(repo.update).not.toHaveBeenCalled();
    }
  });

  it('an admin still edits ordinary accounts, including the unchanged role the sheet resends', async () => {
    const repo = editRepo({ id: 'u-1', role: UserRole.dentist });
    await expect(
      makeService(repo).updateUser(
        'u-1',
        { fullName: 'Dr Renamed', role: UserRole.dentist },
        asAdmin,
      ),
    ).resolves.toMatchObject({
      fullName: 'Dr Renamed',
      role: UserRole.dentist,
    });
  });

  it('an admin can move a user between ordinary roles (technician included)', async () => {
    const repo = editRepo({ id: 'u-1', role: UserRole.dentist });
    await expect(
      makeService(repo).updateUser(
        'u-1',
        { role: UserRole.technician },
        asAdmin,
      ),
    ).resolves.toMatchObject({ role: UserRole.technician });
    expect(repo.update).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ role: UserRole.technician }),
    );
  });

  it('a super admin can grant and revoke super admin through PUT', async () => {
    await expect(
      makeService(editRepo({ id: 'u-1', role: UserRole.admin })).updateUser(
        'u-1',
        { role: UserRole.super_admin },
        asSuperAdmin,
      ),
    ).resolves.toMatchObject({ role: UserRole.super_admin });
    await expect(
      makeService(
        editRepo({ id: 'u-1', role: UserRole.super_admin }),
      ).updateUser('u-1', { role: UserRole.admin }, asSuperAdmin),
    ).resolves.toMatchObject({ role: UserRole.admin });
  });

  it('a non-admin self-edit never writes a role', async () => {
    const repo = editRepo({ id: 'u-1', role: UserRole.dentist });
    await makeService(repo).updateUser(
      'u-1',
      { fullName: 'Dr Self', role: UserRole.super_admin },
      { id: 'u-1', role: UserRole.dentist },
    );
    const [, data] = repo.update.mock.calls[0] as [string, object];
    expect(data).toMatchObject({ fullName: 'Dr Self' });
    expect(data).not.toHaveProperty('role');
  });
});

describe('UserService.updateUser — a password is never set on a self-edit', () => {
  const editRepo = (target: Partial<UserWithProfile>) => ({
    findById: jest.fn().mockResolvedValue(row(target)),
    findByPhone: jest.fn().mockResolvedValue(null),
    update: jest
      .fn()
      .mockImplementation((_id: string, data: Partial<UserWithProfile>) =>
        Promise.resolve(row({ ...target, ...data })),
      ),
  });

  it.each([
    ['an admin', admin],
    ['a super admin', superAdmin],
  ])(
    '%s changing their OWN password through PUT gets a 403 (change-password verifies the current one)',
    async (_label, self) => {
      const repo = editRepo({ id: self.userId, role: self.role });
      await expect(
        makeService(repo).updateUser(
          self.userId,
          { password: 'N3wPassword!' },
          { id: self.userId, role: self.role },
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repo.update).not.toHaveBeenCalled();
    },
  );

  it('an admin force reset of ANOTHER ordinary account still works and revokes its sessions', async () => {
    const repo = editRepo({ id: 'u-1', role: UserRole.technician });
    await makeService(repo).updateUser(
      'u-1',
      { password: 'N3wPassword!' },
      { id: admin.userId, role: UserRole.admin },
    );
    const [, data] = repo.update.mock.calls[0] as [
      string,
      { passwordHash?: string; tokenVersion?: unknown },
    ];
    expect(data.passwordHash).toEqual(expect.any(String));
    expect(data.passwordHash).not.toBe('N3wPassword!');
    expect(data.tokenVersion).toEqual({ increment: 1 });
  });
});

describe('UserService — the super admin hierarchy on every admin account route', () => {
  const liveSuper = {
    id: 'u-root2',
    role: UserRole.super_admin,
    deletedAt: null,
  };
  const archivedSuper = {
    id: 'u-root2',
    role: UserRole.super_admin,
    deletedAt: new Date('2026-11-01'),
  };

  const accountRepo = (target: Partial<UserWithProfile>) => ({
    findById: jest.fn().mockResolvedValue(row(target)),
    update: jest.fn().mockResolvedValue(row(target)),
    delete: jest.fn().mockResolvedValue(row(target)),
    restore: jest.fn().mockResolvedValue(row(target)),
    hardDelete: jest.fn().mockResolvedValue(row(target)),
    countProtectedDependents: jest
      .fn()
      .mockResolvedValue({ patients: 0, orders: 0, role: target.role }),
  });

  it('an admin cannot verify, approve, archive, restore or purge a super admin (403, nothing written)', async () => {
    const live = accountRepo(liveSuper);
    const service = makeService(live);
    await expect(
      service.updateEmailVerification('u-root2', false, admin),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.updateApproval('u-root2', VerificationStatus.rejected, admin),
    ).rejects.toMatchObject({ status: 403 });
    await expect(service.deleteUser('u-root2', admin)).rejects.toMatchObject({
      status: 403,
    });
    expect(live.update).not.toHaveBeenCalled();
    expect(live.delete).not.toHaveBeenCalled();

    const archived = accountRepo(archivedSuper);
    const archivedService = makeService(archived);
    await expect(
      archivedService.restoreUser('u-root2', admin),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      archivedService.permanentlyDeleteUser('u-root2', admin),
    ).rejects.toMatchObject({ status: 403 });
    expect(archived.restore).not.toHaveBeenCalled();
    expect(archived.hardDelete).not.toHaveBeenCalled();
  });

  it('a super admin passes, and an admin still acts on ordinary accounts', async () => {
    const live = accountRepo(liveSuper);
    await expect(
      makeService(live).updateEmailVerification('u-root2', false, superAdmin),
    ).resolves.toMatchObject({ role: UserRole.super_admin });
    await expect(
      makeService(live).deleteUser('u-root2', superAdmin),
    ).resolves.toEqual({ message: 'User deleted successfully' });

    const dentist = accountRepo({ id: 'u-1', role: UserRole.dentist });
    await expect(
      makeService(dentist).updateApproval(
        'u-1',
        VerificationStatus.rejected,
        admin,
      ),
    ).resolves.toMatchObject({ id: 'u-1' });
    expect(dentist.update).toHaveBeenCalledWith('u-1', {
      verificationStatus: VerificationStatus.rejected,
    });
  });

  it('bulk block, archive and restore spare super admins below super admin, and say how many', async () => {
    const repo = {
      countSuperAdmins: jest.fn().mockResolvedValue(1),
      bulkUpdateStatus: jest.fn().mockResolvedValue(2),
      bulkDelete: jest.fn().mockResolvedValue(2),
      bulkRestore: jest.fn().mockResolvedValue(2),
    };
    const service = makeService(repo);

    await expect(
      service.bulkUpdateStatus(['a', 'b', 'root'], false, admin),
    ).resolves.toMatchObject({ count: 2, skippedSuperAdmins: 1 });
    expect(repo.bulkUpdateStatus).toHaveBeenCalledWith(
      ['a', 'b', 'root'],
      false,
      { spareSuperAdmins: true },
      expect.any(Function),
    );
    expect(repo.countSuperAdmins).toHaveBeenLastCalledWith(['a', 'b', 'root'], {
      deleted: false,
    });

    await expect(
      service.bulkDeleteUsers(['a', 'b', 'root'], admin),
    ).resolves.toMatchObject({ skippedSuperAdmins: 1 });
    expect(repo.bulkDelete).toHaveBeenCalledWith(['a', 'b', 'root'], {
      spareSuperAdmins: true,
    });

    await expect(
      service.bulkRestoreUsers(['a', 'b', 'root'], admin),
    ).resolves.toMatchObject({ skippedSuperAdmins: 1 });
    expect(repo.bulkRestore).toHaveBeenCalledWith(['a', 'b', 'root'], {
      spareSuperAdmins: true,
    });
    expect(repo.countSuperAdmins).toHaveBeenLastCalledWith(['a', 'b', 'root'], {
      deleted: true,
    });
  });

  it('a super admin bulk action touches every selected account and counts nothing', async () => {
    const repo = {
      countSuperAdmins: jest.fn(),
      bulkUpdateStatus: jest.fn().mockResolvedValue(3),
    };
    await expect(
      makeService(repo).bulkUpdateStatus(['a', 'b', 'root'], false, superAdmin),
    ).resolves.toMatchObject({ count: 3, skippedSuperAdmins: 0 });
    expect(repo.bulkUpdateStatus).toHaveBeenCalledWith(
      ['a', 'b', 'root'],
      false,
      { spareSuperAdmins: false },
      expect.any(Function),
    );
    expect(repo.countSuperAdmins).not.toHaveBeenCalled();
  });

  it('bulk purge: a super admin account is blocked for an admin, purged for a super admin', async () => {
    const deps = (id: string) =>
      Promise.resolve({
        patients: 0,
        orders: 0,
        role: id === 'root' ? UserRole.super_admin : UserRole.designer,
      });
    const repo = {
      countProtectedDependents: jest.fn().mockImplementation(deps),
      bulkHardDelete: jest
        .fn()
        .mockImplementation((ids: string[]) => Promise.resolve(ids.length)),
    };

    await expect(
      makeService(repo).bulkPermanentlyDeleteUsers(['a', 'root'], admin),
    ).resolves.toMatchObject({ count: 1, blocked: 1 });
    expect(repo.bulkHardDelete).toHaveBeenLastCalledWith(['a'], {
      spareSuperAdmins: true,
    });

    await expect(
      makeService(repo).bulkPermanentlyDeleteUsers(['a', 'root'], superAdmin),
    ).resolves.toMatchObject({ count: 2, blocked: 0 });
    expect(repo.bulkHardDelete).toHaveBeenLastCalledWith(['a', 'root'], {
      spareSuperAdmins: false,
    });
  });
});

describe('UserService.updateUserRole — no-op on a super admin', () => {
  it('an admin gets a 403 even when "changing" a super admin to the same role', async () => {
    const repo = {
      findById: jest
        .fn()
        .mockResolvedValue(row({ role: UserRole.super_admin })),
      update: jest.fn(),
    };
    await expect(
      makeService(repo).updateUserRole('u-1', UserRole.super_admin, admin),
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe('UserService lists', () => {
  it('pages from the validated query (skip = (page - 1) * limit)', async () => {
    const findAll = jest.fn().mockResolvedValue({ users: [row()], total: 31 });
    const service = makeService({ findAll });
    const query = listQuery({ page: 3, limit: 10, search: 'ali' });

    const res = await service.getAllUsers(query);

    expect(findAll).toHaveBeenCalledWith(20, 10, query, undefined);
    expect(res).toMatchObject({ total: 31, page: 3, limit: 10, totalPages: 4 });
    expect(res.data).toHaveLength(1);
  });

  it('the deleted list takes the same query, filters included', async () => {
    const findAllDeleted = jest.fn().mockResolvedValue({ users: [], total: 0 });
    const service = makeService({ findAllDeleted });
    const query = listQuery({ page: 1, limit: 25, isActive: false });

    const res = await service.getDeletedUsers(query);

    expect(findAllDeleted).toHaveBeenCalledWith(0, 25, query, undefined);
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
