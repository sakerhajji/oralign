import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, UserRole } from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { PrismaService } from '../../prisma/prisma.service';
import { ALIGNER_DELIVERY_ERROR } from '../aligner-delivery.rules';
import { AlignerDeliveryService } from './aligner-delivery.service';

const owner: Caller = { userId: 'u-doc', role: UserRole.dentist };
const otherDentist: Caller = { userId: 'u-other', role: UserRole.dentist };
const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const designer: Caller = { userId: 'u-designer', role: UserRole.designer };

const NOW = new Date('2026-09-21T10:00:00.000Z');

type Row = {
  id: string;
  orderId: string;
  fromAligner: number;
  toAligner: number;
  quantity: number;
  deliveredAt: Date;
  createdById: string | null;
  createdByName: string | null;
  createdAt: Date;
};

/**
 * In-memory stand-in for the two tables involved, so consecutive calls
 * build real history (1 → 3, then 4 → 7) and the summary is computed
 * from what was actually "persisted". The REAL OrderAccessPolicy runs on
 * top of it — the authorization rule under test is the production one.
 */
function makeWorld(
  over: Partial<{
    status: OrderStatus;
    totalAligners: number | null;
    deletedAt: Date | null;
    rows: Row[];
  }> = {},
) {
  const order = {
    id: 'o1',
    orderCode: 'ORD-1',
    doctorId: owner.userId,
    assignedDesignerId: designer.userId,
    status: over.status ?? OrderStatus.fabrication,
    totalAligners: over.totalAligners ?? null,
    deletedAt: over.deletedAt ?? null,
    createdAt: new Date('2026-09-01T08:00:00.000Z'),
  };
  const rows: Row[] = [...(over.rows ?? [])];

  const findDeliveries = jest.fn(() =>
    Promise.resolve(
      [...rows].sort(
        (a, b) =>
          a.deliveredAt.getTime() - b.deliveredAt.getTime() ||
          a.fromAligner - b.fromAligner,
      ),
    ),
  );
  const create = jest.fn(
    ({ data }: { data: Omit<Row, 'id' | 'createdAt'> }) => {
      const row = { ...data, id: `d${rows.length + 1}`, createdAt: NOW };
      rows.push(row);
      return Promise.resolve(row);
    },
  );
  const updateOrder = jest.fn(
    ({ data }: { data: { totalAligners: number } }) => {
      Object.assign(order, data);
      return Promise.resolve(order);
    },
  );
  const lock = jest.fn().mockResolvedValue([{ id: order.id }]);

  const tx = {
    $queryRaw: lock,
    dentalOrder: {
      findUnique: jest.fn(() => Promise.resolve({ ...order })),
      update: updateOrder,
    },
    alignerDelivery: { findMany: findDeliveries, create },
    user: {
      findUnique: jest.fn(() => Promise.resolve({ fullName: 'Dr Hajji' })),
    },
  };
  const prisma = {
    dentalOrder: { findUnique: jest.fn(() => Promise.resolve({ ...order })) },
    alignerDelivery: { findMany: findDeliveries },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  } as unknown as PrismaService;

  const service = new AlignerDeliveryService(
    prisma,
    new OrderAccessPolicy(prisma),
  );
  return { service, order, rows, create, updateOrder, lock, prisma };
}

const persisted = (
  fromAligner: number,
  toAligner: number,
  on: string,
): Row => ({
  id: `seed-${fromAligner}`,
  orderId: 'o1',
  fromAligner,
  toAligner,
  quantity: toAligner - fromAligner + 1,
  deliveredAt: new Date(`${on}T00:00:00.000Z`),
  createdById: owner.userId,
  createdByName: 'Dr Hajji',
  createdAt: NOW,
});

