import type { Cache } from 'cache-manager';
import { DOCTOR_PUBLIC_SELECT } from '../../common/doctor/doctor-identity';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  PublicTreatmentViewerService,
  viewerCacheKey,
} from './public-viewer.service';

const NOW = new Date('2026-11-27T09:00:00.000Z');
const TOKEN = 'tok_abcdefgh1234';

function makeService(plan: unknown = null, links: unknown[] = []) {
  const store = new Map<string, unknown>();
  const cache = {
    get: jest.fn((key: string) => Promise.resolve(store.get(key))),
    set: jest.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve(value);
    }),
    del: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve(true);
    }),
  };
  const prisma = {
    treatmentPlan: {
      findUnique: jest.fn().mockResolvedValue(plan),
      findMany: jest.fn().mockResolvedValue(links),
    },
  };
  const service = new PublicTreatmentViewerService(
    prisma as unknown as PrismaService,
    cache as unknown as Cache,
  );
  return { service, prisma, cache, store };
}

const planRow = (doctor: unknown) => ({
  id: 'tp-1',
  name: 'Plan 1',
  version: 1,
  resultViewUrl: null,
  publicExpiresAt: null,
  deletedAt: null,
  order: {
    deletedAt: null,
    doctor,
    patient: { fullName: 'Sarah Morgan', gender: 'female' },
  },
});

describe('PublicTreatmentViewerService — the doctor on the patient link', () => {
  it('reads the doctor through the one anonymous projection', async () => {
    const { service, prisma } = makeService(
      planRow({
        fullName: 'Dr Amel Ben Salah',
        dentistProfile: { clinicName: 'Cabinet Les Berges', deletedAt: null },
      }),
    );

    const payload = await service.getByToken(TOKEN);

    const [[args]] = prisma.treatmentPlan.findUnique.mock.calls as [
      [{ select: { order: { select: { doctor: unknown } } } }],
    ];
    expect(args.select.order.select.doctor).toEqual({
      select: DOCTOR_PUBLIC_SELECT,
    });
    expect(payload.doctor).toEqual({
      fullName: 'Dr Amel Ben Salah',
      clinicName: 'Cabinet Les Berges',
    });
  });

  it('shows no practice name once the practice profile is deleted', async () => {
    const { service } = makeService(
      planRow({
        fullName: 'Dr Amel Ben Salah',
        dentistProfile: {
          clinicName: 'Cabinet Les Berges',
          deletedAt: new Date('2026-10-01'),
        },
      }),
    );
    await expect(service.getByToken(TOKEN)).resolves.toMatchObject({
      doctor: { fullName: 'Dr Amel Ben Salah', clinicName: null },
    });
  });
});

describe('PublicTreatmentViewerService.onUserProfileChanged', () => {
  it("drops the cached payload of every open link of the doctor's plans", async () => {
    const { service, prisma, cache, store } = makeService(null, [
      { publicToken: 'tok_one_12345678' },
      { publicToken: 'tok_two_12345678' },
    ]);
    store.set(viewerCacheKey('tok_one_12345678'), { stale: true });
    store.set(viewerCacheKey('tok_two_12345678'), { stale: true });
    store.set(viewerCacheKey('tok_other_doctor'), { kept: true });

    await service.onUserProfileChanged(
      {
        userId: 'u-doc',
        dentistProfileId: 'dp-1',
        fields: ['clinicName'],
        actorId: 'u-doc',
      },
      NOW,
    );

    expect(prisma.treatmentPlan.findMany).toHaveBeenCalledWith({
      where: {
        publicToken: { not: null },
        order: { doctorId: 'u-doc' },
        OR: [{ publicExpiresAt: null }, { publicExpiresAt: { gt: NOW } }],
      },
      select: { publicToken: true },
    });
    expect(cache.del).toHaveBeenCalledTimes(2);
    expect([...store.keys()]).toEqual([viewerCacheKey('tok_other_doctor')]);
  });

  it('is a no-op for a user without links, and swallows a failing read', async () => {
    const { service, prisma, cache } = makeService(null, []);
    await service.onUserProfileChanged({
      userId: 'u-admin',
      fields: ['fullName'],
      actorId: 'u-admin',
    });
    expect(cache.del).not.toHaveBeenCalled();

    prisma.treatmentPlan.findMany.mockRejectedValue(new Error('db down'));
    await expect(
      service.onUserProfileChanged({
        userId: 'u-doc',
        fields: ['fullName'],
        actorId: 'u-doc',
      }),
    ).resolves.toBeUndefined();
  });
});
