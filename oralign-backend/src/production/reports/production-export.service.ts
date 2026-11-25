import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductionExportFormat, type ProductionExportQueryDto } from '../dto';
import {
  dailyCsv,
  detailCsv,
  productionExportFileName,
} from './production-export.csv';
import { resolveReportPeriod } from './report-period';
import { JOURNAL_ORDER_BY } from './report-views';

/** The detail line: the event + order, patient and practitioner (4 statements). */
const DETAIL_ROW_SELECT = {
  type: true,
  arch: true,
  stepFrom: true,
  stepTo: true,
  quantity: true,
  performedAt: true,
  createdAt: true,
  createdByName: true,
  createdByRole: true,
  deliveredTo: true,
  deliveredToName: true,
  note: true,
  warnings: true,
  origin: true,
  cancelledAt: true,
  cancelledByName: true,
  cancelReason: true,
  order: {
    select: {
      orderCode: true,
      patient: { select: { fullName: true } },
      doctor: { select: { fullName: true } },
    },
  },
} satisfies Prisma.ProductionEventSelect;

/** The daily sums need five columns and no relation (1 statement). */
const DAILY_ROW_SELECT = {
  type: true,
  quantity: true,
  performedAt: true,
  origin: true,
  cancelledAt: true,
} satisfies Prisma.ProductionEventSelect;

export interface ProductionCsvFile {
  content: string;
  fileName: string;
}

/**
 * GET production/admin/export.csv. ONE call: every event with performedAt
 * in the period, cancelled and legacy rows included (the detail flags
 * them; the daily sums skip them), in journal order.
 */
@Injectable()
export class ProductionExportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(query: ProductionExportQueryDto): Promise<ProductionCsvFile> {
    const period = resolveReportPeriod(query.from, query.to);
    const format = query.format ?? ProductionExportFormat.detail;
    const where: Prisma.ProductionEventWhereInput = {
      performedAt: { gte: period.range.gte, lt: period.range.lt },
    };

    const content =
      format === ProductionExportFormat.daily
        ? dailyCsv(
            await this.prisma.productionEvent.findMany({
              where,
              select: DAILY_ROW_SELECT,
            }),
          )
        : detailCsv(
            await this.prisma.productionEvent.findMany({
              where,
              select: DETAIL_ROW_SELECT,
              orderBy: JOURNAL_ORDER_BY,
            }),
          );

    return {
      content,
      fileName: productionExportFileName(period.from, period.to, format),
    };
  }
}
