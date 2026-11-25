import {
  ProductionArch,
  ProductionEventType,
  type Prisma,
} from '@prisma/client';
import { computeProgress } from './kernel';
import {
  lockOrderPage,
  rebuildProgressFor,
} from './production-progress-rebuild';

const { upper, lower } = ProductionArch;
const T1 = new Date('2026-11-20T09:00:00.000Z');
const T2 = new Date('2026-11-21T09:00:00.000Z');

/** Every Prisma call is recorded, so a test asserts the page's exact budget. */
function client(events: Record<string, unknown>[] = []) {
  const calls: string[] = [];
  const record =
    <R>(name: string, result: R) =>
    () => {
      calls.push(name);
      return Promise.resolve(result);
    };
  const tx = {
    $queryRaw: jest.fn(record('$queryRaw', [])),
    productionEvent: { findMany: jest.fn(record('event.findMany', events)) },
    productionProgress: {
      deleteMany: jest.fn(record('progress.deleteMany', { count: 0 })),
      createMany: jest.fn(record('progress.createMany', { count: 1 })),
      upsert: jest.fn(record('progress.upsert', {})),
    },
  };
  return {
    tx,
    calls,
    asTx: tx as unknown as Prisma.TransactionClient,
  };
}

describe('lockOrderPage', () => {
  it('locks the whole page in ONE statement, ids ascending (no deadlock between pages)', async () => {
    const { tx, calls, asTx } = client();
    await lockOrderPage(asTx, ['b', 'a']);

    expect(calls).toEqual(['$queryRaw']);
    const [strings, ids] = tx.$queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      string[],
    ];
    expect(strings.join('?')).toMatch(/ORDER BY id FOR UPDATE/);
    expect(ids).toEqual(['b', 'a']);
  });

  it('an empty page touches nothing', async () => {
    const { calls, asTx } = client();
    await lockOrderPage(asTx, []);
    expect(calls).toEqual([]);
  });
});

describe('rebuildProgressFor', () => {
  it('an empty page touches nothing and writes no row', async () => {
    const { calls, asTx } = client();
    await expect(rebuildProgressFor(asTx, [])).resolves.toBe(0);
    expect(calls).toEqual([]);
  });

  it('one read, then the page in two statements: every id cleared, one row per order WITH events, never an upsert', async () => {
    const row = (over: Record<string, unknown>) => ({
      orderId: 'o1',
      type: ProductionEventType.aligner_delivered,
      arch: upper,
      stepFrom: 1,
      stepTo: 5,
      performedAt: T1,
      cancelledAt: null,
      ...over,
    });
    const events = [
      row({}),
      row({ arch: lower, stepFrom: 1, stepTo: 3, performedAt: T2 }),
      // Cancelled: counted by nobody, as in the declare transaction.
      row({ stepFrom: 6, stepTo: 9, cancelledAt: T2 }),
    ];
    const { tx, calls, asTx } = client(events);

    await expect(rebuildProgressFor(asTx, ['o1', 'o2'])).resolves.toBe(1);

    expect(calls).toEqual([
      'event.findMany',
      'progress.deleteMany',
      'progress.createMany',
    ]);
    expect(tx.productionEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: { in: ['o1', 'o2'] } } }),
    );
    // o2 has no event: its stale row goes, none comes back.
    expect(tx.productionProgress.deleteMany).toHaveBeenCalledWith({
      where: { orderId: { in: ['o1', 'o2'] } },
    });
    const withoutOrder = events.map(
      ({ orderId: _orderId, ...event }) => event,
    ) as Parameters<typeof computeProgress>[0];
    expect(tx.productionProgress.createMany).toHaveBeenCalledWith({
      data: [{ orderId: 'o1', ...computeProgress(withoutOrder) }],
    });
    expect(tx.productionProgress.upsert).not.toHaveBeenCalled();
  });

  it('a page without any event only clears its rows', async () => {
    const { calls, asTx } = client([]);
    await expect(rebuildProgressFor(asTx, ['o1'])).resolves.toBe(0);
    expect(calls).toEqual(['event.findMany', 'progress.deleteMany']);
  });
});
