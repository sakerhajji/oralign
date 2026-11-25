import { BatchStatus, OrderStatus, OrderType, UserRole } from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import type { PackService } from '../../packs/services/pack.service';
import type { LoyaltyService } from '../../loyalty/services/loyalty.service';
import { NotificationEvents } from '../../notifications/events/notification-events';
import type { ProductionEventsService } from '../../production/production-events.service';
import { PRODUCTION_ERROR } from '../../production/production.contract';
import type { CompanyBillingSettingsService } from './company-billing-settings.service';
import type { QuotationPdfService } from './quotation-pdf.service';
import {
  firstHandOverAt,
  startCoverageWindow,
} from '../../orders/coverage-window';
import {
  COVERAGE_BACKFILL_CANDIDATES,
  QuotationPaymentPlanService,
} from './quotation-payment-plan.service';

// The PDF renderer pulls in puppeteer (ESM-only); nothing here renders.
jest.mock('./quotation-pdf.service', () => ({
  QuotationPdfService: class QuotationPdfService {},
}));

// The window rule itself is covered by coverage-window.spec.ts; here only
// the wiring matters: who calls it, with which transaction and date. The
// pure coverageWindowPatch stays real (the unlimited-pack delivery uses it).
jest.mock('../../orders/coverage-window', () => ({
  coverageWindowPatch: jest.requireActual<
    typeof import('../../orders/coverage-window')
  >('../../orders/coverage-window').coverageWindowPatch,
  startCoverageWindow: jest.fn().mockResolvedValue(true),
  firstHandOverAt: jest.fn(),
}));
const startWindow = jest.mocked(startCoverageWindow);
const handOverOf = jest.mocked(firstHandOverAt);

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };

function makeService(
  prisma: Record<string, unknown>,
  production: Partial<ProductionEventsService> = {},
  events: { emit: jest.Mock } = { emit: jest.fn() },
) {
  return new QuotationPaymentPlanService(
    prisma as unknown as PrismaService,
    // The real policy: the placeholder delivery passes the production gate.
    new OrderAccessPolicy({} as PrismaService),
    {} as PackService,
    {} as LoyaltyService,
    production as ProductionEventsService,
    events as unknown as EventEmitter2,
    {} as CompanyBillingSettingsService,
    {} as QuotationPdfService,
  );
}

beforeEach(() => {
  startWindow.mockClear();
  handOverOf.mockReset();
});

