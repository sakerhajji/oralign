import { UserRole } from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import { OrderService } from './order.service';
import {
  DeletionBlockedException,
} from '../../common/deletion/deletion-blocked';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/app.exception';

jest.mock('./order-storage', () => ({
  purgeStoredMedia: jest.fn().mockResolvedValue(undefined),
  removeFileFromDisk: jest.fn().mockResolvedValue(undefined),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const storage = require('./order-storage') as {
  purgeStoredMedia: jest.Mock;
  removeFileFromDisk: jest.Mock;
};

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };

type Candidate = {
  id: string;
  orderCode: string;
  deletedAt: Date | null;
  treatmentFeeProofPath: string | null;
  files: { relativePath: string; variants: unknown }[];
  _count: { treatmentPlans: number; payments: number };
  quotation: { id: string } | null;
};

function makeService(candidates: Candidate[]) {
  const tx = {
    orderToothInstruction: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    uploadSession: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    orderFile: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    dentalOrder: { deleteMany: jest.fn().mockResolvedValue({ count: candidates.length }) },
  };
  const prisma = {
    dentalOrder: { findMany: jest.fn().mockResolvedValue(candidates) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;
  const service = new OrderService(
    prisma,
    {} as OrderAccessPolicy,
    { emit: jest.fn() } as unknown as EventEmitter2,
  );
  return { service, prisma, tx };
}

const archived = (over: Partial<Candidate> = {}): Candidate => ({
  id: 'o1',
  orderCode: 'ORD-1',
  deletedAt: new Date('2026-08-01'),
  treatmentFeeProofPath: null,
  files: [],
  _count: { treatmentPlans: 0, payments: 0 },
  quotation: null,
  ...over,
});

describe('OrderService permanent delete — deletion policy', () => {
  beforeEach(() => {
    storage.purgeStoredMedia.mockClear();
    storage.removeFileFromDisk.mockClear();
  });

  it('refuses non-admins before touching anything', async () => {
    const { service, prisma } = makeService([archived()]);
    await expect(service.permanentDeleteOrder('o1', doctor)).rejects.toThrow(ForbiddenException);
    expect(prisma.dentalOrder.findMany).not.toHaveBeenCalled();
  });

  it('404s for an unknown id', async () => {
    const { service } = makeService([]);
    await expect(service.permanentDeleteOrder('nope', admin)).rejects.toThrow(NotFoundException);
  });

  it('is trash-first: a LIVE order cannot be purged (400 NOT_ARCHIVED)', async () => {
    const { service, tx } = makeService([archived({ deletedAt: null })]);
    await expect(service.permanentDeleteOrder('o1', admin)).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'NOT_ARCHIVED',
    });
    expect(tx.dentalOrder.deleteMany).not.toHaveBeenCalled();
  });

  it.each([
    ['a quotation', { quotation: { id: 'q1' } }, 'quotation'],
    ['payments', { _count: { treatmentPlans: 0, payments: 2 } }, '2 payments'],
    ['treatment plans', { _count: { treatmentPlans: 1, payments: 0 } }, '1 treatment plans'],
  ])('is blocked with 409 DELETION_BLOCKED while %s exist(s)', async (_l, over, expectText) => {
    const { service, tx } = makeService([archived(over as Partial<Candidate>)]);
    let caught: unknown;
    try {
      await service.permanentDeleteOrder('o1', admin);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DeletionBlockedException);
    expect((caught as Error).message).toContain(expectText);
    expect(tx.dentalOrder.deleteMany).not.toHaveBeenCalled();
    expect(storage.purgeStoredMedia).not.toHaveBeenCalled();
  });

  it('purges an archived, history-free order: children first, then blobs + variants + proof', async () => {
    const { service, tx } = makeService([
      archived({
        treatmentFeeProofPath: 'treatment-fee-proofs/p.png',
        files: [
          { relativePath: 'orders/o1/x.jpg', variants: { thumb: { path: 'orders/o1/x__thumb.webp' } } },
          { relativePath: 'orders/o1/y.stl', variants: null },
        ],
      }),
    ]);
    await expect(service.permanentDeleteOrder('o1', admin)).resolves.toEqual({
      message: 'Order permanently deleted successfully',
    });
    // one transaction, children before the parent
    expect(tx.orderToothInstruction.deleteMany).toHaveBeenCalledWith({ where: { orderId: { in: ['o1'] } } });
    expect(tx.uploadSession.deleteMany).toHaveBeenCalledWith({ where: { orderId: { in: ['o1'] } } });
    expect(tx.orderFile.deleteMany).toHaveBeenCalledWith({ where: { orderId: { in: ['o1'] } } });
    expect(tx.dentalOrder.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['o1'] } } });
    // disk cleanup after commit
    expect(storage.purgeStoredMedia).toHaveBeenCalledTimes(2);
    expect(storage.purgeStoredMedia).toHaveBeenCalledWith('orders/o1/x.jpg', { thumb: { path: 'orders/o1/x__thumb.webp' } });
    expect(storage.removeFileFromDisk).toHaveBeenCalledWith('treatment-fee-proofs/p.png');
  });

  it('bulk: purges the eligible ones and reports blocked + skipped without throwing', async () => {
    const { service, tx } = makeService([
      archived({ id: 'ok1', orderCode: 'A' }),
      archived({ id: 'live', orderCode: 'B', deletedAt: null }),
      archived({ id: 'hist', orderCode: 'C', quotation: { id: 'q' } }),
    ]);
    const res = await service.bulkPermanentDeleteOrders(['ok1', 'live', 'hist', 'unknown'], admin);
    expect(res).toEqual({ deleted: 1, blocked: 2, skipped: 1 });
    expect(tx.dentalOrder.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['ok1'] } } });
  });

  it('bulk: an empty id list is a no-op', async () => {
    const { service, prisma } = makeService([]);
    await expect(service.bulkPermanentDeleteOrders([], admin)).resolves.toEqual({ deleted: 0, skipped: 0, blocked: 0 });
    expect(prisma.dentalOrder.findMany).not.toHaveBeenCalled();
  });
});
