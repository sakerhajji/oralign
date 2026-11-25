import { Injectable } from '@nestjs/common';
import { Prisma, ProductionEventOrigin } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ProductionPeriodQueryDto } from '../dto';
import type { ProductionSummary } from '../production.contract';
import { summarizeCountedRows } from './production-summary.aggregate';
import { resolveReportPeriod, type InstantRange } from './report-period';
import {
  adminEventWithOrderOf,
  CANCELLED_ORDER_BY,
  JOURNAL_ORDER_BY,
  orderRefOf,
  REPORT_EVENT_SELECT,
  REPORT_ORDER_REF_SELECT,
} from './report-views';

/**
 * The counted rows of a period (CONTRACT §2.2): live, entered through the
 * module (legacy_batch imports never count), performedAt in the period.
 * The [performedAt, type] index serves the range.
 */
export function countedRowsWhere(
  range: InstantRange,
): Prisma.ProductionEventWhereInput {
  return {
    performedAt: { gte: range.gte, lt: range.lt },
    cancelledAt: null,
    origin: ProductionEventOrigin.declared,
  };
}

/** What the recap aggregates: no note, reason or recipient over a year of rows. */
const RECAP_ROW_SELECT = {
  type: true,
  quantity: true,
  performedAt: true,
  // When the name / role snapshots were taken: the latest names the author.
  createdAt: true,
  createdById: true,
  createdByName: true,
  createdByRole: true,
  orderId: true,
  order: { select: REPORT_ORDER_REF_SELECT },
} satisfies Prisma.ProductionEventSelect;

type RecapRow = Prisma.ProductionEventGetPayload<{
  select: typeof RECAP_ROW_SELECT;
}>;

/**
 * GET production/admin/summary: the daily journal (from = to) or the
 * recap of a longer period. Two calls whatever the period: the counted
 * rows and the cancelled rows, aggregated in memory by Tunis day of
 * performedAt. Author names come from the row snapshots, never a join.
 */
@Injectable()
export class ProductionSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async summarize(query: ProductionPeriodQueryDto): Promise<ProductionSummary> {
    const period = resolveReportPeriod(query.from, query.to);
    const journal = period.from === period.to;
    const counted = countedRowsWhere(period.range);

    // The journal lists its rows, so it loads them whole and in order; the
    // recap only sums, so it loads the slim columns unsorted (a year of
    // rows sorted for nothing spilled to disk). Either way ONE call.
    const [journalRows, recapRows, cancelled] = await Promise.all([
      journal
        ? this.prisma.productionEvent.findMany({
            where: counted,
            orderBy: JOURNAL_ORDER_BY,
            select: REPORT_EVENT_SELECT,
          })
        : null,
      journal
        ? null
        : this.prisma.productionEvent.findMany({
            where: counted,
            select: RECAP_ROW_SELECT,
          }),
      this.prisma.productionEvent.findMany({
        where: {
          performedAt: { gte: period.range.gte, lt: period.range.lt },
          cancelledAt: { not: null },
        },
        orderBy: CANCELLED_ORDER_BY,
        select: REPORT_EVENT_SELECT,
      }),
    ]);

    const rows: RecapRow[] = journalRows ?? recapRows ?? [];
    const aggregates = summarizeCountedRows(
      rows.map((row) => ({
        type: row.type,
        quantity: row.quantity,
        performedAt: row.performedAt,
        createdAt: row.createdAt,
        createdById: row.createdById,
        createdByName: row.createdByName,
        createdByRole: row.createdByRole,
        order: orderRefOf(row.orderId, row.order),
      })),
    );

    return {
      from: period.from,
      to: period.to,
      mode: journal ? 'journal' : 'recap',
      ...aggregates,
      events: journalRows ? journalRows.map(adminEventWithOrderOf) : null,
      cancelled: cancelled.map(adminEventWithOrderOf),
    };
  }
}
