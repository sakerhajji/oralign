import { Injectable } from '@nestjs/common';
import {
  BatchStatus,
  Prisma,
  ProductionEventOrigin,
  ProductionNoticeStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ProductionPeriodQueryDto } from '../dto';
import type { ProductionAnomalies } from '../production.contract';
import {
  countersFromProgress,
  PLANNED_TOTALS_ORDER_SELECT,
  plannedTotalsInputOf,
  productionHistoryWhere,
  PROGRESS_COUNTERS_SELECT,
  resolvePlannedTotals,
  treatedArches,
} from '../kernel';
import {
  detectAnomalies,
  type AnomalyNotice,
  type AnomalyOrder,
  type AnomalyPeriodEvent,
} from './production-anomalies.rules';
import {
  exhaustedNoticeWhere,
  RETRYABLE_SKIP_REASONS,
} from './production-notices.view';
import { resolveReportPeriod } from './report-period';

/** The period's declared rows, live and cancelled (3 statements: + order + patient). */
const PERIOD_EVENT_SELECT = {
  id: true,
  orderId: true,
  type: true,
  arch: true,
  stepFrom: true,
  stepTo: true,
  performedAt: true,
  warnings: true,
  cancelledAt: true,
  order: {
    select: { orderCode: true, patient: { select: { fullName: true } } },
  },
} satisfies Prisma.ProductionEventSelect;

/**
 * The touched cases with their current state (7 statements): order +
 * approved plan + quotation + its production-delivered batches + patient
 * + progress + live events. No nested `alignerDeliveries take: 1`: without
 * relationJoins Prisma applies it in memory, after loading every hand-over
 * of every case. A groupBy gives the earliest one instead.
 */
const TOUCHED_ORDER_SELECT = {
  id: true,
  orderCode: true,
  status: true,
  coverageStartedAt: true,
  ...PLANNED_TOTALS_ORDER_SELECT,
  quotation: {
    select: {
      ...PLANNED_TOTALS_ORDER_SELECT.quotation.select,
      stepBatches: {
        where: { status: BatchStatus.delivered, deliveredByProduction: true },
        select: { fromStep: true, toStep: true },
        orderBy: [{ fromStep: 'asc' }, { batchNumber: 'asc' }],
      },
    },
  },
  patient: { select: { fullName: true } },
  productionProgress: { select: PROGRESS_COUNTERS_SELECT },
  productionEvents: {
    where: { cancelledAt: null },
    select: {
      id: true,
      type: true,
      arch: true,
      stepFrom: true,
      stepTo: true,
      performedAt: true,
    },
  },
} satisfies Prisma.DentalOrderSelect;

type TouchedOrderRow = Prisma.DentalOrderGetPayload<{
  select: typeof TOUCHED_ORDER_SELECT;
}>;

/** Notices that ended without a send, with their case (3 statements). */
const NOTICE_ANOMALY_SELECT = {
  id: true,
  orderId: true,
  eventIds: true,
  status: true,
  attempts: true,
  skipReason: true,
  lastError: true,
  updatedAt: true,
  order: {
    select: { orderCode: true, patient: { select: { fullName: true } } },
  },
} satisfies Prisma.ProductionNoticeSelect;

function anomalyOrderOf(
  row: TouchedOrderRow,
  firstAlignerDeliveryAt: Date | null,
): AnomalyOrder {
  const input = plannedTotalsInputOf(row);
  const liveQuote =
    row.quotation && !row.quotation.deletedAt ? row.quotation : null;
  return {
    orderId: row.id,
    orderCode: row.orderCode,
    patientName: row.patient.fullName,
    status: row.status,
    coverageStartedAt: row.coverageStartedAt,
    planned: resolvePlannedTotals(input),
    treatedArches: treatedArches(input),
    counters: countersFromProgress(row.productionProgress),
    lastActionAt: row.productionProgress?.lastActionAt ?? null,
    liveEvents: row.productionEvents,
    productionBatches: liveQuote?.stepBatches ?? [],
    firstAlignerDeliveryAt,
  };
}

