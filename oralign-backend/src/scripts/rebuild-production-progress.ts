/**
 * Rebuild the ProductionProgress read model of every order that has lab
 * production events, from those events, with the very function the
 * declare / cancel transactions use (kernel computeProgress). Idempotent,
 * and safe to run while technicians declare.
 *
 * Page by page of order ids (ascending), ONE transaction per page:
 *   1. lock the page's orders, in id order (no deadlock with another
 *      page or with a declare / cancel, which lock one order);
 *   2. only THEN read their events (a declaration committing in between
 *      would otherwise be overwritten with stale counts);
 *   3. write the page in two statements (deleteMany + createMany), never
 *      one upsert per order.
 *
 * Usage (Docker):
 *   docker compose exec backend node dist/src/scripts/rebuild-production-progress
 *
 * Usage (local dev):
 *   npx ts-node -r tsconfig-paths/register src/scripts/rebuild-production-progress.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  lockOrderPage,
  rebuildProgressFor,
} from '../production/production-progress-rebuild';
import { withSerializedTransactions } from '../prisma/serialized-transactions';

const PAGE_SIZE = Number(process.env.PRODUCTION_SCRIPT_PAGE_SIZE ?? 200);
// A page holds its order locks until it commits: generous, but bounded.
const PAGE_TRANSACTION = { maxWait: 10_000, timeout: 120_000 };

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // One statement at a time per page transaction (pg 9 drops the queue).
  const adapter = withSerializedTransactions(new PrismaPg(pool));
  const prisma = new PrismaClient({ adapter });

  try {
    let after: string | null = null;
    let pages = 0;
    let rebuilt = 0;
    for (;;) {
      // Keyset paging: a page committed meanwhile never shifts the next one.
      const page: { id: string }[] = await prisma.dentalOrder.findMany({
        where: {
          productionEvents: { some: {} },
          ...(after ? { id: { gt: after } } : {}),
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: PAGE_SIZE,
      });
      if (page.length === 0) break;
      const ids = page.map((order) => order.id);
      after = ids[ids.length - 1];

      rebuilt += await prisma.$transaction(async (tx) => {
        await lockOrderPage(tx, ids);
        return rebuildProgressFor(tx, ids);
      }, PAGE_TRANSACTION);
      pages += 1;
    }
    console.log(
      `✓ Production progress rebuilt for ${rebuilt} order(s) in ${pages} page(s).`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('✗ Failed to rebuild the production progress:', err);
  process.exit(1);
});
