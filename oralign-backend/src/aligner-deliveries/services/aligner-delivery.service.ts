import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { OrderAccessPolicy } from '../../common/access/order-access.policy';
import { Caller } from '../../common/access/caller';
import { ConflictException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ALIGNER_DELIVERY_ERROR,
  assertNoConflict,
  assertOrderAcceptsDeliveries,
  assertRangeWellFormed,
  assertTotalCoversDeliveries,
  assertWithinTotal,
  countDelivered,
  firstUndelivered,
  formatRange,
  mergeRanges,
  orderAcceptsDeliveries,
  parseDeliveryDate,
  rangeQuantity,
  resolveTotal,
  toIsoDate,
} from '../aligner-delivery.rules';
import {
  AlignerDeliverySummaryDto,
  RecordAlignerDeliveryDto,
  UpdateAlignerTotalDto,
} from '../dto/aligner-delivery.dto';

/** Columns of a delivery row the summary is built from. */
const deliverySelect = {
  id: true,
  fromAligner: true,
  toAligner: true,
  quantity: true,
  deliveredAt: true,
  createdByName: true,
  createdAt: true,
} satisfies Prisma.AlignerDeliverySelect;

type DeliveryRow = Prisma.AlignerDeliveryGetPayload<{
  select: typeof deliverySelect;
}>;

/**
 * Aligner delivery tracking for an order: an append-only log of the
 * aligner ranges physically handed to the patient.
 *
 * Every write runs in ONE transaction that first takes a row lock on the
 * parent order (`SELECT … FOR UPDATE`, the pattern OrderService uses for
 * tooth instructions). Two requests for the same order therefore
 * serialise: the second one reads the first one's committed row and is
 * refused as a duplicate/overlap instead of both passing the check. The
 * (orderId, fromAligner) unique index backs that up at the DB level.
 *
 * There is deliberately no update or delete: history is never rewritten.
 * Recording a delivery never changes the order status either — that is
 * the payment schedule's business (QuoteStepBatch), not this log's.
 */
@Injectable()
export class AlignerDeliveryService {
  private readonly logger = new Logger(AlignerDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrderAccessPolicy,
  ) {}

  /** Delivery summary + chronological log. Anyone who can read the order. */
  async getSummary(
    orderId: string,
    caller: Caller,
  ): Promise<AlignerDeliverySummaryDto> {
    const order = await this.access.requireReadable(orderId, caller);
    return this.loadSummary(order, caller);
  }

