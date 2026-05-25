import apiClient from './client';
import type { DashboardRange, ReportExportType, ReportSummary } from '@/lib/types';

function serialiseRange(
  range?: DashboardRange & { limit?: number },
): Record<string, unknown> {
  if (!range) return {};
  const out: Record<string, unknown> = {};
  if (range.from) out.from = range.from;
  if (range.to) out.to = range.to;
  if (range.limit) out.limit = range.limit;
  return out;
}

function fileNameFromDisposition(value: string | undefined): string | null {
  if (!value) return null;
  const utf = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf?.[1]) return decodeURIComponent(utf[1]);
  const plain = value.match(/filename="?([^"]+)"?/i);
  return plain?.[1] ?? null;
}

export const reportsService = {
  async summary(range?: DashboardRange & { limit?: number }): Promise<ReportSummary> {
    const res = await apiClient.get<ReportSummary>('/reports/summary', {
      params: serialiseRange(range),
    });
    return res.data;
  },

  async downloadCsv(
    type: ReportExportType,
    range?: DashboardRange & { limit?: number },
  ): Promise<void> {
    const res = await apiClient.get<Blob>(`/reports/export/${type}`, {
      params: serialiseRange(range),
      responseType: 'blob',
    });
    const blobUrl = URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download =
      fileNameFromDisposition(res.headers['content-disposition']) ??
      `oralign-${type}-report.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
  },
};