describe('QuotationPaymentPlanService.deliverBatch — through the production delivery path', () => {
  /** The path's quotation, the order lock, the batch, the production core and the re-read row. */
  function deliverWorld(
    status: BatchStatus,
    {
      quotationId = 'q-1',
      unlimited = false,
      otherBatches = [] as { id: string; status: BatchStatus }[],
      coverageStartedAt = null as Date | null,
      coverageExpiresAt = null as Date | null,
      orderStatus = OrderStatus.fabrication as OrderStatus,
      orderDeletedAt = null as Date | null,
      quoteDeletedAt = null as Date | null,
    } = {},
  ) {
    const row = {
      id: 'b-1',
      quotationId,
      batchNumber: 2,
      fromStep: 6,
      toStep: 10,
      status,
    };
    const calls: string[] = [];
    const tx = {
      $queryRaw: jest.fn(() => {
        calls.push('lock');
        return Promise.resolve([]);
      }),
      quotation: {
        findUnique: jest.fn(() => {
          calls.push('quotation');
          return Promise.resolve({
            orderId: 'o-1',
            deletedAt: quoteDeletedAt,
            isUnlimitedSteps: unlimited,
          });
        }),
      },
      quoteStepBatch: {
        findUnique: jest.fn(() => {
          calls.push('batch');
          return Promise.resolve(row);
        }),
        findUniqueOrThrow: jest.fn(() => {
          calls.push('batch re-read');
          return Promise.resolve({ ...row, status: BatchStatus.delivered });
        }),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...row, ...data }),
        ),
      },
      dentalOrder: {
        findUnique: jest.fn().mockResolvedValue({
          status: orderStatus,
          deletedAt: orderDeletedAt,
          orderType: OrderType.initial,
          coverageStartedAt,
          coverageExpiresAt,
          orderCode: 'ORD-1',
          doctorId: 'u-doc',
          doctor: { fullName: 'Dr Salma' },
          patient: { fullName: 'Ines' },
          quotation: {
            treatmentValidityMonths: 12,
            stepBatches: [{ id: 'b-1', status }, ...otherBatches],
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: 'o-1' }),
      },
    };
    const declareBatchDelivery = jest.fn(() => {
      calls.push('declare');
      return Promise.resolve();
    });
    const events = {
      emit: jest.fn(() => {
        calls.push('emit');
        return true;
      }),
    };
    const service = makeService(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin' }),
        },
        $transaction: jest.fn(async (run: (client: typeof tx) => unknown) => {
          const result = await run(tx);
          calls.push('commit');
          return result;
        }),
      },
      { declareBatchDelivery },
      events,
    );
    return { service, tx, declareBatchDelivery, events, calls };
  }

  it('a limited pack: the production delivery of the batch, under the order lock, no legacy notice', async () => {
    const { service, tx, declareBatchDelivery, events, calls } = deliverWorld(
      BatchStatus.unlocked,
    );

    const result = await service.deliverBatch('q-1', 'b-1', admin);

    // The path's quotation names the order (one statement, no batch read
    // before the lock), ONE lock, the batch under it, the core, the row.
    expect(calls).toEqual([
      'quotation',
      'lock',
      'batch',
      'declare',
      'batch re-read',
      'commit',
    ]);
    expect(tx.quotation.findUnique).toHaveBeenCalledWith({
      where: { id: 'q-1' },
      select: { orderId: true, deletedAt: true, isUnlimitedSteps: true },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(declareBatchDelivery).toHaveBeenCalledWith(
      tx,
      {
        orderId: 'o-1',
        batch: expect.objectContaining({
          id: 'b-1',
          batchNumber: 2,
          fromStep: 6,
          toStep: 10,
        }) as unknown,
      },
      admin,
      { actorName: 'Admin', now: expect.any(Date) as unknown },
    );
    // The coverage window and the finish are the projection's now.
    expect(startWindow).not.toHaveBeenCalled();
    expect(tx.quoteStepBatch.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'b-1', status: BatchStatus.delivered });
  });

  it('never re-declares a batch already delivered (a double click pings nobody)', async () => {
    for (const unlimited of [false, true]) {
      const { service, declareBatchDelivery, tx, events } = deliverWorld(
        BatchStatus.delivered,
        { unlimited },
      );

      const result = await service.deliverBatch('q-1', 'b-1', admin);

      expect(declareBatchDelivery).not.toHaveBeenCalled();
      expect(tx.quoteStepBatch.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        id: 'b-1',
        status: BatchStatus.delivered,
      });
    }
  });

  it('keeps refusing a locked batch with the 400 of before', async () => {
    const { service, declareBatchDelivery } = deliverWorld(BatchStatus.locked);

    await expect(
      service.deliverBatch('q-1', 'b-1', admin),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(declareBatchDelivery).not.toHaveBeenCalled();
  });

  it('404s a batch of another quotation than the one in the path, writing nothing', async () => {
    const { service, tx, declareBatchDelivery, events } = deliverWorld(
      BatchStatus.unlocked,
      { quotationId: 'q-other' },
    );

    await expect(
      service.deliverBatch('q-1', 'b-1', admin),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(declareBatchDelivery).not.toHaveBeenCalled();
    expect(tx.quoteStepBatch.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('404s on an archived quotation, before the lock', async () => {
    const { service, tx, declareBatchDelivery } = deliverWorld(
      BatchStatus.unlocked,
      { quoteDeletedAt: new Date('2026-11-01T00:00:00.000Z') },
    );

    await expect(
      service.deliverBatch('q-1', 'b-1', admin),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.quoteStepBatch.findUnique).not.toHaveBeenCalled();
    expect(declareBatchDelivery).not.toHaveBeenCalled();
  });

  describe('an unlimited-step pack: its batch is a payment placeholder (CONC-01)', () => {
    it('flips that one batch itself, starts the coverage, finishes the case and tells the practitioner after the commit', async () => {
      const { service, tx, declareBatchDelivery, events, calls } = deliverWorld(
        BatchStatus.unlocked,
        {
          unlimited: true,
          otherBatches: [{ id: 'b-0', status: BatchStatus.delivered }],
        },
      );

      const result = await service.deliverBatch('q-1', 'b-1', admin);

      // Nothing is declared to the lab: the range [6,10] means no aligner.
      expect(declareBatchDelivery).not.toHaveBeenCalled();
      expect(tx.quoteStepBatch.update).toHaveBeenCalledWith({
        where: { id: 'b-1', status: BatchStatus.unlocked },
        data: {
          status: BatchStatus.delivered,
          deliveredAt: expect.any(Date) as unknown,
          deliveredById: 'u-admin',
          deliveredByProduction: false,
        },
      });
      const { deliveredAt } = (
        tx.quoteStepBatch.update.mock.calls[0] as unknown as [
          { data: { deliveredAt: Date } },
        ]
      )[0].data;
      // The coverage compare-and-set on the state read under the lock.
      expect(tx.dentalOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'o-1', coverageStartedAt: null, coverageExpiresAt: null },
        data: expect.objectContaining({
          coverageStartedAt: deliveredAt,
        }) as unknown,
      });
      expect(tx.dentalOrder.update).toHaveBeenCalledWith({
        where: { id: 'o-1' },
        data: { status: OrderStatus.finished },
        select: { id: true },
      });
      expect(events.emit).toHaveBeenCalledWith(
        NotificationEvents.BatchDelivered,
        {
          batchId: 'b-1',
          quotationId: 'q-1',
          orderId: 'o-1',
          orderCode: 'ORD-1',
          doctorId: 'u-doc',
          doctorName: 'Dr Salma',
          patientName: 'Ines',
          fromStep: 6,
          toStep: 10,
          batchNumber: 2,
        },
      );
      expect(calls).toEqual(['quotation', 'lock', 'batch', 'commit', 'emit']);
      expect(result).toMatchObject({
        id: 'b-1',
        status: BatchStatus.delivered,
      });
    });

    it.each([
      ['cancelled', { orderStatus: OrderStatus.cancelled }, 409],
      ['rejected', { orderStatus: OrderStatus.rejected }, 409],
      ['draft', { orderStatus: OrderStatus.draft }, 409],
      [
        'archived',
        { orderDeletedAt: new Date('2026-11-01T00:00:00.000Z') },
        404,
      ],
    ] as const)(
      'refuses a %s case like a production delivery: nothing flipped, finished or notified',
      async (_label, order, status) => {
        const { service, tx, events } = deliverWorld(BatchStatus.unlocked, {
          unlimited: true,
          ...order,
        });

        const failure = service.deliverBatch('q-1', 'b-1', admin);

        // The policy's Nest exceptions: the filter forwards `error` as errorCode.
        await expect(failure).rejects.toMatchObject(
          status === 409
            ? {
                status,
                response: expect.objectContaining({
                  error: PRODUCTION_ERROR.ORDER_NOT_IN_PRODUCTION,
                }) as unknown,
              }
            : { status },
        );
        expect(tx.quoteStepBatch.update).not.toHaveBeenCalled();
        expect(tx.dentalOrder.updateMany).not.toHaveBeenCalled();
        expect(tx.dentalOrder.update).not.toHaveBeenCalled();
        expect(events.emit).not.toHaveBeenCalled();
      },
    );

    it('still delivers on a finished case (an admin may declare on one)', async () => {
      const { service, tx, events } = deliverWorld(BatchStatus.unlocked, {
        unlimited: true,
        orderStatus: OrderStatus.finished,
      });

      await service.deliverBatch('q-1', 'b-1', admin);

      expect(tx.quoteStepBatch.update).toHaveBeenCalledTimes(1);
      // Already finished: no second status write.
      expect(tx.dentalOrder.update).not.toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledTimes(1);
    });

    it('leaves the case open while a batch is undelivered, and never moves a started window', async () => {
      const started = new Date('2026-06-01T00:00:00.000Z');
      const { service, tx, events } = deliverWorld(BatchStatus.unlocked, {
        unlimited: true,
        otherBatches: [{ id: 'b-3', status: BatchStatus.locked }],
        coverageStartedAt: started,
        coverageExpiresAt: new Date('2027-06-01T00:00:00.000Z'),
      });

      await service.deliverBatch('q-1', 'b-1', admin);

      expect(tx.quoteStepBatch.update).toHaveBeenCalledTimes(1);
      expect(tx.dentalOrder.updateMany).not.toHaveBeenCalled();
      expect(tx.dentalOrder.update).not.toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledTimes(1);
    });
  });

  it('is admin only', async () => {
    const { service } = deliverWorld(BatchStatus.unlocked);
    await expect(
      service.deliverBatch('q-1', 'b-1', {
        userId: 'u-doc',
        role: UserRole.dentist,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
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
