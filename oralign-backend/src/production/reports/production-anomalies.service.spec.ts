import {
  ArchTreatment,
  BatchStatus,
  OrderStatus,
  ProductionArch,
  ProductionEventOrigin,
  ProductionEventType,
  ProductionNoticeStatus,
} from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { NOTICE_MAX_ATTEMPTS } from '../production.constants';
import { PRODUCTION_ANOMALY } from '../production.contract';
import { productionHistoryWhere } from '../kernel';
import { ProductionAnomaliesService } from './production-anomalies.service';
import {
  DAY_3_END,
  DAY_3_START,
  tunisNov3,
} from './report-fixtures.helper-spec';

type Args = { where: Record<string, unknown>; select: Record<string, unknown> };

const PERIOD = { gte: DAY_3_START, lt: DAY_3_END };

function periodRow(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    orderId: 'o1',
    type: ProductionEventType.aligner_delivered,
    arch: ProductionArch.upper,
    stepFrom: 1,
    stepTo: 10,
    performedAt: tunisNov3('10:00'),
    warnings: [] as string[],
    cancelledAt: null as Date | null,
    order: { orderCode: 'ORD-001', patient: { fullName: 'Zoé Ben Salah' } },
    ...over,
  };
}

function orderRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    orderCode: `ORD-${id}`,
    status: OrderStatus.finished,
    coverageStartedAt: null as Date | null,
    archTreatment: ArchTreatment.upper,
    treatBothArch: false,
    totalAligners: null,
    treatmentPlans: [{ totalUpperAligners: 10, totalLowerAligners: null }],
    quotation: {
      maxStepsPerArch: null,
      isUnlimitedSteps: false,
      deletedAt: null as Date | null,
      stepBatches: [{ fromStep: 1, toStep: 10 }],
    },
    patient: { fullName: `Patient ${id}` },
    productionProgress: {
      printedUpper: 0,
      printedLower: 0,
      thermoformedUpper: 0,
      thermoformedLower: 0,
      cutUpper: 0,
      cutLower: 0,
      deliveredUpper: 6,
      deliveredLower: 0,
      firstActionAt: tunisNov3('08:00'),
      lastActionAt: tunisNov3('09:00'),
      updatedAt: tunisNov3('16:00'),
    },
    productionEvents: [
      {
        id: `${id}-live`,
        type: ProductionEventType.aligner_delivered,
        arch: ProductionArch.upper,
        stepFrom: 1,
        stepTo: 6,
        performedAt: tunisNov3('09:00'),
      },
    ],
    ...over,
  };
}

type FirstDelivery = { orderId: string; _min: { deliveredAt: Date | null } };

function makeService(
  events: unknown[],
  orders: unknown[],
  notices: unknown[] = [],
  options: {
    /** orderIds whose progress row has its lastActionAt in the period. */
    lastActions?: string[];
    firstDeliveries?: FirstDelivery[];
  } = {},
) {
  const eventFindMany = jest.fn((_args: Args) => Promise.resolve(events));
  const progressFindMany = jest.fn((_args: Args) =>
    Promise.resolve(
      (options.lastActions ?? []).map((orderId) => ({ orderId })),
    ),
  );
  const orderFindMany = jest.fn((_args: Args) => Promise.resolve(orders));
  const deliveryGroupBy = jest.fn((_args: Record<string, unknown>) =>
    Promise.resolve(options.firstDeliveries ?? []),
  );
  const noticeFindMany = jest.fn((_args: Args) => Promise.resolve(notices));
  const prisma = {
    productionEvent: { findMany: eventFindMany },
    productionProgress: { findMany: progressFindMany },
    dentalOrder: { findMany: orderFindMany },
    alignerDelivery: { groupBy: deliveryGroupBy },
    productionNotice: { findMany: noticeFindMany },
  } as unknown as PrismaService;
  const argsOf = (mock: jest.Mock) => (mock.mock.calls as [Args][])[0][0];
  const callCount = () =>
    [
      eventFindMany,
      progressFindMany,
      orderFindMany,
      deliveryGroupBy,
      noticeFindMany,
    ].reduce((sum, mock) => sum + mock.mock.calls.length, 0);
  return {
    service: new ProductionAnomaliesService(prisma),
    eventFindMany,
    progressFindMany,
    orderFindMany,
    deliveryGroupBy,
    noticeFindMany,
    argsOf,
    callCount,
  };
}

