import {
  ArchTreatment,
  BatchStatus,
  OrderStatus,
  OrderType,
  Prisma,
} from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { ProductionProgressStateParam } from '../dto';
import {
  productionDoneWhere,
  productionQueueWhere,
  RELEASED_BATCH_STATUSES,
} from '../kernel';
import { ProductionProgressReportService } from './production-progress.service';
import {
  PROGRESS_ORDER_BY,
  PROGRESS_ROW_SELECT,
  progressRowOf,
  progressStateWhere,
  progressWhere,
  productionSearchWhere,
  type ProgressOrderRow,
} from './production-progress.view';

const NOW = new Date('2026-11-03T09:00:00.000Z');

function progressOf(
  over: Partial<NonNullable<ProgressOrderRow['productionProgress']>> = {},
) {
  return {
    printedUpper: 10,
    printedLower: 10,
    thermoformedUpper: 8,
    thermoformedLower: 8,
    cutUpper: 6,
    cutLower: 6,
    deliveredUpper: 4,
    deliveredLower: 12,
    firstActionAt: new Date('2026-10-01T08:00:00.000Z'),
    lastActionAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function orderRow(over: Partial<ProgressOrderRow> = {}): ProgressOrderRow {
  return {
    id: 'o1',
    orderCode: 'ORD-001',
    orderType: OrderType.initial,
    parentOrderId: null,
    status: OrderStatus.fabrication,
    deletedAt: null,
    archTreatment: ArchTreatment.both,
    treatBothArch: true,
    totalAligners: null,
    treatmentPlans: [{ totalUpperAligners: 20, totalLowerAligners: 12 }],
    quotation: {
      maxStepsPerArch: 30,
      isUnlimitedSteps: false,
      deletedAt: null,
      stepBatches: [],
    },
    parentOrder: null,
    patient: { fullName: 'Zoé Ben Salah' },
    doctor: { fullName: 'Dr Karim Haddad' },
    productionProgress: progressOf(),
    ...over,
  };
}

describe('progressStateWhere', () => {
  it('all = not deleted AND (queue rule OR a progress row): legacy-only cases too', () => {
    expect(progressStateWhere(ProductionProgressStateParam.all)).toEqual({
      deletedAt: null,
      OR: [productionQueueWhere(), { productionProgress: { isNot: null } }],
    });
    expect(progressStateWhere()).toEqual(
      progressStateWhere(ProductionProgressStateParam.all),
    );
  });

  it('active = the queue rule; done = the kernel done rule', () => {
    expect(progressStateWhere(ProductionProgressStateParam.active)).toEqual(
      productionQueueWhere(),
    );
    expect(progressStateWhere(ProductionProgressStateParam.done)).toEqual(
      productionDoneWhere(),
    );
  });
});

describe('productionSearchWhere', () => {
  it('no search, no filter', () => {
    expect(productionSearchWhere(undefined)).toBeNull();
    expect(productionSearchWhere('')).toBeNull();
  });

  it('matches the order code, the parent code, the patient and the practitioner, case-insensitive', () => {
    const contains = { contains: 'ben', mode: Prisma.QueryMode.insensitive };
    expect(productionSearchWhere('ben')).toEqual({
      OR: [
        { orderCode: contains },
        { parentOrder: { is: { orderCode: contains } } },
        { patient: { is: { fullName: contains } } },
        { doctor: { is: { fullName: contains } } },
      ],
    });
  });

  it('progressWhere ANDs the state and the search', () => {
    expect(progressWhere(ProductionProgressStateParam.active, 'x')).toEqual({
      AND: [productionQueueWhere(), productionSearchWhere('x')],
    });
    expect(progressWhere(undefined, undefined)).toEqual(progressStateWhere());
  });
});

describe('progressRowOf', () => {
  it('maps the head, the planned totals, the counters and the remaining steps', () => {
    const row = progressRowOf(orderRow());
    expect(row).toMatchObject({
      orderId: 'o1',
      orderCode: 'ORD-001',
      kind: 'main',
      parentOrderCode: null,
      patientName: 'Zoé Ben Salah',
      practitionerName: 'Dr Karim Haddad',
      treatedArches: ['upper', 'lower'],
      planned: {
        upper: { total: 20, source: 'approved_plan', provisional: false },
        lower: { total: 12, source: 'approved_plan', provisional: false },
      },
      counters: {
        upper: { printed: 10, thermoformed: 8, cut: 6, delivered: 4 },
        lower: { printed: 10, thermoformed: 8, cut: 6, delivered: 12 },
      },
      remaining: { upper: 16, lower: 0 },
      deliveryComplete: false,
      firstActionAt: '2026-10-01T08:00:00.000Z',
      lastActionAt: NOW.toISOString(),
      inQueue: true,
    });
  });

  it('a case without progress has zero counters and null action dates', () => {
    const row = progressRowOf(orderRow({ productionProgress: null }));
    expect(row.counters.upper).toEqual({
      printed: 0,
      thermoformed: 0,
      cut: 0,
      delivered: 0,
    });
    expect(row.firstActionAt).toBeNull();
    expect(row.lastActionAt).toBeNull();
    expect(row.remaining).toEqual({ upper: 20, lower: 12 });
  });

  it('an untreated arch has a null plan and a null remaining', () => {
    const row = progressRowOf(
      orderRow({
        archTreatment: ArchTreatment.upper,
        treatBothArch: false,
        treatmentPlans: [],
      }),
    );
    expect(row.treatedArches).toEqual(['upper']);
    expect(row.planned.lower).toBeNull();
    expect(row.planned.upper).toEqual({
      total: 30,
      source: 'pack',
      provisional: true,
    });
    expect(row.remaining.lower).toBeNull();
  });

  it('inQueue: an installment case is in the queue only with a released batch on its LIVE quotation', () => {
    const paying = { status: OrderStatus.payment_pending };
    const withBatch = {
      maxStepsPerArch: 30,
      isUnlimitedSteps: false,
      deletedAt: null,
      stepBatches: [{ id: 'b1' }],
    };
    expect(
      progressRowOf(orderRow({ ...paying, quotation: withBatch })).inQueue,
    ).toBe(true);
    expect(
      progressRowOf(
        orderRow({ ...paying, quotation: { ...withBatch, stepBatches: [] } }),
      ).inQueue,
    ).toBe(false);
    expect(
      progressRowOf(
        orderRow({
          ...paying,
          quotation: { ...withBatch, deletedAt: new Date() },
        }),
      ).inQueue,
    ).toBe(false);
    expect(
      progressRowOf(orderRow({ status: OrderStatus.finished })).inQueue,
    ).toBe(false);
  });

  it('a supplemental child carries its parent code', () => {
    const row = progressRowOf(
      orderRow({
        orderType: OrderType.replacement,
        parentOrderId: 'o-parent',
        parentOrder: { orderCode: 'ORD-000' },
      }),
    );
    expect(row.kind).toBe('supplemental');
    expect(row.parentOrderId).toBe('o-parent');
    expect(row.parentOrderCode).toBe('ORD-000');
  });
});

describe('ProductionProgressReportService.list', () => {
  function makeService(rows: ProgressOrderRow[], total: number) {
    const count = jest.fn(() => Promise.resolve(total));
    const findMany = jest.fn((_args: Record<string, unknown>) =>
      Promise.resolve(rows),
    );
    const prisma = {
      dentalOrder: { count, findMany },
    } as unknown as PrismaService;
    return {
      service: new ProductionProgressReportService(prisma),
      count,
      findMany,
    };
  }

  it('costs 2 calls whatever the page size: count + one findMany with the nested whitelist', async () => {
    const rows = Array.from({ length: 50 }, (_, index) =>
      orderRow({ id: `o${index}`, orderCode: `ORD-${index}` }),
    );
    const { service, count, findMany } = makeService(rows, 120);

    const page = await service.list({
      state: ProductionProgressStateParam.active,
      search: 'ORD',
      page: 3,
      limit: 50,
    });

    expect(count).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledTimes(1);
    const where = progressWhere(ProductionProgressStateParam.active, 'ORD');
    expect(count).toHaveBeenCalledWith({ where });
    expect(findMany).toHaveBeenCalledWith({
      where,
      select: PROGRESS_ROW_SELECT,
      orderBy: PROGRESS_ORDER_BY,
      skip: 100,
      take: 50,
    });
    expect(page).toMatchObject({
      total: 120,
      page: 3,
      limit: 50,
      totalPages: 3,
    });
    expect(page.data).toHaveLength(50);
  });

  it('defaults to page 1 of 20, state all', async () => {
    const { service, findMany } = makeService([], 0);
    const page = await service.list({});
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: progressStateWhere(),
        skip: 0,
        take: 20,
      }),
    );
    expect(page).toMatchObject({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
  });

  it('the queue order: latest action first (nulls last), then first come, then id', () => {
    expect(PROGRESS_ORDER_BY).toEqual([
      { productionProgress: { lastActionAt: { sort: 'desc', nulls: 'last' } } },
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('loads at most one released batch per case, never an amount', () => {
    expect(PROGRESS_ROW_SELECT.quotation.select.stepBatches).toEqual({
      where: { status: { in: [...RELEASED_BATCH_STATUSES] } },
      select: { id: true },
      take: 1,
    });
    expect(RELEASED_BATCH_STATUSES).toEqual([
      BatchStatus.unlocked,
      BatchStatus.delivered,
    ]);
  });
});
