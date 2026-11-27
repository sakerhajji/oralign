import type { PrismaService } from '../../prisma/prisma.service';
import { DentistProfileRepository } from './dentist-profile.repository';

function makeRepository(count: number) {
  const restored = { id: 'dp-1', userId: 'u-doc', deletedAt: null };
  const prisma = {
    dentistProfile: {
      updateMany: jest.fn().mockResolvedValue({ count }),
      findUnique: jest.fn().mockResolvedValue(restored),
    },
  };
  return {
    repository: new DentistProfileRepository(
      prisma as unknown as PrismaService,
    ),
    prisma,
    restored,
  };
}

describe('DentistProfileRepository.restoreDeleted', () => {
  it('revives only a soft-deleted row of the user, with the sent fields', async () => {
    const { repository, prisma, restored } = makeRepository(1);

    await expect(
      repository.restoreDeleted('u-doc', {
        clinicName: 'Cabinet',
        city: null,
      }),
    ).resolves.toBe(restored);

    const [args] = prisma.dentistProfile.updateMany.mock.calls[0] as [
      { where: unknown; data: Record<string, unknown> },
    ];
    // Guarded: a live clinic is never overwritten by a create.
    expect(args.where).toEqual({ userId: 'u-doc', deletedAt: { not: null } });
    expect(args.data).toMatchObject({
      clinicName: 'Cabinet',
      city: null,
      deletedAt: null,
    });
    expect(args.data.updatedAt).toBeInstanceOf(Date);
    expect(prisma.dentistProfile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u-doc' } }),
    );
  });

  it('null when there was no deleted clinic to restore (nothing re-read)', async () => {
    const { repository, prisma } = makeRepository(0);

    await expect(
      repository.restoreDeleted('u-doc', { clinicName: 'Cabinet' }),
    ).resolves.toBeNull();
    expect(prisma.dentistProfile.findUnique).not.toHaveBeenCalled();
  });
});
