import type { PrismaPg } from '@prisma/adapter-pg';
import { withSerializedTransactions } from './serialized-transactions';

/**
 * Prisma's interpreter sends a nested select's relations together; inside
 * an interactive transaction they must reach its ONE connection one at a
 * time (pg 9 drops pg 8's implicit queue). Checked here on a fake driver
 * that records how many statements overlap; the real pg adapter was
 * probed on Postgres 17 (no DeprecationWarning, 1 statement in flight).
 */

/** The adapter's own query shape. */
type Query = Parameters<
  Awaited<ReturnType<PrismaPg['connect']>>['queryRaw']
>[0];

const query = (sql: string): Query => ({ sql, args: [], argTypes: [] });

/** Each statement takes a few ms; `fail` statements reject. */
function fakeDriver() {
  const log: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const run = async (sql: string) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    log.push(`start ${sql}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    log.push(`end ${sql}`);
    inFlight -= 1;
    if (sql.startsWith('fail')) throw new Error(`${sql} failed`);
    return { columnNames: [], columnTypes: [], rows: [[sql]] };
  };

  class FakeTransaction {
    readonly provider = 'postgres';
    readonly adapterName = '@prisma/adapter-pg';
    readonly options = { usePhantomQuery: false };
    // A private field: members must keep being called on the real object.
    #released = false;
    queryRaw(q: Query) {
      return run(q.sql);
    }
    async executeRaw(q: Query) {
      await run(q.sql);
      return 1;
    }
    async createSavepoint(name: string) {
      await this.executeRaw(query(`SAVEPOINT ${name}`));
    }
    commit() {
      this.#released = true;
      return Promise.resolve();
    }
    get released() {
      return this.#released;
    }
  }
  const transaction = new FakeTransaction();
  const driver = {
    provider: 'postgres',
    adapterName: '@prisma/adapter-pg',
    queryRaw: (q: Query) => run(q.sql),
    executeRaw: async (q: Query) => {
      await run(q.sql);
      return 1;
    },
    startTransaction: jest.fn(() => Promise.resolve(transaction)),
    dispose: jest.fn(() => Promise.resolve()),
  };
  const factory = {
    provider: 'postgres',
    adapterName: '@prisma/adapter-pg',
    connect: jest.fn(() => Promise.resolve(driver)),
  };
  return {
    factory: factory as unknown as PrismaPg,
    transaction,
    driver,
    log,
    maxInFlight: () => maxInFlight,
  };
}

async function openTransaction(fake: ReturnType<typeof fakeDriver>) {
  const adapter = await withSerializedTransactions(fake.factory).connect();
  return { adapter, tx: await adapter.startTransaction() };
}

describe('withSerializedTransactions', () => {
  it('runs a transaction statements one at a time, in submission order', async () => {
    const fake = fakeDriver();
    const { tx } = await openTransaction(fake);

    // What the query interpreter does for a join's children.
    const results = await Promise.all(
      ['a', 'b', 'c', 'd'].map((sql) => tx.queryRaw(query(sql))),
    );

    expect(fake.maxInFlight()).toBe(1);
    expect(fake.log).toEqual([
      'start a',
      'end a',
      'start b',
      'end b',
      'start c',
      'end c',
      'start d',
      'end d',
    ]);
    expect(results.map((result) => result.rows[0][0])).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('a failed statement fails alone: the next ones still run and answer', async () => {
    const fake = fakeDriver();
    const { tx } = await openTransaction(fake);

    const outcomes = await Promise.allSettled([
      tx.queryRaw(query('a')),
      tx.executeRaw(query('fail-b')),
      tx.queryRaw(query('c')),
    ]);

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'fulfilled',
      'rejected',
      'fulfilled',
    ]);
    expect(fake.maxInFlight()).toBe(1);
  });

  it('queues the COMMIT-time statements and savepoints behind the pending ones', async () => {
    const fake = fakeDriver();
    const { tx } = await openTransaction(fake);

    await Promise.all([
      tx.queryRaw(query('a')),
      tx.createSavepoint!('s1'),
      tx.executeRaw(query('COMMIT')),
    ]);

    expect(fake.maxInFlight()).toBe(1);
    expect(fake.log.filter((line) => line.startsWith('start'))).toEqual([
      'start a',
      'start SAVEPOINT s1',
      'start COMMIT',
    ]);
  });

  it('keeps every other member: options, names, commit on the real object', async () => {
    const fake = fakeDriver();
    const { adapter, tx } = await openTransaction(fake);

    expect(tx.options).toEqual({ usePhantomQuery: false });
    expect(tx.adapterName).toBe('@prisma/adapter-pg');
    await tx.commit();
    expect(fake.transaction.released).toBe(true);
    expect(adapter.provider).toBe('postgres');
    await adapter.dispose();
    expect(fake.driver.dispose).toHaveBeenCalledTimes(1);
  });

  it('leaves the statements outside a transaction alone (each has its own pooled client)', async () => {
    const fake = fakeDriver();
    const adapter = await withSerializedTransactions(fake.factory).connect();

    await Promise.all([
      adapter.queryRaw(query('a')),
      adapter.queryRaw(query('b')),
    ]);

    expect(fake.maxInFlight()).toBe(2);
  });

  it('two transactions never wait for each other', async () => {
    const fake = fakeDriver();
    const adapter = await withSerializedTransactions(fake.factory).connect();
    const first = await adapter.startTransaction();
    const second = await adapter.startTransaction();

    await Promise.all([
      first.queryRaw(query('a')),
      second.queryRaw(query('b')),
    ]);

    // One queue per transaction (the fake hands out the same object, so
    // this checks the queue lives in each wrapper).
    expect(fake.maxInFlight()).toBe(2);
  });
});
