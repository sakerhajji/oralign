import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isAdmin, type Caller } from '../common/access/caller';
import { OrderAccessPolicy } from '../common/access/order-access.policy';
import { PaginatedResponse } from '../common/dto/response.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ProductionQueueQueryDto, ProductionQueueTabParam } from './dto';
import {
  productionDoneWhere,
  productionQueueWhere,
  productionTechnicianDoneWhere,
} from './kernel';
import { DEFAULT_PAGE_SIZE } from './production.constants';
import type { ProductionQueuePage } from './production.contract';
import { toOrderSummary } from './production.mapper';
import { ORDER_SUMMARY_SELECT } from './production.selects';
import {
  ACTIVE_QUEUE_ORDER_BY,
  DONE_QUEUE_ORDER_BY,
  productionSearchWhere,
} from './production-queue.query';

/**
 * GET production/queue: the cases "à fabriquer" (D3) and the "Terminés"
 * tab. Two calls whatever the page size (count + one findMany whose
 * nested selects are batched, ≤ 8 statements); the counters come from
 * the ProductionProgress projection, never from the events.
 */
@Injectable()
export class ProductionQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrderAccessPolicy,
  ) {}

  async list(
    query: ProductionQueueQueryDto,
    caller: Caller,
  ): Promise<ProductionQueuePage> {
    // Refuses any role without a production scope (403) before reading.
    this.access.productionReadScope(caller);
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const done = query.tab === ProductionQueueTabParam.done;
    // The technician's "Terminés" never lists legacy-only cases (D5).
    const tabWhere = done
      ? isAdmin(caller)
        ? productionDoneWhere()
        : productionTechnicianDoneWhere()
      : productionQueueWhere();
    const where: Prisma.DentalOrderWhereInput = {
      AND: [tabWhere, productionSearchWhere(query.search)],
    };

    const [total, rows] = await Promise.all([
      this.prisma.dentalOrder.count({ where }),
      this.prisma.dentalOrder.findMany({
        where,
        orderBy: done ? DONE_QUEUE_ORDER_BY : ACTIVE_QUEUE_ORDER_BY,
        skip: (page - 1) * limit,
        take: limit,
        select: ORDER_SUMMARY_SELECT,
      }),
    ]);
    return new PaginatedResponse(
      rows.map(toOrderSummary),
      total,
      page,
      limit,
      Math.ceil(total / limit),
    );
  }
}
