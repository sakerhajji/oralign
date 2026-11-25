import type { Prisma } from '@prisma/client';
import {
  computeProgress,
  PROGRESS_EVENT_SELECT,
  type ProgressEventInput,
} from './kernel';

/**
 * Batch writers of the maintenance scripts (src/scripts): lock a page of
 * orders, then recompute their ProductionProgress rows from their events,
 * with the same computeProgress() the declare / cancel transactions use.
 */

/** Row-lock a page of orders in id order: a page never deadlocks with another, nor with a declare. */
export async function lockOrderPage(
  tx: Prisma.TransactionClient,
  orderIds: readonly string[],
): Promise<void> {
  if (orderIds.length === 0) return;
  await tx.$queryRaw`SELECT id FROM "DentalOrder" WHERE id = ANY(${[...orderIds]}) ORDER BY id FOR UPDATE`;
}

/**
 * Recompute the progress of `orderIds` (locked by the caller) from ALL
 * their events: one read, then the page in two statements (deleteMany +
 * createMany), never an upsert per order. An order without events gets
 * no row. Returns the number of rows written.
 */
export async function rebuildProgressFor(
  tx: Prisma.TransactionClient,
  orderIds: readonly string[],
): Promise<number> {
  if (orderIds.length === 0) return 0;
  const events = await tx.productionEvent.findMany({
    where: { orderId: { in: [...orderIds] } },
    select: { orderId: true, ...PROGRESS_EVENT_SELECT },
  });
  const byOrder = new Map<string, ProgressEventInput[]>();
  for (const { orderId, ...event } of events) {
    const list = byOrder.get(orderId) ?? [];
    list.push(event);
    byOrder.set(orderId, list);
  }
  const rows = [...byOrder].map(([orderId, list]) => ({
    orderId,
    ...computeProgress(list),
  }));
  await tx.productionProgress.deleteMany({
    where: { orderId: { in: [...orderIds] } },
  });
  if (rows.length > 0) await tx.productionProgress.createMany({ data: rows });
  return rows.length;
}
