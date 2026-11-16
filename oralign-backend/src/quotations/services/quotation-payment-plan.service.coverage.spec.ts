import { BatchStatus, OrderType, UserRole } from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import type { PackService } from '../../packs/services/pack.service';
import type { LoyaltyService } from '../../loyalty/services/loyalty.service';
import {
  firstHandOverAt,
  startCoverageWindow,
} from '../../orders/coverage-window';
import {
  COVERAGE_BACKFILL_CANDIDATES,
  QuotationPaymentPlanService,
} from './quotation-payment-plan.service';

// The window rule itself is covered by coverage-window.spec.ts; here only
// the wiring matters: who calls it, with which transaction and date.
jest.mock('../../orders/coverage-window', () => ({
  startCoverageWindow: jest.fn().mockResolvedValue(true),
  firstHandOverAt: jest.fn(),
}));
const startWindow = jest.mocked(startCoverageWindow);
const handOverOf = jest.mocked(firstHandOverAt);

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };

function makeService(prisma: Record<string, unknown>) {
  return new QuotationPaymentPlanService(
    prisma as unknown as PrismaService,
    {} as OrderAccessPolicy,
    {} as PackService,
    {} as LoyaltyService,
    { emit: jest.fn() } as unknown as EventEmitter2,
  );
}

beforeEach(() => {
  startWindow.mockClear();
  handOverOf.mockReset();
});

describe('QuotationPaymentPlanService.deliverBatch — coverage window', () => {
  it('starts the case window at the instant the batch is delivered', async () => {
    const tx = {
      quoteStepBatch: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'b-1',
          status: BatchStatus.unlocked,
          quotationId: 'q-1',
          quotation: {
            orderId: 'o-1',
            order: { doctorId: 'u-doc', orderCode: 'ORD-1' },
          },
        }),
        update: jest.fn(({ data }: { data: object }) =>
          Promise.resolve({ id: 'b-1', quotationId: 'q-1', ...data }),
        ),
        // Another batch is still to deliver: the order is not finished.
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = makeService({
      $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    });

    await service.deliverBatch('b-1', admin);

    const written = tx.quoteStepBatch.update.mock.calls[0][0] as {
      data: { deliveredAt: Date };
    };
    expect(startWindow).toHaveBeenCalledWith(
      tx,
      'o-1',
      written.data.deliveredAt,
    );
  });

  it('never restarts anything for a batch already delivered', async () => {
    const tx = {
      quoteStepBatch: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'b-1',
          status: BatchStatus.delivered,
          quotation: { orderId: 'o-1', order: {} },
        }),
      },
    };
    const service = makeService({
      $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    });

    await service.deliverBatch('b-1', admin);

    expect(startWindow).not.toHaveBeenCalled();
  });
});

describe('QuotationPaymentPlanService boot — coverage backfill', () => {
  /** findMany answers the status pass with nothing, the coverage pass with `ids`. */
  function bootWorld(ids: string[]) {
    const tx = { marker: 'tx' };
    const findMany = jest.fn((args: { where: { orderType?: OrderType } }) =>
      Promise.resolve(
        args.where.orderType === OrderType.initial
          ? ids.map((id) => ({ id }))
          : [],
      ),
    );
    const prisma = {
      dentalOrder: { findMany },
      $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    };
    return { service: makeService(prisma), findMany, tx };
  }

  it('starts each window at the case FIRST hand-over, cases only', async () => {
    const { service, findMany, tx } = bootWorld(['o-1', 'o-2']);
    const firstDelivery = new Date('2026-06-03T00:00:00.000Z');
    handOverOf.mockResolvedValueOnce(firstDelivery).mockResolvedValueOnce(null);

    await service.onApplicationBootstrap();

    const coveragePass = findMany.mock.calls
      .map(([args]) => args.where)
      .find((where) => where.orderType === OrderType.initial);
    expect(coveragePass).toMatchObject({
      orderType: OrderType.initial,
      deletedAt: null,
    });
    expect(handOverOf).toHaveBeenCalledWith(tx, 'o-1');
    expect(handOverOf).toHaveBeenCalledWith(tx, 'o-2');
    // o-2 has no recorded hand-over yet: nothing to start.
    expect(startWindow).toHaveBeenCalledTimes(1);
    expect(startWindow).toHaveBeenCalledWith(tx, 'o-1', firstDelivery);
  });

  it('visits only the cases it can change: no start yet, or a start whose expiry is now known', async () => {
    const { service, findMany } = bootWorld([]);

    await service.onApplicationBootstrap();

    const coveragePass = findMany.mock.calls
      .map(([args]) => args.where)
      .find((where) => where.orderType === OrderType.initial);
    expect(coveragePass).toBe(COVERAGE_BACKFILL_CANDIDATES);
    expect(COVERAGE_BACKFILL_CANDIDATES.AND).toContainEqual({
      OR: [
        { coverageStartedAt: null },
        {
          coverageExpiresAt: null,
          // An unknown validity would be re-read on every boot, for nothing.
          quotation: { deletedAt: null, treatmentValidityMonths: { gt: 0 } },
        },
      ],
    });
    expect(handOverOf).not.toHaveBeenCalled();
  });

  it('never blocks the boot when the backfill fails', async () => {
    const { service } = bootWorld(['o-1']);
    handOverOf.mockRejectedValueOnce(new Error('db down'));

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
