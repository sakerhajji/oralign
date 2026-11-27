import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Cache } from 'cache-manager';
import { UserRole } from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import { dpKey, whKey } from '../../common/cache/cache-keys';
import { NotificationEvents } from '../../notifications/events/notification-events';
import type { PrismaService } from '../../prisma/prisma.service';
import type { DentistProfileRepository } from '../repositories/dentist-profile.repository';
import {
  DentistProfileService,
  writtenProfileFields,
} from './dentist-profile.service';

const owner: Caller = { userId: 'u-doc', role: UserRole.dentist };
const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const stranger: Caller = { userId: 'u-other', role: UserRole.dentist };

const NOW = new Date('2026-11-27T09:00:00.000Z');

/** A DentistProfile row with the user projection the repository includes. */
const profileRow = (over: Record<string, unknown> = {}) => ({
  id: 'dp-1',
  userId: owner.userId,
  clinicName: 'Cabinet Les Berges',
  clinicAddress: '12 rue du Lac',
  city: 'Tunis',
  country: 'TN',
  latitude: 36.8,
  longitude: 10.18,
  clinicPhone: '+21671000000',
  clinicEmail: 'cabinet@example.tn',
  taxId: '1234567/A/M/000',
  registrationNumber: 'CNOMDT-12345',
  description: null,
  logoUrl: null,
  specialty: 'Orthodontie',
  isListedPublicly: true,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
  user: { fullName: 'Dr Amel Ben Salah', avatarUrl: null },
  ...over,
});

