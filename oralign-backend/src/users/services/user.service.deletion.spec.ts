import type { UserRepository } from '../repositories/user.repository';
import type { MailService } from '../../mail/mail.service';
import { UserService } from './user.service';
import { DeletionBlockedException } from '../../common/deletion/deletion-blocked';
import { NotFoundException } from '../../common/exceptions/app.exception';

function makeService(opts: {
  user?: { id: string; deletedAt: Date | null } | null;
  deps?: Record<string, { patients: number; orders: number } | null>;
}) {
  const repo = {
    findById: jest.fn().mockResolvedValue(opts.user === undefined ? { id: 'u1', deletedAt: new Date() } : opts.user),
    delete: jest.fn().mockResolvedValue({}),
    bulkDelete: jest.fn().mockImplementation((ids: string[]) => Promise.resolve(ids.length)),
    hardDelete: jest.fn().mockResolvedValue({}),
    bulkHardDelete: jest.fn().mockImplementation((ids: string[]) => Promise.resolve(ids.length)),
    countProtectedDependents: jest.fn().mockImplementation((id: string) =>
      Promise.resolve(opts.deps?.[id] === undefined ? { patients: 0, orders: 0 } : opts.deps[id]),
    ),
  } as unknown as UserRepository;
  const service = new UserService(repo, {} as MailService);
  return { service, repo };
}

describe('UserService — deletion policy', () => {
  it('soft delete refuses self-deletion (403) and never calls the repository', async () => {
    const { service, repo } = makeService({});
    await expect(service.deleteUser('me', 'me')).rejects.toMatchObject({ status: 403 });
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('bulk soft delete drops the caller from the id list AND reports it', async () => {
    const { service, repo } = makeService({});
    const res = await service.bulkDeleteUsers(['a', 'me', 'b'], 'me');
    expect(repo.bulkDelete).toHaveBeenCalledWith(['a', 'b']);
    // Not silent: "2 users deleted" for 3 selected rows would read as
    // success for something that partly did not happen.
    expect(res).toMatchObject({ count: 2, skippedSelf: true });
  });

  it('bulk soft delete reports skippedSelf=false when the caller is not in the selection', async () => {
    const { service } = makeService({});
    await expect(service.bulkDeleteUsers(['a', 'b'], 'me')).resolves.toMatchObject({
      count: 2,
      skippedSelf: false,
    });
  });

  it('permanent delete is trash-first: a live account is a 404 "Deleted user not found"', async () => {
    const { service, repo } = makeService({ user: { id: 'u1', deletedAt: null } });
    await expect(service.permanentlyDeleteUser('u1', 'admin')).rejects.toThrow(NotFoundException);
    expect(repo.hardDelete).not.toHaveBeenCalled();
  });

  it('permanent delete is blocked (409) while the account owns patients or orders', async () => {
    const { service, repo } = makeService({ deps: { u1: { patients: 2, orders: 5 } } });
    await expect(service.permanentlyDeleteUser('u1', 'admin')).rejects.toBeInstanceOf(DeletionBlockedException);
    expect(repo.hardDelete).not.toHaveBeenCalled();
  });

  it('permanent delete of an archived staff account with no owned history succeeds', async () => {
    const { service, repo } = makeService({});
    await expect(service.permanentlyDeleteUser('u1', 'admin')).resolves.toEqual({ message: 'User permanently deleted' });
    expect(repo.hardDelete).toHaveBeenCalledWith('u1');
  });

  it('bulk permanent: purges eligible ids, counts blocked ones (incl. self), skips unknown', async () => {
    const { service, repo } = makeService({
      deps: { ok: { patients: 0, orders: 0 }, doc: { patients: 1, orders: 0 }, gone: null },
    });
    const res = await service.bulkPermanentlyDeleteUsers(['ok', 'doc', 'me', 'gone'], 'me');
    expect(res.count).toBe(1);
    expect(res.blocked).toBe(2);
    expect(res.message).toContain('kept because history depends');
    expect(repo.bulkHardDelete).toHaveBeenCalledWith(['ok']);
  });
});
