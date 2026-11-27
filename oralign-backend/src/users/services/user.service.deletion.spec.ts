import type { UserRepository } from '../repositories/user.repository';
import type { MailService } from '../../mail/mail.service';
import { UserService } from './user.service';
import { DeletionBlockedException } from '../../common/deletion/deletion-blocked';
import { NotFoundException } from '../../common/exceptions/app.exception';
import { UserRole } from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { DoctorActivityService } from '../activity/doctor-activity.service';

const asAdmin = (userId: string): Caller => ({ userId, role: UserRole.admin });

function makeService(opts: {
  user?: { id: string; deletedAt: Date | null } | null;
  deps?: Record<string, { patients: number; orders: number } | null>;
}) {
  // Plain jest.Mock members (not UserRepository methods), so the
  // assertions below never read an unbound method.
  const repo = {
    findById: jest
      .fn()
      .mockResolvedValue(
        opts.user === undefined
          ? { id: 'u1', deletedAt: new Date() }
          : opts.user,
      ),
    delete: jest.fn().mockResolvedValue({}),
    bulkDelete: jest
      .fn()
      .mockImplementation((ids: string[]) => Promise.resolve(ids.length)),
    countSuperAdmins: jest.fn().mockResolvedValue(0),
    hardDelete: jest.fn().mockResolvedValue({}),
    bulkHardDelete: jest
      .fn()
      .mockImplementation((ids: string[]) => Promise.resolve(ids.length)),
    countProtectedDependents: jest
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve(
          opts.deps?.[id] === undefined
            ? { patients: 0, orders: 0 }
            : opts.deps[id],
        ),
      ),
  };
  const service = new UserService(
    repo as unknown as UserRepository,
    {} as MailService,
    {} as DoctorActivityService,
    { emit: jest.fn() } as unknown as EventEmitter2,
  );
  return { service, repo };
}

describe('UserService — deletion policy', () => {
  it('soft delete refuses self-deletion (403) and never calls the repository', async () => {
    const { service, repo } = makeService({});
    await expect(service.deleteUser('me', asAdmin('me'))).rejects.toMatchObject(
      { status: 403 },
    );
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('bulk soft delete drops the caller from the id list AND reports it', async () => {
    const { service, repo } = makeService({});
    const res = await service.bulkDeleteUsers(['a', 'me', 'b'], asAdmin('me'));
    expect(repo.bulkDelete).toHaveBeenCalledWith(['a', 'b'], {
      spareSuperAdmins: true,
    });
    // Not silent: "2 users deleted" for 3 selected rows would read as
    // success for something that partly did not happen.
    expect(res).toMatchObject({ count: 2, skippedSelf: true });
  });

  it('bulk soft delete reports skippedSelf=false when the caller is not in the selection', async () => {
    const { service } = makeService({});
    await expect(
      service.bulkDeleteUsers(['a', 'b'], asAdmin('me')),
    ).resolves.toMatchObject({
      count: 2,
      skippedSelf: false,
    });
  });

  it('permanent delete is trash-first: a live account is a 404 "Deleted user not found"', async () => {
    const { service, repo } = makeService({
      user: { id: 'u1', deletedAt: null },
    });
    await expect(
      service.permanentlyDeleteUser('u1', asAdmin('admin')),
    ).rejects.toThrow(NotFoundException);
    expect(repo.hardDelete).not.toHaveBeenCalled();
  });

  it('permanent delete is blocked (409) while the account owns patients or orders', async () => {
    const { service, repo } = makeService({
      deps: { u1: { patients: 2, orders: 5 } },
    });
    await expect(
      service.permanentlyDeleteUser('u1', asAdmin('admin')),
    ).rejects.toBeInstanceOf(DeletionBlockedException);
    expect(repo.hardDelete).not.toHaveBeenCalled();
  });

  it('permanent delete of an archived staff account with no owned history succeeds', async () => {
    const { service, repo } = makeService({});
    await expect(
      service.permanentlyDeleteUser('u1', asAdmin('admin')),
    ).resolves.toEqual({ message: 'User permanently deleted' });
    expect(repo.hardDelete).toHaveBeenCalledWith('u1');
  });

  it('bulk permanent: purges eligible ids, counts blocked ones (incl. self), skips unknown', async () => {
    const { service, repo } = makeService({
      deps: {
        ok: { patients: 0, orders: 0 },
        doc: { patients: 1, orders: 0 },
        gone: null,
      },
    });
    const res = await service.bulkPermanentlyDeleteUsers(
      ['ok', 'doc', 'me', 'gone'],
      asAdmin('me'),
    );
    expect(res.count).toBe(1);
    expect(res.blocked).toBe(2);
    expect(res.message).toContain('kept because history depends');
    expect(repo.bulkHardDelete).toHaveBeenCalledWith(['ok'], {
      spareSuperAdmins: true,
    });
  });
});
