import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ProductionProgressQueryDto } from '../dto';
import type { ProductionProgressPage } from '../production.contract';
import {
  PROGRESS_ORDER_BY,
  PROGRESS_ROW_SELECT,
  progressRowOf,
  progressWhere,
} from './production-progress.view';
import { pageOf, pagingOf } from './report-views';

/**
 * GET production/admin/progress. Two calls whatever the page size (count
 * + one findMany with a nested whitelist); counters come from the
 * ProductionProgress projection, so no event is ever aggregated here.
 */
@Injectable()
export class ProductionProgressReportService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: ProductionProgressQueryDto,
  ): Promise<ProductionProgressPage> {
    const where = progressWhere(query.state, query.search);
    const paging = pagingOf(query);
    const [total, rows] = await Promise.all([
      this.prisma.dentalOrder.count({ where }),
      this.prisma.dentalOrder.findMany({
        where,
        select: PROGRESS_ROW_SELECT,
        orderBy: PROGRESS_ORDER_BY,
        skip: paging.skip,
        take: paging.limit,
      }),
    ]);
    return pageOf(rows.map(progressRowOf), total, paging);
  }
}
