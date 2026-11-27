import { Injectable } from '@nestjs/common';
import { type Caller, isAdmin } from '../../common/access/caller';
import { ForbiddenException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { countQueueTabs, loadUnreadSubjects } from './transfer-queue.query';
import {
  INSTALLMENT_QUEUE_ORDER,
  INSTALLMENT_QUEUE_SELECT,
  installmentQueueRow,
  installmentQueueWhere,
  mergeQueuePage,
  type QueueRunItem,
  queuePaging,
  recentSince,
  TREATMENT_FEE_QUEUE_ORDER,
  TREATMENT_FEE_QUEUE_SELECT,
  treatmentFeeQueueRow,
  treatmentFeeQueueWhere,
  type TransferQueuePage,
  type TransferQueueQuery,
  type TransferQueueRow,
} from './transfer-queue.rules';

// The contract (CONTRACT.md §2.4) lives with the rules; re-exported here,
// its documented home, for the controller and every other importer.
export {
  TRANSFER_QUEUE_FILTERS,
  TRANSFER_QUEUE_RECENT_DAYS,
  type TransferQueueAmounts,
  type TransferQueueFilter,
  type TransferQueuePage,
  type TransferQueueQuery,
  type TransferQueueRow,
} from './transfer-queue.rules';

/**
 * The admin "Paiements en attente" desk: ONE merged queue of the
 * bank-transfer declarations of pack installments (Payment rows) and of
 * treatment fees (DentalOrder columns), CONTRACT.md §2.4.
 *
 * One page costs, in three waves: my unread subject keys (1 indexed read);
 * the tab counts (4) beside the two sorted runs of light rows (2); the
 * page's rows hydrated by id (≤ 2). Never a file path in a row: hasProof,
 * the receipt itself through the authenticated proof routes.
 */
@Injectable()
export class TransferQueueService {
  constructor(private readonly prisma: PrismaService) {}

  /** The queue page of one tab (admin and super_admin only). */
  async list(
    caller: Caller,
    query: TransferQueueQuery,
  ): Promise<TransferQueuePage> {
    if (!isAdmin(caller)) throw new ForbiddenException('Admin-only.');
    const { filter, page, limit, skip } = queuePaging(query);
    const unread = await loadUnreadSubjects(this.prisma, caller.userId);
    const ctx = { since: recentSince(new Date()), unread };
    const installmentWhere = installmentQueueWhere(filter, ctx);
    const feeWhere = treatmentFeeQueueWhere(filter, ctx);
    const window = skip + limit;

    const [counts, installmentRun, feeRun] = await Promise.all([
      countQueueTabs(this.prisma, ctx),
      installmentWhere
        ? this.prisma.payment.findMany({
            where: installmentWhere,
            orderBy: INSTALLMENT_QUEUE_ORDER,
            take: window,
            select: { id: true, declaredAt: true },
          })
        : Promise.resolve([]),
      feeWhere
        ? this.prisma.dentalOrder.findMany({
            where: feeWhere,
            orderBy: TREATMENT_FEE_QUEUE_ORDER,
            take: window,
            select: { id: true, treatmentFeeDeclaredAt: true },
          })
        : Promise.resolve([]),
    ]);

    const pageItems = mergeQueuePage(
      installmentRun.map(
        (row): QueueRunItem => ({
          kind: 'installment',
          id: row.id,
          declaredAt: row.declaredAt,
        }),
      ),
      feeRun.map(
        (row): QueueRunItem => ({
          kind: 'treatment_fee',
          id: row.id,
          declaredAt: row.treatmentFeeDeclaredAt,
        }),
      ),
      skip,
      limit,
    );
    const data = await this.hydrate(pageItems, unread.keys);
    const total = counts[filter];
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      counts,
    };
  }

  /** The page's full rows, by id, in the merged order. */
  private async hydrate(
    items: QueueRunItem[],
    unreadKeys: ReadonlySet<string>,
  ): Promise<TransferQueueRow[]> {
    const paymentIds = items
      .filter((item) => item.kind === 'installment')
      .map((item) => item.id);
    const orderIds = items
      .filter((item) => item.kind === 'treatment_fee')
      .map((item) => item.id);
    const [payments, orders] = await Promise.all([
      paymentIds.length > 0
        ? this.prisma.payment.findMany({
            where: { id: { in: paymentIds } },
            select: INSTALLMENT_QUEUE_SELECT,
          })
        : Promise.resolve([]),
      orderIds.length > 0
        ? this.prisma.dentalOrder.findMany({
            where: { id: { in: orderIds } },
            select: TREATMENT_FEE_QUEUE_SELECT,
          })
        : Promise.resolve([]),
    ]);
    const paymentById = new Map(payments.map((row) => [row.id, row]));
    const orderById = new Map(orders.map((row) => [row.id, row]));
    return items.flatMap((item): TransferQueueRow[] => {
      if (item.kind === 'installment') {
        const payment = paymentById.get(item.id);
        return payment ? [installmentQueueRow(payment, unreadKeys)] : [];
      }
      const order = orderById.get(item.id);
      return order ? [treatmentFeeQueueRow(order, unreadKeys)] : [];
    });
  }
}