/**
 * GET production/admin/anomalies ("Écarts"). At most FIVE calls whatever
 * the period or the number of cases (≤ 15 statements, CONTRACT §2.2 #13),
 * in two parallel rounds:
 *   1. the period's declared rows, the cases whose last action falls in
 *      the period, the notices;
 *   2. only when round 1 touched a case: those cases by id, and their
 *      earliest AlignerDelivery.
 * The touched ids come from the index side first (performedAt, lastActionAt):
 * one OR of two relation filters on DentalOrder made Postgres scan every
 * order and hash every declared event ever, a cost that grows with the
 * whole history and crosses the JIT thresholds. Everything else is the
 * pure detection of production-anomalies.rules.ts.
 */
@Injectable()
export class ProductionAnomaliesService {
  constructor(private readonly prisma: PrismaService) {}

  async detect(query: ProductionPeriodQueryDto): Promise<ProductionAnomalies> {
    const period = resolveReportPeriod(query.from, query.to);
    const performedAt = { gte: period.range.gte, lt: period.range.lt };

    const [events, lastActions, notices] = await Promise.all([
      this.prisma.productionEvent.findMany({
        where: {
          performedAt,
          origin: ProductionEventOrigin.declared,
          order: { deletedAt: null },
        },
        select: PERIOD_EVENT_SELECT,
      }),
      // Cases whose last action falls in the period (finished_incomplete,
      // planned_total_unknown), provided they were produced through the
      // module at all (D5: the legacy import alone never raises an
      // anomaly). AND-only, so the planner starts from the lastActionAt
      // index and checks the history per row on the event orderId index.
      this.prisma.productionProgress.findMany({
        where: {
          lastActionAt: performedAt,
          order: { deletedAt: null, ...productionHistoryWhere() },
        },
        select: { orderId: true },
      }),
      this.prisma.productionNotice.findMany({
        where: {
          updatedAt: performedAt,
          order: { deletedAt: null },
          OR: [
            exhaustedNoticeWhere(),
            {
              status: ProductionNoticeStatus.skipped,
              skipReason: { in: [...RETRYABLE_SKIP_REASONS] },
            },
          ],
        },
        select: NOTICE_ANOMALY_SELECT,
      }),
    ]);

    // A case is touched by a declared row of the period or by its last action.
    const orders = await this.touchedOrders([
      ...new Set([
        ...events.map((row) => row.orderId),
        ...lastActions.map((row) => row.orderId),
      ]),
    ]);

    const { items, countsByKind } = detectAnomalies({
      range: period.range,
      events: events.map(
        (row): AnomalyPeriodEvent => ({
          id: row.id,
          orderId: row.orderId,
          orderCode: row.order.orderCode,
          patientName: row.order.patient.fullName,
          type: row.type,
          arch: row.arch,
          stepFrom: row.stepFrom,
          stepTo: row.stepTo,
          performedAt: row.performedAt,
          warnings: row.warnings,
          cancelledAt: row.cancelledAt,
        }),
      ),
      orders,
      notices: notices.map(
        (row): AnomalyNotice => ({
          id: row.id,
          orderId: row.orderId,
          orderCode: row.order.orderCode,
          patientName: row.order.patient.fullName,
          eventIds: row.eventIds,
          status: row.status,
          attempts: row.attempts,
          skipReason: row.skipReason,
          lastError: row.lastError,
          updatedAt: row.updatedAt,
        }),
      ),
    });

    return { from: period.from, to: period.to, items, countsByKind };
  }

  /**
   * The touched cases by id, with their earliest AlignerDelivery: two
   * parallel calls (8 statements), none when nothing was touched. The
   * groupBy returns at most one row per case, from the (orderId,
   * deliveredAt) index. deletedAt is checked again: a case archived
   * between the two rounds drops out.
   */
  private async touchedOrders(ids: string[]): Promise<AnomalyOrder[]> {
    if (ids.length === 0) return [];
    const [rows, firstDeliveries] = await Promise.all([
      this.prisma.dentalOrder.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: TOUCHED_ORDER_SELECT,
      }),
      this.prisma.alignerDelivery.groupBy({
        by: ['orderId'],
        where: { orderId: { in: ids } },
        _min: { deliveredAt: true },
      }),
    ]);
    const firstDeliveryAt = new Map(
      firstDeliveries.map((row) => [row.orderId, row._min.deliveredAt]),
    );
    return rows.map((row) =>
      anomalyOrderOf(row, firstDeliveryAt.get(row.id) ?? null),
    );
  }
}
