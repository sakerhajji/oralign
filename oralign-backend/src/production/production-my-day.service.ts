import { Injectable } from '@nestjs/common';
import type { Caller } from '../common/access/caller';
import { OrderAccessPolicy } from '../common/access/order-access.policy';
import {
  businessDayRange,
  businessToday,
  shiftCalendarDay,
} from '../common/time/business-day';
import { PrismaService } from '../prisma/prisma.service';
import { ProductionMyDayParam, ProductionMyDayQueryDto } from './dto';
import { emptyActTotals } from './kernel';
import type { ProductionMyDay } from './production.contract';
import { toEventWithOrder } from './production.mapper';
import { EVENT_WITH_ORDER_SELECT } from './production.selects';

/**
 * GET production/my-day: what the CALLER declared on a Tunis day (by
 * createdAt: what she typed today, whatever day the acts happened), with
 * her totals per act. Admins get their own rows the same way. One call,
 * three statements (events, order, patient).
 */
@Injectable()
export class ProductionMyDayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrderAccessPolicy,
  ) {}

  async get(
    query: ProductionMyDayQueryDto,
    caller: Caller,
    now: Date = new Date(),
  ): Promise<ProductionMyDay> {
    this.access.productionReadScope(caller);
    const today = businessToday(now);
    const day =
      query.day === ProductionMyDayParam.yesterday
        ? shiftCalendarDay(today, -1)
        : today;
    const rows = await this.prisma.productionEvent.findMany({
      where: {
        createdById: caller.userId,
        createdAt: businessDayRange(day, day),
      },
      orderBy: [{ createdAt: 'desc' }, { arch: 'asc' }, { id: 'asc' }],
      select: EVENT_WITH_ORDER_SELECT,
    });

    const totals = emptyActTotals();
    for (const row of rows) {
      if (row.cancelledAt) continue;
      totals[row.type].entries += 1;
      totals[row.type].quantity += row.quantity;
    }
    return {
      day,
      totals,
      events: rows.map((row) => toEventWithOrder(row, caller, now)),
    };
  }
}
