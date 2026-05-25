import { Injectable } from '@nestjs/common';
import { AdminDashboardService } from '../../dashboard/services/admin-dashboard.service';
import { ReportExportType, ReportSummaryDto } from '../dto/report.dto';

type CsvCell = string | number | boolean | null | undefined;
type ReportKpis = {
  range: { from: string; to: string };
};
type ReportTrendPoint = {
  date: string;
  revenue: number;
  orders: number;
  newDoctors: number;
  newPatients: number;
};
type ReportTrends = { points: ReportTrendPoint[] };
type ReportDoctorRow = {
  fullName: string;
  email: string;
  clinicName: string | null;
  city: string | null;
  orders: number;
  paidOrders: number;
  revenue: number;
  outstanding: number;
};
type ReportTopDoctors = { byOrders: ReportDoctorRow[] };
type ReportBestPack = {
  name: string;
  isActive: boolean;
  sold: number;
  revenue: number;
  collected: number;
  currentPrice: number;
  currency: string;
};

@Injectable()
export class ReportsService {
  constructor(private readonly adminDashboard: AdminDashboardService) {}

  async getSummary(filter: ReportSummaryDto) {
    const limit = filter.limit ?? 10;
    const range = { from: filter.from, to: filter.to };
    const [kpis, topDoctors, bestPacks, trends] = await Promise.all([
      this.adminDashboard.getKpis(range),
      this.adminDashboard.getTopDoctors({ ...range, limit }),
      this.adminDashboard.getBestPacks({ ...range, limit }),
      this.adminDashboard.getTrends(range),
    ]);
    const typedKpis = kpis as ReportKpis;

    return {
      generatedAt: new Date().toISOString(),
      range: typedKpis.range,
      kpis: typedKpis,
      topDoctors: topDoctors as ReportTopDoctors,
      bestPacks: bestPacks as ReportBestPack[],
      trends: trends as ReportTrends,
    };
  }

  async exportCsv(type: ReportExportType, filter: ReportSummaryDto) {
    const summary = await this.getSummary(filter);
    const fileName = this.fileName(type, summary.range);

    switch (type) {
      case 'revenue':
        return {
          fileName,
          content: this.toCsv(
            ['date', 'revenue_tnd', 'orders', 'new_doctors', 'new_patients'],
            summary.trends.points.map((p) => [
              p.date,
              p.revenue,
              p.orders,
              p.newDoctors,
              p.newPatients,
            ]),
          ),
        };
      case 'doctors':
        return {
          fileName,
          content: this.toCsv(
            [
              'doctor',
              'email',
              'clinic',
              'city',
              'orders',
              'paid_orders',
              'revenue_tnd',
              'outstanding_tnd',
            ],
            summary.topDoctors.byOrders.map((d) => [
              d.fullName,
              d.email,
              d.clinicName,
              d.city,
              d.orders,
              d.paidOrders,
              d.revenue,
              d.outstanding,
            ]),
          ),
        };
      case 'packs':
        return {
          fileName,
          content: this.toCsv(
            [
              'pack',
              'active',
              'sold',
              'revenue_tnd',
              'collected_tnd',
              'current_price',
              'currency',
            ],
            summary.bestPacks.map((p) => [
              p.name,
              p.isActive,
              p.sold,
              p.revenue,
              p.collected,
              p.currentPrice,
              p.currency,
            ]),
          ),
        };
    }
  }

  private toCsv(headers: string[], rows: CsvCell[][]): string {
    return [
      headers.map((h) => this.csvCell(h)).join(','),
      ...rows.map((row) => row.map((cell) => this.csvCell(cell)).join(',')),
    ].join('\r\n');
  }

  private csvCell(value: CsvCell): string {
    const text = value == null ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  private fileName(
    type: ReportExportType,
    range: { from: string; to: string },
  ): string {
    const from = range.from.slice(0, 10);
    const to = range.to.slice(0, 10);
    return `oralign-${type}-report-${from}-to-${to}.csv`;
  }
}