function makeService() {
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
  const repository = {
    findById: jest.fn().mockResolvedValue(profileRow()),
    findByUserId: jest.fn().mockResolvedValue(null),
    findByCity: jest
      .fn()
      .mockResolvedValue({ profiles: [profileRow()], total: 1 }),
    findPublic: jest
      .fn()
      .mockResolvedValue({ profiles: [profileRow()], total: 1 }),
    create: jest.fn((data: Record<string, unknown>) =>
      Promise.resolve(profileRow({ ...data, id: 'dp-new' })),
    ),
    update: jest.fn((id: string, data: Record<string, unknown>) =>
      Promise.resolve(profileRow({ ...data, id })),
    ),
    delete: jest.fn().mockResolvedValue(profileRow({ deletedAt: NOW })),
  };
  const tx = {
    dentistProfile: {
      findUnique: jest.fn().mockResolvedValue(profileRow()),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(profileRow(data)),
      ),
      create: jest.fn(),
    },
    workingHours: {
      deleteMany: jest.fn().mockResolvedValue({ count: 7 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    dentistProfile: { findUnique: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const events = { emit: jest.fn() };
  const service = new DentistProfileService(
    repository as unknown as DentistProfileRepository,
    prisma as unknown as PrismaService,
    events as unknown as EventEmitter2,
    cache as unknown as Cache,
  );
  return { service, repository, prisma, tx, events, cache, store };
}

describe('writtenProfileFields', () => {
  it('lists the keys a write really sent, sorted, undefined left out', () => {
    expect(
      writtenProfileFields({
        clinicPhone: '+21671000000',
        registrationNumber: null,
        clinicName: 'Cabinet',
        taxId: undefined,
      }),
    ).toEqual(['clinicName', 'clinicPhone', 'registrationNumber']);
  });
});

describe('DentistProfileService — registrationNumber is private like taxId', () => {
  it('the owner and admins read it', async () => {
    const { service } = makeService();
    await expect(service.getProfileById('dp-1', owner)).resolves.toMatchObject({
      registrationNumber: 'CNOMDT-12345',
      taxId: '1234567/A/M/000',
    });
    // Second read comes from the cache: still caller-agnostic.
    await expect(service.getProfileById('dp-1', admin)).resolves.toMatchObject({
      registrationNumber: 'CNOMDT-12345',
    });
  });

  it('any other caller gets it stripped with taxId and the clinic e-mail', async () => {
    const { service } = makeService();
    const dto = await service.getProfileById('dp-1', stranger);
    expect(dto.registrationNumber).toBeUndefined();
    expect(dto.taxId).toBeUndefined();
    expect(dto.clinicEmail).toBeUndefined();
    expect(dto.clinicName).toBe('Cabinet Les Berges');
  });

  it('the directory searches never return it', async () => {
    const { service } = makeService();
    const page = await service.searchByCity('Tunis');
    expect(page.data[0].registrationNumber).toBeUndefined();
    expect(page.data[0].taxId).toBeUndefined();
  });

  it('the public finder shape has no private field at all', async () => {
    const { service } = makeService();
    const page = await service.getPublicList({});
    expect(page.data[0]).not.toHaveProperty('registrationNumber');
    expect(page.data[0]).not.toHaveProperty('taxId');
    expect(page.data[0]).not.toHaveProperty('clinicEmail');
    expect(page.data[0]).not.toHaveProperty('userId');
  });
});

describe('DentistProfileService — clinic writes announce user.profileChanged', () => {
  it('an update drops both cache keys and emits the written fields with the actor', async () => {
    const { service, repository, cache, events } = makeService();

    const dto = await service.updateProfile(
      'dp-1',
      { clinicName: 'Cabinet Les Berges', registrationNumber: null },
      admin,
    );

    expect(repository.update).toHaveBeenCalledWith('dp-1', {
      clinicName: 'Cabinet Les Berges',
      registrationNumber: null,
    });
    expect(dto.registrationNumber).toBeUndefined();
    expect(cache.del).toHaveBeenCalledWith(dpKey.byId('dp-1'));
    expect(cache.del).toHaveBeenCalledWith(dpKey.byUserId(owner.userId));
    expect(events.emit).toHaveBeenCalledWith(
      NotificationEvents.UserProfileChanged,
      {
        userId: owner.userId,
        dentistProfileId: 'dp-1',
        fields: ['clinicName', 'registrationNumber'],
        actorId: admin.userId,
      },
    );
  });

  it('a stranger is refused before anything is written or announced', async () => {
    const { service, repository, events } = makeService();
    await expect(
      service.updateProfile('dp-1', { clinicName: 'X' }, stranger),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('a creation announces the new profile, the admin as actor', async () => {
    const { service, events } = makeService();
    await service.createProfile(
      owner.userId,
      { clinicName: 'Cabinet', registrationNumber: 'CNOMDT-9' },
      admin.userId,
    );
    expect(events.emit).toHaveBeenCalledWith(
      NotificationEvents.UserProfileChanged,
      expect.objectContaining({
        userId: owner.userId,
        dentistProfileId: 'dp-new',
        fields: ['clinicName', 'registrationNumber'],
        actorId: admin.userId,
      }),
    );
  });

  it('the onboarding setup announces the clinic fields, not the schedule', async () => {
    const { service, events } = makeService();
    await service.setupClinic(owner.userId, {
      clinicName: 'Cabinet',
      clinicPhone: '+21671000000',
      workingHours: [
        {
          dayOfWeek: 'monday',
          openTime: '09:00',
          closeTime: '17:00',
          isClosed: false,
        },
      ],
    });
    expect(events.emit).toHaveBeenCalledWith(
      NotificationEvents.UserProfileChanged,
      {
        userId: owner.userId,
        dentistProfileId: 'dp-1',
        fields: ['clinicName', 'clinicPhone'],
        actorId: owner.userId,
      },
    );
  });

  it('a failing listener never fails the write', async () => {
    const { service, events } = makeService();
    events.emit.mockImplementation(() => {
      throw new Error('listener down');
    });
    await expect(
      service.updateProfile('dp-1', { clinicName: 'Cabinet' }, owner),
    ).resolves.toMatchObject({ id: 'dp-1' });
  });
});

describe('DentistProfileService.onUserProfileChanged', () => {
  it('drops the cached DTO of the user (both keys) without a read when the id is known', async () => {
    const { service, prisma, cache, store } = makeService();
    store.set(dpKey.byId('dp-1'), { userFullName: 'Old name' });
    store.set(dpKey.byUserId(owner.userId), { userFullName: 'Old name' });

    await service.onUserProfileChanged({
      userId: owner.userId,
      dentistProfileId: 'dp-1',
      fields: ['fullName'],
      actorId: owner.userId,
    });

    expect(prisma.dentistProfile.findUnique).not.toHaveBeenCalled();
    expect(cache.del).toHaveBeenCalledWith(dpKey.byId('dp-1'));
    expect(store.size).toBe(0);
  });

  it('looks the profile id up when the emitter did not know it', async () => {
    const { service, prisma, cache } = makeService();
    prisma.dentistProfile.findUnique.mockResolvedValue({ id: 'dp-1' });

    await service.onUserProfileChanged({
      userId: owner.userId,
      fields: ['avatarUrl'],
      actorId: owner.userId,
    });

    expect(prisma.dentistProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: owner.userId },
      select: { id: true },
    });
    expect(cache.del).toHaveBeenCalledWith(dpKey.byId('dp-1'));
    expect(cache.del).toHaveBeenCalledWith(dpKey.byUserId(owner.userId));
  });

  it('a user without a clinic only drops the user key', async () => {
    const { service, prisma, cache } = makeService();
    prisma.dentistProfile.findUnique.mockResolvedValue(null);

    await service.onUserProfileChanged({
      userId: admin.userId,
      fields: ['fullName'],
      actorId: admin.userId,
    });

    expect(cache.del).toHaveBeenCalledTimes(1);
    expect(cache.del).toHaveBeenCalledWith(dpKey.byUserId(admin.userId));
  });

  it('trusts an explicit null id (no profile): no lookup, the user key only', async () => {
    const { service, prisma, cache } = makeService();

    await service.onUserProfileChanged({
      userId: admin.userId,
      dentistProfileId: null,
      fields: ['fullName'],
      actorId: admin.userId,
    });

    expect(prisma.dentistProfile.findUnique).not.toHaveBeenCalled();
    expect(cache.del).toHaveBeenCalledTimes(1);
    expect(cache.del).toHaveBeenCalledWith(dpKey.byUserId(admin.userId));
  });

  it('swallows a failing lookup (the write already committed)', async () => {
    const { service, prisma } = makeService();
    prisma.dentistProfile.findUnique.mockRejectedValue(new Error('db down'));
    await expect(
      service.onUserProfileChanged({
        userId: owner.userId,
        fields: ['fullName'],
        actorId: owner.userId,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('DentistProfileService.createProfile — a clinic deleted earlier is restored', () => {
  it('restores the soft-deleted row with the sent fields (never a second insert, never a 500)', async () => {
    const { service, repository, cache, events } = makeService();
    const deleted = profileRow({ deletedAt: NOW });
    repository.findByUserId.mockResolvedValue(deleted);
    const restoreDeleted = jest.fn(
      (_userId: string, data: Record<string, unknown>) =>
        Promise.resolve(profileRow({ ...data, deletedAt: null })),
    );
    Object.assign(repository, { restoreDeleted });

    const dto = await service.createProfile(owner.userId, {
      clinicName: 'Cabinet Rouvert',
      city: null,
    });

    expect(restoreDeleted).toHaveBeenCalledWith(owner.userId, {
      clinicName: 'Cabinet Rouvert',
      city: null,
    });
    expect(repository.create).not.toHaveBeenCalled();
    expect(dto).toMatchObject({ id: 'dp-1', clinicName: 'Cabinet Rouvert' });
    expect(dto.city).toBeUndefined();
    expect(cache.del).toHaveBeenCalledWith(dpKey.byId('dp-1'));
    expect(cache.del).toHaveBeenCalledWith(dpKey.byUserId(owner.userId));
    expect(cache.del).toHaveBeenCalledWith(whKey.byProfile('dp-1'));
    expect(events.emit).toHaveBeenCalledWith(
      NotificationEvents.UserProfileChanged,
      expect.objectContaining({
        dentistProfileId: 'dp-1',
        fields: ['city', 'clinicName'],
      }),
    );
  });

  it('409 PROFILE_EXISTS while a live clinic exists; nothing written', async () => {
    const { service, repository } = makeService();
    repository.findByUserId.mockResolvedValue(profileRow());
    const restoreDeleted = jest.fn();
    Object.assign(repository, { restoreDeleted });

    await expect(
      service.createProfile(owner.userId, { clinicName: 'Cabinet' }),
    ).rejects.toMatchObject({ statusCode: 409, errorCode: 'PROFILE_EXISTS' });
    expect(restoreDeleted).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('409 PROFILE_EXISTS when a concurrent request restored it first', async () => {
    const { service, repository } = makeService();
    repository.findByUserId.mockResolvedValue(profileRow({ deletedAt: NOW }));
    Object.assign(repository, {
      restoreDeleted: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.createProfile(owner.userId, { clinicName: 'Cabinet' }),
    ).rejects.toMatchObject({ statusCode: 409, errorCode: 'PROFILE_EXISTS' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('no clinic at all: a plain insert', async () => {
    const { service, repository } = makeService();
    await expect(
      service.createProfile(owner.userId, { clinicName: 'Cabinet' }),
    ).resolves.toMatchObject({ id: 'dp-new' });
    expect(repository.create).toHaveBeenCalledWith({
      userId: owner.userId,
      clinicName: 'Cabinet',
    });
  });
});

describe('DentistProfileService.updateProfile — an emptied field is cleared', () => {
  it('hands the nulls to the repository (cleared) and leaves omitted fields out', async () => {
    const { service, repository } = makeService();

    const dto = await service.updateProfile(
      'dp-1',
      { clinicName: 'Cabinet Les Berges', clinicAddress: null, taxId: null },
      owner,
    );

    expect(repository.update).toHaveBeenCalledWith('dp-1', {
      clinicName: 'Cabinet Les Berges',
      clinicAddress: null,
      taxId: null,
    });
    expect(dto.clinicAddress).toBeUndefined();
    expect(dto.taxId).toBeUndefined();
    // Untouched columns keep their value.
    expect(dto.city).toBe('Tunis');
  });
});