  /**
   * Record one delivery batch. On an order's first delivery the request
   * must also carry the series size, stored atomically with the row.
   */
  async record(
    orderId: string,
    dto: RecordAlignerDeliveryDto,
    caller: Caller,
    now: Date = new Date(),
  ): Promise<AlignerDeliverySummaryDto> {
    // Cheap checks first, outside the lock: a caller who may not touch
    // this order never gets to hold its row lock.
    const readable = await this.access.requireReadable(orderId, caller);
    this.access.assertCanRecordDelivery(readable, caller);

    const range = { fromAligner: dto.fromAligner, toAligner: dto.toAligner };
    assertRangeWellFormed(range);
    const deliveredAt = parseDeliveryDate(dto.deliveredAt, now);

    try {
      await this.prisma.$transaction(async (tx) => {
        const order = await this.lockOrder(tx, orderId);
        assertOrderAcceptsDeliveries(order.status);

        const total = resolveTotal(order.totalAligners, dto.totalAligners);
        assertWithinTotal(range, total);

        // Read under the lock: nothing can be inserted between this read
        // and the create below.
        const existing = await tx.alignerDelivery.findMany({
          where: { orderId },
          select: { fromAligner: true, toAligner: true, deliveredAt: true },
        });
        assertNoConflict(range, existing);

        if (order.totalAligners === null) {
          await tx.dentalOrder.update({
            where: { id: orderId },
            data: { totalAligners: total },
          });
        }

        const actor = await tx.user.findUnique({
          where: { id: caller.userId },
          select: { fullName: true },
        });
        await tx.alignerDelivery.create({
          data: {
            orderId,
            fromAligner: range.fromAligner,
            toAligner: range.toAligner,
            quantity: rangeQuantity(range),
            deliveredAt,
            createdById: caller.userId,
            createdByName: actor?.fullName ?? null,
          },
        });
      });
    } catch (error) {
      // The unique index fired: a concurrent identical request committed
      // first. Report it the way the lock path would have.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Aligners ${formatRange(range)} were already delivered.`,
          ALIGNER_DELIVERY_ERROR.DUPLICATE,
        );
      }
      throw error;
    }

    this.logger.log(
      `Aligners ${formatRange(range)} delivered on ${toIsoDate(deliveredAt)} for order ${readable.orderCode} (by ${caller.userId})`,
    );
    return this.loadSummary(readable, caller);
  }

  /**
   * Correct the series size. Never below the highest aligner already
   * delivered — the log stays consistent with the total it is read against.
   */
  async setTotal(
    orderId: string,
    dto: UpdateAlignerTotalDto,
    caller: Caller,
  ): Promise<AlignerDeliverySummaryDto> {
    const readable = await this.access.requireReadable(orderId, caller);
    this.access.assertCanRecordDelivery(readable, caller);

    await this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      assertOrderAcceptsDeliveries(order.status);
      const existing = await tx.alignerDelivery.findMany({
        where: { orderId },
        select: { fromAligner: true, toAligner: true },
      });
      assertTotalCoversDeliveries(dto.totalAligners, existing);
      await tx.dentalOrder.update({
        where: { id: orderId },
        data: { totalAligners: dto.totalAligners },
      });
    });

    return this.loadSummary(readable, caller);
  }

  /**
   * Row-lock the order for the rest of the transaction and re-read the
   * fields the rules need. Re-checks soft deletion: the order may have
   * been archived between the access check and the lock.
   */
  private async lockOrder(tx: Prisma.TransactionClient, orderId: string) {
    await tx.$queryRaw`SELECT id FROM "DentalOrder" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.dentalOrder.findUnique({
      where: { id: orderId },
      select: { status: true, totalAligners: true, deletedAt: true },
    });
    if (!order || order.deletedAt) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  private async loadSummary(
    order: { id: string; doctorId: string; status: OrderStatus },
    caller: Caller,
  ): Promise<AlignerDeliverySummaryDto> {
    const [series, rows] = await Promise.all([
      this.prisma.dentalOrder.findUnique({
        where: { id: order.id },
        select: { totalAligners: true },
      }),
      this.prisma.alignerDelivery.findMany({
        where: { orderId: order.id },
        select: deliverySelect,
        orderBy: [{ deliveredAt: 'asc' }, { fromAligner: 'asc' }],
      }),
    ]);
    return buildSummary({
      orderId: order.id,
      totalAligners: series?.totalAligners ?? null,
      rows,
      acceptsDeliveries: orderAcceptsDeliveries(order.status),
      canRecord: this.access.canRecordDelivery(order, caller),
    });
  }
}

/**
 * Pure projection of persisted rows into the API summary. Exported for
 * the unit tests; every derived number comes from the rules module.
 */
export function buildSummary(input: {
  orderId: string;
  totalAligners: number | null;
  rows: readonly DeliveryRow[];
  acceptsDeliveries: boolean;
  canRecord: boolean;
}): AlignerDeliverySummaryDto {
  const { orderId, totalAligners, rows } = input;
  const deliveredCount = countDelivered(rows);
  const nextAligner = firstUndelivered(rows, totalAligners);
  return {
    orderId,
    totalAligners,
    deliveredCount,
    remainingCount:
      totalAligners === null
        ? null
        : Math.max(totalAligners - deliveredCount, 0),
    deliveredRanges: mergeRanges(rows),
    nextAligner,
    isComplete: totalAligners !== null && nextAligner === null,
    acceptsDeliveries: input.acceptsDeliveries,
    canRecord: input.canRecord,
    deliveries: rows.map((row) => ({
      id: row.id,
      fromAligner: row.fromAligner,
      toAligner: row.toAligner,
      quantity: row.quantity,
      deliveredAt: toIsoDate(row.deliveredAt),
      createdByName: row.createdByName,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
