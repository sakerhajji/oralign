import {
  OrderType,
  ProductionArch,
  ProductionEventOrigin,
  ProductionEventType,
} from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { ProductionSummaryService } from './production-summary.service';
import {
  DAY_3_END,
  DAY_3_START,
  eventRow,
  tunisNov3,
} from './report-fixtures.helper-spec';
import type { ReportEventRow } from './report-views';

type FindManyArgs = {
  where: Record<string, unknown>;
  select: Record<string, unknown>;
  orderBy: unknown;
};

/**
 * The service issues exactly two findMany: the counted rows, then the
 * cancelled rows. The mock answers by the `cancelledAt` filter, so the
 * order of the parallel calls does not matter.
 */
function makeService(counted: ReportEventRow[], cancelled: ReportEventRow[]) {
  const findMany = jest.fn((args: FindManyArgs) =>
    Promise.resolve(args.where.cancelledAt === null ? counted : cancelled),
  );
  const prisma = {
    productionEvent: { findMany },
  } as unknown as PrismaService;
  const argsOf = (cancelledCall: boolean): FindManyArgs => {
    const call = (findMany.mock.calls as [FindManyArgs][]).find(
      ([args]) => (args.where.cancelledAt === null) !== cancelledCall,
    );
    if (!call) throw new Error('call not issued');
    return call[0];
  };
  return { service: new ProductionSummaryService(prisma), findMany, argsOf };
}

describe('ProductionSummaryService.summarize', () => {
  it('a single day is the journal: 2 calls, counted rows listed in full, performedAt asc', async () => {
    const live = [
      eventRow({ id: 'e1', performedAt: tunisNov3('08:00') }),
      eventRow({
        id: 'e2',
        type: ProductionEventType.aligner_thermoformed,
        quantity: 6,
        performedAt: tunisNov3('10:00'),
      }),
    ];
    const gone = [
      eventRow({
        id: 'e3',
        cancelledAt: tunisNov3('11:00'),
        cancelledByName: 'Sami',
        cancelReason: 'Mauvais cas',
      }),
    ];
    const { service, findMany, argsOf } = makeService(live, gone);

    const summary = await service.summarize({
      from: '2026-11-03',
      to: '2026-11-03',
    });

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(argsOf(false).where).toEqual({
      performedAt: { gte: DAY_3_START, lt: DAY_3_END },
      cancelledAt: null,
      origin: ProductionEventOrigin.declared,
    });
    expect(argsOf(false).orderBy).toEqual([
      { performedAt: 'asc' },
      { createdAt: 'asc' },
      { arch: 'asc' },
      { id: 'asc' },
    ]);
    // The journal loads the whole row (note, recipient…).
    expect(argsOf(false).select).toHaveProperty('note', true);
    expect(argsOf(true).where).toEqual({
      performedAt: { gte: DAY_3_START, lt: DAY_3_END },
      cancelledAt: { not: null },
    });
    expect(argsOf(true).orderBy).toEqual([
      { cancelledAt: 'desc' },
      { arch: 'asc' },
      { id: 'asc' },
    ]);

    expect(summary.mode).toBe('journal');
    expect(summary.from).toBe('2026-11-03');
    expect(summary.events?.map((event) => event.id)).toEqual(['e1', 'e2']);
    expect(summary.events?.[0]).toMatchObject({
      performedAt: tunisNov3('08:00').toISOString(),
      canCancel: true,
      order: {
        orderId: 'o1',
        orderCode: 'ORD-001',
        kind: 'main',
        patientName: 'Zoé Ben Salah',
      },
    });
    expect(summary.cancelled).toHaveLength(1);
    expect(summary.cancelled[0]).toMatchObject({
      id: 'e3',
      canCancel: false,
      cancelReason: 'Mauvais cas',
    });
    expect(summary.totals.model_printed).toEqual({ entries: 1, quantity: 5 });
    expect(summary.consumption).toEqual({ plates: 6, models: 5 });
    expect(summary.byDay).toEqual([
      expect.objectContaining({ day: '2026-11-03' }),
    ]);
  });

  it('a longer period is the recap: still 2 calls, slim counted rows, events null', async () => {
    const { service, findMany, argsOf } = makeService(
      [eventRow({ arch: ProductionArch.lower })],
      [],
    );

    const summary = await service.summarize({
      from: '2026-11-01',
      to: '2026-11-30',
    });

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(argsOf(false).where).toMatchObject({
      performedAt: {
        gte: new Date('2026-10-31T23:00:00.000Z'),
        lt: new Date('2026-11-30T23:00:00.000Z'),
      },
    });
    // A year of rows: no note, reason or recipient loaded for the sums.
    expect(argsOf(false).select).not.toHaveProperty('note');
    expect(argsOf(false).select).toHaveProperty('order');
    // The snapshot time that names an author, whatever the row order.
    expect(argsOf(false).select).toHaveProperty('createdAt', true);
    // The recap only sums: no sort (it spilled to disk over a year).
    expect(argsOf(false)).not.toHaveProperty('orderBy');
    // The cancelled rows keep their documented order.
    expect(argsOf(true).orderBy).toEqual([
      { cancelledAt: 'desc' },
      { arch: 'asc' },
      { id: 'asc' },
    ]);
    expect(summary.mode).toBe('recap');
    expect(summary.events).toBeNull();
    expect(summary.byCase).toHaveLength(1);
  });

  it('the recap is the same whatever order the unsorted rows come back in', async () => {
    const rows = [
      eventRow({ id: 'r1', createdByName: 'Amira' }),
      eventRow({
        id: 'r2',
        orderId: 'o2',
        type: ProductionEventType.aligner_cut,
        performedAt: new Date('2026-11-12T09:00:00.000Z'),
        createdAt: new Date('2026-11-12T09:05:00.000Z'),
        createdByName: 'Amira B.',
        order: {
          orderCode: 'ORD-002',
          orderType: OrderType.initial,
          patient: { fullName: 'Ali Trabelsi' },
        },
      }),
      eventRow({ id: 'r3', createdById: 'u-admin', createdByName: 'Sami' }),
    ];
    const summarize = (input: ReportEventRow[]) =>
      makeService(input, []).service.summarize({
        from: '2026-11-01',
        to: '2026-11-30',
      });
    const inOrder = await summarize(rows);
    expect(await summarize([...rows].reverse())).toEqual(inOrder);
    expect(inOrder.byAuthor.map((author) => author.name)).toEqual([
      'Amira B.',
      'Sami',
    ]);
  });

  it('refuses a period longer than the limit before any query', async () => {
    const { service, findMany } = makeService([], []);
    await expect(
      service.summarize({ from: '2025-01-01', to: '2026-11-30' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'INVALID_DATE_RANGE',
    });
    expect(findMany).not.toHaveBeenCalled();
  });
});
