import type { PrismaPg } from '@prisma/adapter-pg';

type SqlAdapter = Awaited<ReturnType<PrismaPg['connect']>>;
type SqlTransaction = Awaited<ReturnType<SqlAdapter['startTransaction']>>;

/** Replacements for some members of `target`, built from it. */
type Overrides<T> = { [K in keyof T]?: (target: T) => T[K] };

/**
 * A view of `target` with some members replaced. Every other member is
 * the target's own, methods bound to the target (never to the proxy, so a
 * class with private fields keeps working).
 */
function override<T extends object>(target: T, overrides: Overrides<T>): T {
  return new Proxy(target, {
    get(object, property) {
      const make = overrides[property as keyof T];
      if (make) return make(object);
      const value: unknown = Reflect.get(object, property, object);
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(object)
        : value;
    },
  });
}

/**
 * One interactive transaction's statements, sent one after the other in
 * the order they were submitted. A failed statement does not stop the next
 * (each caller gets its own result, as with pg's queue).
 */
function queued(transaction: SqlTransaction): SqlTransaction {
  let tail: Promise<unknown> = Promise.resolve();
  const inTurn = <R>(task: () => Promise<R>): Promise<R> => {
    const turn = tail.then(task);
    tail = turn.catch(() => undefined);
    return turn;
  };
  return override(transaction, {
    queryRaw: (tx) => (query) => inTurn(() => tx.queryRaw(query)),
    executeRaw: (tx) => (query) => inTurn(() => tx.executeRaw(query)),
    createSavepoint: (tx) =>
      tx.createSavepoint && ((name) => inTurn(() => tx.createSavepoint!(name))),
    rollbackToSavepoint: (tx) =>
      tx.rollbackToSavepoint &&
      ((name) => inTurn(() => tx.rollbackToSavepoint!(name))),
    releaseSavepoint: (tx) =>
      tx.releaseSavepoint &&
      ((name) => inTurn(() => tx.releaseSavepoint!(name))),
  });
}

/**
 * The pg adapter with each interactive transaction's statements queued.
 *
 * Prisma 7's query interpreter loads the sibling relations of a nested
 * select with Promise.all (client runtime, `case "join"`), and the pg
 * adapter sends each straight to `client.query()`. Inside an interactive
 * transaction they all share its ONE connection, so pg 8 queues them
 * itself: deprecated ("Calling client.query() when the client is already
 * executing a query", a DeprecationWarning once per process) and removed
 * in pg 9. Queuing them here instead keeps the same order and costs
 * nothing: a connection runs one statement at a time anyway. Queries
 * outside a transaction each check their own client out of the pool and
 * are left alone.
 */
export function withSerializedTransactions(adapter: PrismaPg): PrismaPg {
  return override(adapter, {
    connect: (factory) => async () =>
      override(await factory.connect(), {
        startTransaction:
          (driver) =>
          async (...args) =>
            queued(await driver.startTransaction(...args)),
      }),
  });
}
