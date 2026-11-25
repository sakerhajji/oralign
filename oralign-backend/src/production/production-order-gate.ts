import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { isAdmin, type Caller } from '../common/access/caller';
import { OrderAccessPolicy } from '../common/access/order-access.policy';
import {
  ForbiddenException,
  NotFoundException,
} from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PRODUCTION_ERROR } from './production.contract';

/**
 * The access check of every `production/orders/:orderId/*` read
 * (CONTRACT §1): the caller's production scope goes INTO the query, so a
 * readable order costs one call (the scope is relation filters, one
 * statement) and the loader's own select rides along with it. Only a miss
 * costs a second, tiny lookup telling 404 (missing or soft-deleted) from
 * 403 ORDER_NOT_IN_PRODUCTION; an admin's scope is "not deleted", so his
 * miss is a 404 straight away.
 */
@Injectable()
export class ProductionOrderGate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrderAccessPolicy,
  ) {}

  /**
   * `load` runs ONE query with the given where (typically
   * `dentalOrder.findFirst({ where, select })`) and returns null on a miss.
   */
  async requireReadable<T>(
    orderId: string,
    caller: Caller,
    load: (where: Prisma.DentalOrderWhereInput) => Promise<T | null>,
  ): Promise<T> {
    const scope = this.access.productionReadScope(caller);
    const row = await load({ id: orderId, ...scope });
    if (row) return row;
    if (isAdmin(caller)) throw new NotFoundException('Order not found');
    const order = await this.prisma.dentalOrder.findUnique({
      where: { id: orderId },
      select: { deletedAt: true },
    });
    if (!order || order.deletedAt) {
      throw new NotFoundException('Order not found');
    }
    throw new ForbiddenException(
      'This case is not in production.',
      PRODUCTION_ERROR.ORDER_NOT_IN_PRODUCTION,
    );
  }
}
