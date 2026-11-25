/**
 * One-off go-live import (owner decision D5): every step batch already
 * delivered the legacy way becomes `aligner_delivered` production events
 * with origin = legacy_batch, so the lab's counters start from the truth.
 *
 *   • one row per treated arch, range = the batch clipped to that arch's
 *     approved total (legacy-history-plan.ts), performedAt = the batch's
 *     deliveredAt, one declarationId per batch and range, recipient the
 *     practitioner, author "Historique" (no account);
 *   • unlimited-step packs are skipped: their batch ranges are payment
 *     placeholders, not aligner steps;
 *   • no idempotency key, no notice, never an anomaly (legacy_batch);
 *   • live orders and quotations only: an archived order stays purgeable.
 *
 * Idempotent: a batch arch already imported (same order, arch, stepFrom,
 * stepTo and origin legacy_batch, CANCELLED ROWS INCLUDED: an admin may
 * cancel a legacy row and a re-run must not bring it back) is skipped.
 *
 * Page by page of order ids (ascending), ONE transaction per page: lock
 * the page's orders in id order, read the batches and the earlier imports
 * AFTER the lock, insert with one createMany, then rebuild the page's
 * progress from all its events (production-progress-rebuild.ts).
 *
 * Usage (Docker):
 *   docker compose exec backend node dist/src/scripts/import-production-history
 *
 * Usage (local dev):
 *   npx ts-node -r tsconfig-paths/register src/scripts/import-production-history.ts
 */
import { randomUUID } from 'crypto';
import {
  BatchStatus,
  DeliveryRecipient,
  Prisma,
  PrismaClient,
  ProductionEventOrigin,
  ProductionEventType,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  PLANNED_TOTALS_ORDER_SELECT,
  plannedTotalsInputOf,
} from '../production/kernel';
import { planLegacyHistory } from '../production/legacy-history-plan';
import { MAX_EVENT_QUANTITY } from '../production/production.constants';
import {
  lockOrderPage,
  rebuildProgressFor,
} from '../production/production-progress-rebuild';
import { withSerializedTransactions } from '../prisma/serialized-transactions';

const PAGE_SIZE = Number(process.env.PRODUCTION_SCRIPT_PAGE_SIZE ?? 200);
// A page holds its order locks until it commits: generous, but bounded.
const PAGE_TRANSACTION = { maxWait: 10_000, timeout: 120_000 };
const HISTORY_AUTHOR = 'Historique';

/** A delivered batch the production module did not flip, on a live case. */
const LEGACY_DELIVERED_BATCH = {
  status: BatchStatus.delivered,
  deliveredByProduction: false,
} satisfies Prisma.QuoteStepBatchWhereInput;

const CANDIDATE_ORDERS = {
  deletedAt: null,
  quotation: {
    is: { deletedAt: null, stepBatches: { some: LEGACY_DELIVERED_BATCH } },
  },
} satisfies Prisma.DentalOrderWhereInput;

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // One statement at a time per page transaction (pg 9 drops the queue).
  const adapter = withSerializedTransactions(new PrismaPg(pool));
  const prisma = new PrismaClient({ adapter });

  try {
    let after: string | null = null;
    let imported = 0;
    let skipped = 0;
    for (;;) {
      const page: { id: string }[] = await prisma.dentalOrder.findMany({
        where: { ...CANDIDATE_ORDERS, ...(after ? { id: { gt: after } } : {}) },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: PAGE_SIZE,
      });
      if (page.length === 0) break;
      const ids = page.map((order) => order.id);
      after = ids[ids.length - 1];

      const result = await prisma.$transaction(async (tx) => {
        await lockOrderPage(tx, ids);
        // Read after the lock: a declare that committed meanwhile is seen.
        const orders = await tx.dentalOrder.findMany({
          where: { id: { in: ids }, ...CANDIDATE_ORDERS },
          select: {
            id: true,
            // The planned totals clip each batch (CONC-02) and flag the
            // unlimited-step packs (CONC-01).
            ...PLANNED_TOTALS_ORDER_SELECT,
            quotation: {
              select: {
                ...PLANNED_TOTALS_ORDER_SELECT.quotation.select,
                stepBatches: {
                  where: LEGACY_DELIVERED_BATCH,
                  select: {
                    batchNumber: true,
                    fromStep: true,
                    toStep: true,
                    deliveredAt: true,
                    updatedAt: true,
                  },
                  orderBy: { batchNumber: 'asc' },
                },
              },
            },
            productionEvents: {
              where: { origin: ProductionEventOrigin.legacy_batch },
              select: { arch: true, stepFrom: true, stepTo: true },
            },
          },
        });

        const rows: Prisma.ProductionEventCreateManyInput[] = [];
        let pageSkipped = 0;
        for (const order of orders) {
          const plan = planLegacyHistory({
            planned: plannedTotalsInputOf(order),
            batches: order.quotation?.stepBatches ?? [],
            imported: order.productionEvents,
          });
          if (plan.unlimitedSteps) {
            console.warn(
              `! Order ${order.id}: unlimited-step pack, its batches carry no aligner steps, skipped.`,
            );
          }
          for (const batchNumber of plan.invalid) {
            console.warn(
              `! Order ${order.id}: batch ${batchNumber} has an invalid range, skipped.`,
            );
          }
          pageSkipped += plan.skipped + plan.invalid.length;
          for (const declaration of plan.declarations) {
            const declarationId = randomUUID();
            for (const arch of declaration.arches) {
              rows.push({
                orderId: order.id,
                declarationId,
                type: ProductionEventType.aligner_delivered,
                arch,
                stepFrom: declaration.fromStep,
                stepTo: declaration.toStep,
                quantity: Math.min(
                  declaration.toStep - declaration.fromStep + 1,
                  MAX_EVENT_QUANTITY,
                ),
                performedAt: declaration.performedAt,
                createdById: null,
                createdByName: HISTORY_AUTHOR,
                deliveredTo: DeliveryRecipient.practitioner,
                warnings: [],
                origin: ProductionEventOrigin.legacy_batch,
              });
            }
          }
        }
        if (rows.length > 0)
          await tx.productionEvent.createMany({ data: rows });
        const touched = [...new Set(rows.map((row) => row.orderId))];
        await rebuildProgressFor(tx, touched);
        return { imported: rows.length, skipped: pageSkipped };
      }, PAGE_TRANSACTION);
      imported += result.imported;
      skipped += result.skipped;
    }
    console.log(
      `✓ Imported ${imported} legacy delivery row(s); ${skipped} batch(es) skipped (already imported, beyond the approved plan, unlimited-step pack or invalid).`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('✗ Failed to import the production history:', err);
  process.exit(1);
});
