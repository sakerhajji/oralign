import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { CommunitySubmissionService } from './community-submission.service';

/**
 * Deletion policy for community stories — the one entity where a true
 * permanent delete IS allowed (user-generated content, nothing depends on
 * it, and it carries personal data that must be erasable). The rules the
 * rest of the app relies on still hold: trash-first, media rows go with
 * the parent in one transaction, blobs are unlinked only after the commit.
 */

type Row = {
  id: string;
  deletedAt: Date | null;
  media: { id: string; relativePath: string }[];
};

function makeService(row: Row | null) {
  const tx = {
    communitySubmissionMedia: {
      deleteMany: jest.fn().mockResolvedValue({ count: row?.media.length ?? 0 }),
    },
    communitySubmission: { delete: jest.fn().mockResolvedValue({ id: row?.id }) },
  };
  const prisma = {
    communitySubmission: {
      findFirst: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockImplementation(({ data }: { data: unknown }) => ({
        ...row,
        ...(data as object),
      })),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;
  return { service: new CommunitySubmissionService(prisma), prisma, tx };
}

const archived = (over: Partial<Row> = {}): Row => ({
  id: 'sub-1',
  deletedAt: new Date('2026-08-01'),
  media: [{ id: 'm1', relativePath: 'uploads/community/sub-1/a.jpg' }],
  ...over,
});

describe('CommunitySubmissionService — deletion policy', () => {
  it('404s for an unknown id', async () => {
    const { service } = makeService(null);
    await expect(service.permanentDelete('nope')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('is trash-first: a LIVE story cannot be purged (400 NOT_ARCHIVED)', async () => {
    const { service, tx } = makeService(archived({ deletedAt: null }));
    await expect(service.permanentDelete('sub-1')).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'NOT_ARCHIVED',
    });
    expect(tx.communitySubmission.delete).not.toHaveBeenCalled();
    expect(tx.communitySubmissionMedia.deleteMany).not.toHaveBeenCalled();
  });

  it('purges an archived story: media rows first, then the submission, in ONE transaction', async () => {
    const { service, prisma, tx } = makeService(archived());
    await expect(service.permanentDelete('sub-1')).resolves.toEqual({
      message: 'Community story permanently deleted',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.communitySubmissionMedia.deleteMany).toHaveBeenCalledWith({
      where: { submissionId: 'sub-1' },
    });
    expect(tx.communitySubmission.delete).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
    });
  });

  it('archiving is reversible: restore clears deletedAt', async () => {
    const { service, prisma } = makeService(archived());
    await service.restore('sub-1');
    expect(prisma.communitySubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: { deletedAt: null },
      }),
    );
  });

  it('restore is idempotent for a live story (no write)', async () => {
    const { service, prisma } = makeService(archived({ deletedAt: null }));
    await service.restore('sub-1');
    expect(prisma.communitySubmission.update).not.toHaveBeenCalled();
  });
});
