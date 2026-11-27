import { BatchStatus, BatchUnlockSource, Prisma } from '@prisma/client';
import { lookupActorName } from '../common/access/actor-snapshot';
import type { Caller } from '../common/access/caller';
import { ORDER_AUDIT_ACTION } from '../common/audit/order-audit-actions';
import type { BatchUnlockedAuditMetadata } from '../common/audit/order-audit-actions';
import { writeOrderAudit } from '../common/audit/order-audit-entry';
import { BadRequestException } from '../common/exceptions/app.exception';
import {
  BATCH_UNLOCK_ERROR,
  validReason,
} from '../common/exceptions/domain-error-codes';
import { projectBatches } from './production-batch-projection';

/**
 * THE writer of a step batch's locked → unlocked transition (DECISIONS §3,
 * critic "contradictions": one helper, one order of writes). A plain
 * tx-scoped function, no DI, like projectBatches: the payments and
 * quotation modules call it inside their own transactions.
 *
 * In this order, inside the caller's transaction:
 *   1. status-guarded updateMany (where status = locked), one per batch: a
 *      repeat, or a batch already unlocked / delivered, writes nothing;
 *   2. projectBatches (D2), ONCE per order after every release of the
 *      call, as the quote edit always did (the coverage start and the
 *      finish are decided on the whole set): steps delivered before the
 *      release flip the batch to delivered now. It takes the order FOR
 *      UPDATE lock;
 *   3. one batch_unlocked OrderAuditLog row per released batch (actor,
 *      source, range, paymentId), AFTER the projection so the order row is
 *      already locked FOR UPDATE when the audit's foreign key needs its
 *      key-share lock (no lock upgrade).
 * Lock order of every caller: installment(s) by id → quotation → order
 * (settleWithin, lockQuoteForEdit, the manual unlock route).
 *
 * The caller emits NotificationEvents.BatchUnlocked AFTER the commit, with
 * `source`; a manual unlock never notifies the doctor.
 */

export interface UnlockStepBatchInput {
  batchId: string;
  source: BatchUnlockSource;
  /**
   * The admin who confirmed the payment, edited the quote or unlocked by
   * hand; null = the system (a card settlement). Must be a real account.
   * Required for a manual unlock.
   */
  actor: Caller | null;
  /** source payment: the settled Payment (OrderAuditLog.paymentId). */
  paymentId?: string | null;
  /** source manual: the admin's reason, 3-500 characters once trimmed. */
  reason?: string | null;
  /** The unlock instant (the settlement's `now`); defaults to now. */
  at?: Date;
}

/** The batch as it was released, for the caller's post-commit event. */
export interface UnlockedStepBatch {
  id: string;
  quotationId: string;
  installmentId: string;
  orderId: string;
  batchNumber: number;
  fromStep: number;
  toStep: number;
  installmentNumber: number | null;
  source: BatchUnlockSource;
  unlockedAt: Date;
}

const UNLOCK_BATCH_SELECT = {
  id: true,
  quotationId: true,
  installmentId: true,
  batchNumber: true,
  fromStep: true,
  toStep: true,
  status: true,
  quotation: { select: { orderId: true } },
  installment: { select: { installmentNumber: true } },
} satisfies Prisma.QuoteStepBatchSelect;

/** Several batches released by one act (a quote edit cancelling rows). */
export interface UnlockStepBatchesInput extends Omit<
  UnlockStepBatchInput,
  'batchId'
> {
  batchIds: readonly string[];
}

type UnlockBatchRow = Prisma.QuoteStepBatchGetPayload<{
  select: typeof UNLOCK_BATCH_SELECT;
}>;

/**
 * Release the locked batches among `batchIds` (see the file comment).
 * Returns the batches released, in `batchIds` order. An unknown batch, one
 * not locked any more or a lost race is skipped and writes nothing; with no
 * release at all there is no projection and no journal row.
 */
export async function unlockStepBatches(
  tx: Prisma.TransactionClient,
  input: UnlockStepBatchesInput,
): Promise<UnlockedStepBatch[]> {
  const manual = input.source === BatchUnlockSource.manual;
  const reason = manual ? validReason(input.reason) : null;
  if (manual && !reason) {
    throw new BadRequestException(
      'Indiquez le motif du déblocage (3 à 500 caractères).',
      BATCH_UNLOCK_ERROR.UNLOCK_REASON_REQUIRED,
    );
  }
  if (manual && !input.actor) {
    // Programmer error: a manual unlock is always an admin's act.
    throw new Error('A manual unlock needs its admin actor.');
  }

  const at = input.at ?? new Date();
  // Looked up once, on the first batch actually released.
  let actorName: string | null | undefined;
  const released: UnlockBatchRow[] = [];
  for (const batchId of new Set(input.batchIds)) {
    const batch = await tx.quoteStepBatch.findUnique({
      where: { id: batchId },
      select: UNLOCK_BATCH_SELECT,
    });
    if (!batch || batch.status !== BatchStatus.locked) continue;
    if (actorName === undefined) {
      actorName = input.actor
        ? await lookupActorName(tx, input.actor.userId)
        : null;
    }

    // 1. The guard: a concurrent release (or a repeat) matches nothing.
    const { count } = await tx.quoteStepBatch.updateMany({
      where: { id: batch.id, status: BatchStatus.locked },
      data: {
        status: BatchStatus.unlocked,
        unlockedAt: at,
        unlockedById: input.actor?.userId ?? null,
        unlockedByName: actorName,
        unlockSource: input.source,
        unlockReason: reason,
      },
    });
    if (count > 0) released.push(batch);
  }
  if (released.length === 0) return [];

  // 2. Steps delivered before they were released (D2): one projection per
  // order, on the whole set (the batches of one quotation share it).
  for (const orderId of new Set(released.map((b) => b.quotation.orderId))) {
    await projectBatches(tx, { orderId, actorId: null });
  }

  // 3. The journal rows, the order row now locked by the projection.
  const result: UnlockedStepBatch[] = [];
  for (const batch of released) {
    const orderId = batch.quotation.orderId;
    const installmentNumber = batch.installment?.installmentNumber ?? null;
    const metadata: BatchUnlockedAuditMetadata = {
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      fromStep: batch.fromStep,
      toStep: batch.toStep,
      source: input.source,
      installmentNumber,
      ...(reason ? { reason } : {}),
    };
    await writeOrderAudit(tx, orderId, input.actor, {
      action: ORDER_AUDIT_ACTION.BATCH_UNLOCKED,
      metadata: { ...metadata },
      paymentId: input.paymentId ?? null,
      actorName: actorName ?? null,
    });
    result.push({
      id: batch.id,
      quotationId: batch.quotationId,
      installmentId: batch.installmentId,
      orderId,
      batchNumber: batch.batchNumber,
      fromStep: batch.fromStep,
      toStep: batch.toStep,
      installmentNumber,
      source: input.source,
      unlockedAt: at,
    });
  }
  return result;
}

/**
 * Release one locked batch (see the file comment). Returns the released
 * batch, or null when there was nothing to release (unknown batch, or not
 * locked any more): an idempotent no-op that writes nothing.
 */
export async function unlockStepBatch(
  tx: Prisma.TransactionClient,
  input: UnlockStepBatchInput,
): Promise<UnlockedStepBatch | null> {
  const { batchId, ...rest } = input;
  const [released] = await unlockStepBatches(tx, {
    ...rest,
    batchIds: [batchId],
  });
  return released ?? null;
}
