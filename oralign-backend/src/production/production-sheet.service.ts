import { Injectable } from '@nestjs/common';
import { ProductionEventOrigin } from '@prisma/client';
import type { Caller } from '../common/access/caller';
import { OrderAccessPolicy } from '../common/access/order-access.policy';
import { NotFoundException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { sheetVersionOf } from './kernel';
import { orderFactsOf } from './production-state';
import {
  PRODUCTION_ERROR,
  type ProductionCaseSheet,
} from './production.contract';
import {
  nextStepFromOf,
  toEventView,
  toOrderSummaryWith,
  toReleasedRanges,
} from './production.mapper';
import { declareWindowOf, isRestricted } from './production.rules';
import { EVENT_VIEW_SELECT, SHEET_ORDER_SELECT } from './production.selects';

/**
 * GET production/orders/:orderId, the case sheet: counters, planned
 * totals, the release block and the released step ranges (never an
 * amount, an installment or a batch id), the next RELEASED steps per act,
 * the declare window and the whole history. Two calls (the order with its
 * nested whitelist, 9 statements; its events, 1), run in parallel; access
 * is decided in memory from them, so a refused technician costs nothing
 * more. The release reads the same facts a declaration is checked against.
 */
@Injectable()
export class ProductionSheetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrderAccessPolicy,
  ) {}

  async get(
    orderId: string,
    caller: Caller,
    now: Date = new Date(),
  ): Promise<ProductionCaseSheet> {
    const [order, events] = await Promise.all([
      this.prisma.dentalOrder.findUnique({
        where: { id: orderId },
        select: SHEET_ORDER_SELECT,
      }),
      this.prisma.productionEvent.findMany({
        where: { orderId },
        orderBy: [
          { performedAt: 'desc' },
          { createdAt: 'desc' },
          { arch: 'asc' },
          { id: 'asc' },
        ],
        select: EVENT_VIEW_SELECT,
      }),
    ]);
    if (!order || order.deletedAt)
      throw new NotFoundException('Order not found');
    const facts = orderFactsOf(order);
    this.access.assertCanReadForProduction(
      {
        status: order.status,
        deletedAt: order.deletedAt,
        hasReleasedBatch: facts.hasReleasedBatch,
        hasDeclaredEvent: events.some(
          (event) => event.origin === ProductionEventOrigin.declared,
        ),
      },
      caller,
    );

    const summary = toOrderSummaryWith(order, facts);
    const canDeclare = this.access.canProduce(
      {
        status: order.status,
        deletedAt: order.deletedAt,
        hasReleasedBatch: facts.hasReleasedBatch,
      },
      caller,
    );
    return {
      ...summary,
      clinicName: order.doctor.dentistProfile?.clinicName ?? null,
      firstActionAt:
        order.productionProgress?.firstActionAt?.toISOString() ?? null,
      releasedRanges: toReleasedRanges(
        facts.quote ? facts.batches : null,
        facts,
      ),
      nextStepFrom: nextStepFromOf(events, summary.planned, facts.released),
      canDeclare,
      cannotDeclareReason: canDeclare
        ? null
        : PRODUCTION_ERROR.ORDER_NOT_IN_PRODUCTION,
      declareWindow: declareWindowOf({
        now,
        orderCreatedAt: order.createdAt,
        restricted: isRestricted(caller),
      }),
      history: events.map((event) => toEventView(event, caller, now)),
      sheetVersion: sheetVersionOf(order.productionProgress),
    };
  }
}
