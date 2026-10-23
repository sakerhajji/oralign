import { UserRole } from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Cache } from 'cache-manager';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import type { CreateOrderDto } from '../dto/order.dto';
import type { OrderAuditService } from './order-audit.service';
import { OrderService } from './order.service';

jest.mock('./order-storage', () => ({
  purgeStoredMedia: jest.fn(),
  removeFileFromDisk: jest.fn(),
  purgeOrderDirectory: jest.fn(),
}));
// The mapper needs every relation of a real row; identity is enough here.
jest.mock('./order.mapper', () => ({
  orderInclude: {},
  mapOrderToDto: (order: unknown) => order,
}));

const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };
const dto = { patientId: 'p-1' } as CreateOrderDto;

type CacheMock = { get: jest.Mock; set: jest.Mock };

function makeService(cache?: CacheMock) {
  const create = jest
    .fn()
    .mockResolvedValue({ id: 'o-new', doctorId: 'u-doc' });
  const findFirst = jest.fn().mockResolvedValue(null);
  const auditLogCreate = jest.fn();
  // The draft and its "created" audit row are written in one transaction.
  const tx = {
    dentalOrder: { create, findFirst },
    orderAuditLog: { create: auditLogCreate },
  };
  const prisma = {
    ...tx,
    $transaction: (run: (client: typeof tx) => unknown) => run(tx),
  } as unknown as PrismaService;
  const service = new OrderService(
    prisma,
    {} as OrderAccessPolicy,
    { emit: jest.fn() } as unknown as EventEmitter2,
    {
      entry: jest.fn().mockResolvedValue({ action: 'created' }),
    } as unknown as OrderAuditService,
    cache as unknown as Cache | undefined,
  );
  // The checks that need a database are not what is under test.
  const internals = service as unknown as Record<string, jest.Mock>;
  jest.spyOn(internals, 'ensureDentistExists').mockResolvedValue(undefined);
  jest
    .spyOn(internals, 'ensurePatientBelongsToDoctor')
    .mockResolvedValue(undefined);
  jest.spyOn(internals, 'generateOrderCode').mockResolvedValue('ORD-1');
  return { service, create, findFirst, auditLogCreate };
}

describe('OrderService.createOrder idempotency', () => {
  it('remembers the order a key created, scoped to the caller', async () => {
    const cache: CacheMock = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn(),
    };
    const { service, create } = makeService(cache);

    const created = await service.createOrder(dto, doctor, 'key-abcdefgh');

    expect(create).toHaveBeenCalledTimes(1);
    expect(created).toMatchObject({ id: 'o-new' });
    expect(cache.set).toHaveBeenCalledWith(
      'orders:create:u-doc:key-abcdefgh',
      'o-new',
      15 * 60_000,
    );
  });

  it('returns the existing draft on a replay instead of creating a twin', async () => {
    const cache: CacheMock = {
      get: jest.fn().mockResolvedValue('o-first'),
      set: jest.fn(),
    };
    const { service, create, findFirst, auditLogCreate } = makeService(cache);
    findFirst.mockResolvedValue({ id: 'o-first', doctorId: 'u-doc' });

    const replayed = await service.createOrder(dto, doctor, 'key-abcdefgh');

    expect(replayed).toMatchObject({ id: 'o-first' });
    expect(create).not.toHaveBeenCalled();
    // A replay is not a second creation: no second "created" history row.
    expect(auditLogCreate).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o-first', doctorId: 'u-doc', deletedAt: null },
      }),
    );
  });

  it('creates normally when the remembered draft no longer exists', async () => {
    const cache: CacheMock = {
      get: jest.fn().mockResolvedValue('o-gone'),
      set: jest.fn(),
    };
    const { service, create } = makeService(cache);

    await service.createOrder(dto, doctor, 'key-abcdefgh');

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('ignores a malformed key and never touches the cache', async () => {
    const cache: CacheMock = { get: jest.fn(), set: jest.fn() };
    const { service, create } = makeService(cache);

    await service.createOrder(dto, doctor, 'not a key!');

    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('still creates when the cache is unreachable', async () => {
    const cache: CacheMock = {
      get: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const { service, create } = makeService(cache);

    await expect(
      service.createOrder(dto, doctor, 'key-abcdefgh'),
    ).resolves.toMatchObject({ id: 'o-new' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('works without any cache wired at all', async () => {
    const { service, create } = makeService(undefined);

    await service.createOrder(dto, doctor, 'key-abcdefgh');

    expect(create).toHaveBeenCalledTimes(1);
  });
});