describe('ProductionAnomaliesService.detect', () => {
  it('five calls at most, whatever the number of cases: period rows, last actions, notices, then the touched cases and their first hand-over', async () => {
    const orders = Array.from({ length: 40 }, (_, index) =>
      orderRow(`o${index}`),
    );
    const events = orders.map((order) =>
      periodRow({ id: `${order.id}-e`, orderId: order.id }),
    );
    const mocks = makeService(events, orders, [], {
      lastActions: orders.map((order) => order.id),
    });

    await mocks.service.detect({ from: '2026-11-03', to: '2026-11-03' });

    expect(mocks.eventFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.progressFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.orderFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.deliveryGroupBy).toHaveBeenCalledTimes(1);
    expect(mocks.noticeFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.callCount()).toBeLessThanOrEqual(5);
  });

  it('nothing touched: no call for the cases nor their hand-overs', async () => {
    const mocks = makeService([], []);
    const result = await mocks.service.detect({
      from: '2026-11-03',
      to: '2026-11-03',
    });
    expect(mocks.orderFindMany).not.toHaveBeenCalled();
    expect(mocks.deliveryGroupBy).not.toHaveBeenCalled();
    expect(mocks.callCount()).toBe(3);
    expect(result.items).toEqual([]);
  });

  it('the touched cases are loaded by id: the union of the period rows and the last actions, each id once', async () => {
    const mocks = makeService(
      [
        periodRow({ id: 'e1', orderId: 'o1' }),
        periodRow({ id: 'e2', orderId: 'o1' }),
        periodRow({ id: 'e3', orderId: 'o2' }),
      ],
      [],
      [],
      { lastActions: ['o2', 'o3'] },
    );
    await mocks.service.detect({ from: '2026-11-03', to: '2026-11-03' });

    const where = mocks.argsOf(mocks.orderFindMany).where as {
      id: { in: string[] };
      deletedAt: null;
    };
    expect([...where.id.in].sort()).toEqual(['o1', 'o2', 'o3']);
    expect(where.deletedAt).toBeNull();
    expect(mocks.deliveryGroupBy).toHaveBeenCalledWith({
      by: ['orderId'],
      where: { orderId: { in: where.id.in } },
      _min: { deliveredAt: true },
    });
  });

  it('filters: declared rows of the period on live cases; last actions in the period on live cases produced through the module; notices ended without a send', async () => {
    const mocks = makeService([], []);
    await mocks.service.detect({ from: '2026-11-03', to: '2026-11-03' });

    expect(mocks.argsOf(mocks.eventFindMany).where).toEqual({
      performedAt: PERIOD,
      origin: ProductionEventOrigin.declared,
      order: { deletedAt: null },
    });
    // AND-only (no OR of relation filters): the lastActionAt index drives it.
    expect(mocks.argsOf(mocks.progressFindMany)).toEqual({
      where: {
        lastActionAt: PERIOD,
        order: { deletedAt: null, ...productionHistoryWhere() },
      },
      select: { orderId: true },
    });
    expect(mocks.argsOf(mocks.noticeFindMany).where).toEqual({
      updatedAt: PERIOD,
      order: { deletedAt: null },
      OR: [
        {
          status: ProductionNoticeStatus.failed,
          attempts: { gte: NOTICE_MAX_ATTEMPTS },
        },
        {
          status: ProductionNoticeStatus.skipped,
          skipReason: { in: ['not_configured', 'no_recipient'] },
        },
      ],
    });
  });

  it('the touched cases load only the live events and the production-delivered batches, never the hand-overs', async () => {
    const mocks = makeService([periodRow()], [orderRow('o1')]);
    await mocks.service.detect({ from: '2026-11-03', to: '2026-11-03' });
    const select = mocks.argsOf(mocks.orderFindMany).select as {
      productionEvents: { where: unknown };
      quotation: { select: { stepBatches: { where: unknown } } };
    };
    expect(select.productionEvents.where).toEqual({ cancelledAt: null });
    expect(select.quotation.select.stepBatches.where).toEqual({
      status: BatchStatus.delivered,
      deliveredByProduction: true,
    });
    // A nested take: 1 would load every hand-over of every case.
    expect(select).not.toHaveProperty('alignerDeliveries');
  });

  it('a case touched only by its last action still gets finished_incomplete and planned_total_unknown', async () => {
    const mocks = makeService(
      [],
      [
        orderRow('o1'),
        orderRow('o2', {
          status: OrderStatus.fabrication,
          treatmentPlans: [],
          quotation: null,
        }),
      ],
      [],
      { lastActions: ['o1', 'o2'] },
    );
    const result = await mocks.service.detect({
      from: '2026-11-03',
      to: '2026-11-03',
    });
    expect(result.countsByKind.finished_incomplete).toBe(1);
    expect(result.countsByKind.planned_total_unknown).toBe(1);
    expect(result.items.map((item) => [item.kind, item.orderId])).toEqual(
      expect.arrayContaining([
        [PRODUCTION_ANOMALY.finished_incomplete, 'o1'],
        [PRODUCTION_ANOMALY.planned_total_unknown, 'o2'],
      ]),
    );
  });

  describe('coverage started by a cancelled delivery, from the earliest hand-over', () => {
    // Coverage started at 10:00 on a delivery that was cancelled since; no
    // live delivery left before it.
    const cancelledStarter = periodRow({
      id: 'e-start',
      orderId: 'o1',
      performedAt: tunisNov3('09:30'),
      cancelledAt: tunisNov3('15:00'),
    });
    const coveredCase = () =>
      orderRow('o1', {
        status: OrderStatus.fabrication,
        coverageStartedAt: tunisNov3('10:00'),
        productionEvents: [],
      });

    async function coverageCount(firstDeliveries: FirstDelivery[]) {
      const mocks = makeService([cancelledStarter], [coveredCase()], [], {
        firstDeliveries,
      });
      const result = await mocks.service.detect({
        from: '2026-11-03',
        to: '2026-11-03',
      });
      return result.countsByKind.coverage_started_by_cancelled_delivery;
    }

    it('an AlignerDelivery handed over before the coverage start justifies it', async () => {
      expect(
        await coverageCount([
          {
            orderId: 'o1',
            _min: { deliveredAt: new Date('2026-11-01T00:00:00.000Z') },
          },
        ]),
      ).toBe(0);
    });

    it('the earliest one after the start, or none at all, does not', async () => {
      expect(
        await coverageCount([
          {
            orderId: 'o1',
            _min: { deliveredAt: new Date('2026-11-04T00:00:00.000Z') },
          },
        ]),
      ).toBe(1);
      expect(await coverageCount([])).toBe(1);
    });

    it('another case’s hand-over never counts', async () => {
      expect(
        await coverageCount([
          {
            orderId: 'o-other',
            _min: { deliveredAt: new Date('2026-11-01T00:00:00.000Z') },
          },
        ]),
      ).toBe(1);
    });
  });

  it('maps the loaded rows into the detection: a cancelled delivery, the batch it uncovered, a notice, a finished case short of steps', async () => {
    const cancelled = periodRow({
      id: 'e-cancel',
      orderId: 'o1',
      stepFrom: 7,
      stepTo: 10,
      cancelledAt: tunisNov3('15:00'),
    });
    const mocks = makeService(
      [cancelled],
      [orderRow('o1')],
      [
        {
          id: 'n1',
          orderId: 'o1',
          eventIds: ['e-cancel'],
          status: ProductionNoticeStatus.skipped,
          attempts: 0,
          skipReason: 'no_recipient',
          lastError: null,
          updatedAt: tunisNov3('11:00'),
          order: { orderCode: 'ORD-o1', patient: { fullName: 'Patient o1' } },
        },
      ],
    );

    const result = await mocks.service.detect({
      from: '2026-11-03',
      to: '2026-11-03',
    });

    expect(result.from).toBe('2026-11-03');
    expect(
      result.items.map((item) => [item.kind, item.steps, item.detail]),
    ).toEqual([
      [
        PRODUCTION_ANOMALY.cancelled_event,
        [{ from: 7, to: 10 }],
        ProductionEventType.aligner_delivered,
      ],
      [
        PRODUCTION_ANOMALY.batch_kept_after_cancel,
        [{ from: 7, to: 10 }],
        '1-10',
      ],
      [PRODUCTION_ANOMALY.notice_skipped, null, 'no_recipient'],
      // Finished with 6 of 10 delivered, last action (09:00) in the period.
      [PRODUCTION_ANOMALY.finished_incomplete, [{ from: 7, to: 10 }], null],
    ]);
    expect(result.countsByKind.planned_total_unknown).toBe(0);
  });

  it('an archived quotation has no batch to keep', async () => {
    const mocks = makeService(
      [periodRow({ stepFrom: 7, stepTo: 10, cancelledAt: tunisNov3('15:00') })],
      [
        orderRow('o1', {
          quotation: {
            maxStepsPerArch: null,
            isUnlimitedSteps: false,
            deletedAt: tunisNov3('12:00'),
            stepBatches: [{ fromStep: 1, toStep: 10 }],
          },
        }),
      ],
    );
    const result = await mocks.service.detect({
      from: '2026-11-03',
      to: '2026-11-03',
    });
    expect(result.countsByKind.batch_kept_after_cancel).toBe(0);
  });
});
