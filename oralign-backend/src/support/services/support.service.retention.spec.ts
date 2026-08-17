// `uuid` ships ESM-only and jest does not transform node_modules; the
// retention sweep never calls it, so a stub keeps the import graph loadable.
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));

import * as fs from 'fs';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SupportChatGateway } from '../gateways/support-chat.gateway';
import type { MediaProcessingService } from '../../media/media-processing.service';
import {
  DELETED_CONVERSATION_RETENTION_MS,
  SupportService,
} from './support.service';

/**
 * Support-trash retention sweep. An admin-archived conversation is kept
 * (restorable, attachments intact) until the retention window expires;
 * only then are the row and its /uploads/support/<id> directory dropped.
 * Nothing that is live — or recently archived — may ever be touched.
 */

const NOW = new Date('2026-08-17T00:00:00.000Z');

function makeService(expired: { id: string }[]) {
  const prisma = {
    supportConversation: {
      findMany: jest.fn().mockResolvedValue(expired),
      deleteMany: jest.fn().mockResolvedValue({ count: expired.length }),
    },
  } as unknown as PrismaService;
  const service = new SupportService(
    prisma,
    {} as SupportChatGateway,
    {} as MediaProcessingService,
  );
  return { service, prisma };
}

describe('SupportService.purgeExpiredDeletedConversations', () => {
  let rm: jest.SpyInstance;

  beforeEach(() => {
    rm = jest
      .spyOn(fs.promises, 'rm')
      .mockResolvedValue(undefined as unknown as void);
  });
  afterEach(() => rm.mockRestore());

  it('selects ONLY conversations archived before the retention cutoff', async () => {
    const { service, prisma } = makeService([]);
    await service.purgeExpiredDeletedConversations(NOW);
    const where = (prisma.supportConversation.findMany as jest.Mock).mock
      .calls[0][0].where;
    expect(where.deletedAt.not).toBeNull();
    expect(where.deletedAt.lt).toEqual(
      new Date(NOW.getTime() - DELETED_CONVERSATION_RETENTION_MS),
    );
  });

  it('is a no-op when nothing has expired — no deletes, no disk work', async () => {
    const { service, prisma } = makeService([]);
    await expect(service.purgeExpiredDeletedConversations(NOW)).resolves.toEqual(
      { purged: 0 },
    );
    expect(prisma.supportConversation.deleteMany).not.toHaveBeenCalled();
    expect(rm).not.toHaveBeenCalled();
  });

  it('purges expired rows in one statement, then their upload directories', async () => {
    const { service, prisma } = makeService([{ id: 'c1' }, { id: 'c2' }]);
    await expect(service.purgeExpiredDeletedConversations(NOW)).resolves.toEqual(
      { purged: 2 },
    );
    expect(prisma.supportConversation.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['c1', 'c2'] } },
    });
    expect(rm).toHaveBeenCalledTimes(2);
    for (const call of rm.mock.calls) {
      expect(String(call[0])).toContain('support');
      expect(call[1]).toEqual({ recursive: true, force: true });
    }
  });

  it('refuses to rm a directory whose id is not id-shaped (path-traversal guard)', async () => {
    const { service } = makeService([{ id: '../../etc' }]);
    await service.purgeExpiredDeletedConversations(NOW);
    expect(rm).not.toHaveBeenCalled();
  });
});
