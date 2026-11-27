import { PaymentRecordStatus } from '@prisma/client';
import { unreadTransferSubjectKeys } from '../../notifications/transfer-subject-reads';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  emptyCounts,
  installmentQueueWhere,
  type QueueWhereContext,
  splitSubjectKeys,
  STATUS_TAB,
  STATUS_TABS,
  type TransferQueueFilter,
  treatmentFeeQueueWhere,
  type UnreadSubjects,
} from './transfer-queue.rules';

/**
 * The counting reads of the transfer queue, plain functions (no DI) so the
 * admin sidebar badge (DashboardModule) counts EXACTLY the pending desk's
 * "Nouveau" tab (PaymentsModule): one definition, two readers. Every
 * condition comes from transfer-queue.rules.ts.
 */

export type TransferQueueDb = Pick<
  PrismaService,
  'notification' | 'payment' | 'dentalOrder'
>;

/** My unread transfer subjects, decoded (one indexed read). */
export async function loadUnreadSubjects(
  db: Pick<PrismaService, 'notification'>,
  adminId: string,
): Promise<UnreadSubjects> {
  return splitSubjectKeys(await unreadTransferSubjectKeys(db, adminId));
}

/**
 * The live count of every tab, in four statements: per kind, one groupBy
 * on the status over the OR of the three status tabs (each tab has its own
 * status, so the groups partition them) and one count of my unread
 * subjects still awaiting (Nouveau, a subset of À vérifier).
 */
export async function countQueueTabs(
  db: Pick<PrismaService, 'payment' | 'dentalOrder'>,
  ctx: QueueWhereContext,
): Promise<Record<TransferQueueFilter, number>> {
  // A status tab always has a condition; flatMap keeps a null (none) out
  // of the OR rather than widening it to everything.
  const installmentTabs = STATUS_TABS.flatMap((filter) => {
    const where = installmentQueueWhere(filter, ctx);
    return where ? [where] : [];
  });
  const feeTabs = STATUS_TABS.flatMap((filter) => {
    const where = treatmentFeeQueueWhere(filter, ctx);
    return where ? [where] : [];
  });
  const [installmentGroups, feeGroups, newInstallments, newFees] =
    await Promise.all([
      db.payment.groupBy({
        by: ['status'],
        where: { OR: installmentTabs },
        _count: { _all: true },
      }),
      db.dentalOrder.groupBy({
        by: ['treatmentFeePaymentStatus'],
        where: { OR: feeTabs },
        _count: { _all: true },
      }),
      countNewInstallments(db, ctx.unread),
      countNewFees(db, ctx.unread),
    ]);

  const counts = emptyCounts();
  const add = (status: PaymentRecordStatus | null, value: number) => {
    const tab = status ? STATUS_TAB[status] : undefined;
    if (tab) counts[tab] += value;
  };
  for (const group of installmentGroups) add(group.status, group._count._all);
  for (const group of feeGroups) {
    add(group.treatmentFeePaymentStatus, group._count._all);
  }
  counts.nouveau = newInstallments + newFees;
  return counts;
}

/**
 * The sidebar badge "Paiements en attente": my "Nouveau" subjects, i.e.
 * transfers still awaiting confirmation whose row of mine is unread,
 * archived orders excluded. A subject counts once however many rows carry
 * it, and it drops for everyone the moment it is processed (it is no
 * longer awaiting), before the listener even resolves the rows.
 */
export async function countNewTransfers(
  db: TransferQueueDb,
  adminId: string,
): Promise<number> {
  const unread = await loadUnreadSubjects(db, adminId);
  if (unread.keys.size === 0) return 0;
  const [installments, fees] = await Promise.all([
    countNewInstallments(db, unread),
    countNewFees(db, unread),
  ]);
  return installments + fees;
}

// The Nouveau tab ignores the date window: `since` is irrelevant to it.
const nouveauContext = (unread: UnreadSubjects): QueueWhereContext => ({
  since: new Date(0),
  unread,
});

async function countNewInstallments(
  db: Pick<PrismaService, 'payment'>,
  unread: UnreadSubjects,
): Promise<number> {
  const where = installmentQueueWhere('nouveau', nouveauContext(unread));
  return where ? db.payment.count({ where }) : 0;
}

async function countNewFees(
  db: Pick<PrismaService, 'dentalOrder'>,
  unread: UnreadSubjects,
): Promise<number> {
  const where = treatmentFeeQueueWhere('nouveau', nouveauContext(unread));
  return where ? db.dentalOrder.count({ where }) : 0;
}