describe('AlignerDeliveryService', () => {
  describe('recording deliveries', () => {
    it('records a first delivery 1 → 3 and stores the series size with it', async () => {
      const { service, create, updateOrder, lock } = makeWorld();

      const summary = await service.record(
        'o1',
        {
          fromAligner: 1,
          toAligner: 3,
          deliveredAt: '2026-09-07',
          totalAligners: 20,
        },
        owner,
        NOW,
      );

      expect(lock).toHaveBeenCalledTimes(1);
      expect(updateOrder).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { totalAligners: 20 },
      });
      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0][0].data).toMatchObject({
        orderId: 'o1',
        fromAligner: 1,
        toAligner: 3,
        quantity: 3,
        deliveredAt: new Date('2026-09-07T00:00:00.000Z'),
        createdById: owner.userId,
        createdByName: 'Dr Hajji',
      });
      expect(summary).toMatchObject({
        totalAligners: 20,
        deliveredCount: 3,
        remainingCount: 17,
        deliveredRanges: [{ fromAligner: 1, toAligner: 3 }],
        nextAligner: 4,
        isComplete: false,
      });
    });

    it('records a second valid delivery 4 → 7: history keeps both, total is 7 / 20', async () => {
      const { service, updateOrder } = makeWorld();
      await service.record(
        'o1',
        {
          fromAligner: 1,
          toAligner: 3,
          deliveredAt: '2026-09-07',
          totalAligners: 20,
        },
        owner,
        NOW,
      );

      const summary = await service.record(
        'o1',
        { fromAligner: 4, toAligner: 7, deliveredAt: '2026-09-20' },
        owner,
        NOW,
      );

      // The series was stored once, on the first delivery only.
      expect(updateOrder).toHaveBeenCalledTimes(1);
      expect(summary.deliveries).toMatchObject([
        {
          fromAligner: 1,
          toAligner: 3,
          quantity: 3,
          deliveredAt: '2026-09-07',
        },
        {
          fromAligner: 4,
          toAligner: 7,
          quantity: 4,
          deliveredAt: '2026-09-20',
        },
      ]);
      expect(summary).toMatchObject({
        deliveredCount: 7,
        remainingCount: 13,
        deliveredRanges: [{ fromAligner: 1, toAligner: 7 }],
        nextAligner: 8,
      });
    });

    it('rejects an overlapping delivery 2 → 5 after 1 → 3 (409) and writes nothing', async () => {
      const { service, create } = makeWorld({
        totalAligners: 20,
        rows: [persisted(1, 3, '2026-09-07')],
      });

      await expect(
        service.record('o1', { fromAligner: 2, toAligner: 5 }, owner, NOW),
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: ALIGNER_DELIVERY_ERROR.OVERLAP,
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate delivery of the same range (409) and writes nothing', async () => {
      const { service, create } = makeWorld({
        totalAligners: 20,
        rows: [persisted(1, 3, '2026-09-07')],
      });

      await expect(
        service.record('o1', { fromAligner: 1, toAligner: 3 }, owner, NOW),
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: ALIGNER_DELIVERY_ERROR.DUPLICATE,
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a range outside the series (18 → 21 of 20) with 400', async () => {
      const { service, create } = makeWorld({ totalAligners: 20 });

      await expect(
        service.record('o1', { fromAligner: 18, toAligner: 21 }, owner, NOW),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: ALIGNER_DELIVERY_ERROR.RANGE_OUT_OF_BOUNDS,
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects from > to with 400 before taking any lock', async () => {
      const { service, lock, create } = makeWorld({ totalAligners: 20 });

      await expect(
        service.record('o1', { fromAligner: 7, toAligner: 4 }, owner, NOW),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: ALIGNER_DELIVERY_ERROR.RANGE_INVALID,
      });
      expect(lock).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it('requires the series size on the first delivery', async () => {
      const { service, create } = makeWorld();

      await expect(
        service.record('o1', { fromAligner: 1, toAligner: 3 }, owner, NOW),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: ALIGNER_DELIVERY_ERROR.TOTAL_REQUIRED,
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('refuses a delivery request that tries to change an existing series size', async () => {
      const { service, updateOrder } = makeWorld({ totalAligners: 20 });

      await expect(
        service.record(
          'o1',
          { fromAligner: 1, toAligner: 3, totalAligners: 24 },
          owner,
          NOW,
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: ALIGNER_DELIVERY_ERROR.TOTAL_ALREADY_SET,
      });
      expect(updateOrder).not.toHaveBeenCalled();
    });

    it('rejects a delivery dated in the future', async () => {
      const { service, lock } = makeWorld({ totalAligners: 20 });

      await expect(
        service.record(
          'o1',
          { fromAligner: 1, toAligner: 3, deliveredAt: '2027-01-01' },
          owner,
          NOW,
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: ALIGNER_DELIVERY_ERROR.DATE_IN_FUTURE,
      });
      expect(lock).not.toHaveBeenCalled();
    });

    it('refuses deliveries on a draft order', async () => {
      const { service, create } = makeWorld({
        status: OrderStatus.draft,
        totalAligners: 20,
      });

      await expect(
        service.record('o1', { fromAligner: 1, toAligner: 3 }, owner, NOW),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: ALIGNER_DELIVERY_ERROR.ORDER_NOT_DELIVERABLE,
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('refuses a delivery dated before the order was created', async () => {
      const { service, create } = makeWorld({ totalAligners: 20 });

      await expect(
        service.record(
          'o1',
          { fromAligner: 1, toAligner: 3, deliveredAt: '2026-08-15' },
          owner,
          NOW,
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: ALIGNER_DELIVERY_ERROR.DATE_BEFORE_ORDER,
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('accepts an explicit null total on a later delivery (same as omitted)', async () => {
      const { service, create } = makeWorld({
        totalAligners: 20,
        rows: [persisted(1, 3, '2026-09-07')],
      });
      const summary = await service.record(
        'o1',
        {
          fromAligner: 4,
          toAligner: 7,
          totalAligners: null as unknown as undefined,
        },
        owner,
        NOW,
      );
      expect(create).toHaveBeenCalledTimes(1);
      expect(summary.deliveredCount).toBe(7);
    });

    it('maps a unique-index race (P2002) to a 409 duplicate', async () => {
      const { service, create } = makeWorld({ totalAligners: 20 });
      create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.record('o1', { fromAligner: 1, toAligner: 3 }, owner, NOW),
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: ALIGNER_DELIVERY_ERROR.DUPLICATE,
      });
    });
  });

  describe('authorization', () => {
    it('lets an admin record a delivery on any order', async () => {
      const { service, create } = makeWorld({ totalAligners: 20 });
      await service.record('o1', { fromAligner: 1, toAligner: 3 }, admin, NOW);
      expect(create).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['another dentist', otherDentist],
      ['the assigned designer', designer],
    ])(
      'forbids %s from recording (403) without locking the order',
      async (_label, caller) => {
        const { service, lock, create } = makeWorld({ totalAligners: 20 });

        await expect(
          service.record('o1', { fromAligner: 1, toAligner: 3 }, caller, NOW),
        ).rejects.toThrow(ForbiddenException);
        expect(lock).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
      },
    );

    it('lets the assigned designer READ the history, but tells them they cannot record', async () => {
      const { service } = makeWorld({
        totalAligners: 20,
        rows: [persisted(1, 3, '2026-09-07')],
      });
      const summary = await service.getSummary('o1', designer);
      expect(summary).toMatchObject({ deliveredCount: 3, canRecord: false });
    });

    it('returns 404 for a soft-deleted order', async () => {
      const { service } = makeWorld({ deletedAt: new Date('2026-09-01') });
      await expect(service.getSummary('o1', admin)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('orders without delivery history', () => {
    it('summarises an order that never had a delivery (existing orders keep working)', async () => {
      const { service } = makeWorld();

      const summary = await service.getSummary('o1', owner);

      expect(summary).toEqual({
        orderId: 'o1',
        totalAligners: null,
        deliveredCount: 0,
        remainingCount: null,
        deliveredRanges: [],
        nextAligner: 1,
        isComplete: false,
        earliestDeliveryDate: '2026-08-31',
        acceptsDeliveries: true,
        canRecord: true,
        deliveries: [],
      });
    });

    it('reports a finished series as complete', async () => {
      const { service } = makeWorld({
        totalAligners: 7,
        rows: [persisted(1, 3, '2026-09-07'), persisted(4, 7, '2026-09-20')],
      });
      const summary = await service.getSummary('o1', owner);
      expect(summary).toMatchObject({
        deliveredCount: 7,
        remainingCount: 0,
        nextAligner: null,
        isComplete: true,
      });
    });
  });

  describe('correcting the series size', () => {
    it('updates the total when it still covers every delivered aligner', async () => {
      const { service, updateOrder } = makeWorld({
        totalAligners: 20,
        rows: [persisted(1, 7, '2026-09-07')],
      });
      const summary = await service.setTotal(
        'o1',
        { totalAligners: 24 },
        owner,
      );
      expect(updateOrder).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { totalAligners: 24 },
      });
      expect(summary).toMatchObject({ totalAligners: 24, remainingCount: 17 });
    });

    it('refuses a total below the highest delivered aligner', async () => {
      const { service, updateOrder } = makeWorld({
        totalAligners: 20,
        rows: [persisted(1, 7, '2026-09-07')],
      });
      await expect(
        service.setTotal('o1', { totalAligners: 6 }, owner),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: ALIGNER_DELIVERY_ERROR.TOTAL_BELOW_DELIVERED,
      });
      expect(updateOrder).not.toHaveBeenCalled();
    });
  });
});
