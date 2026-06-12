'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { reportsService } from '@/lib/api/reports.service';
import { extractApiErrorMessage } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import type { DashboardRange, ReportExportType } from '@/lib/types';

export const reportKeys = {
  all: ['reports'] as const,
  summary: (range?: DashboardRange & { limit?: number }) =>
    [...reportKeys.all, 'summary', range ?? {}] as const,
};

export function useReportSummary(
  range?: DashboardRange & { limit?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: reportKeys.summary(range),
    queryFn: () => reportsService.summary(range),
    enabled,
    staleTime: 30_000,
  });
}

export function useDownloadReportCsv() {
  const { t } = useT();
  return useMutation({
    mutationFn: ({
      type,
      range,
    }: {
      type: ReportExportType;
      range?: DashboardRange & { limit?: number };
    }) => reportsService.downloadCsv(type, range),
    onSuccess: () => toast.success(t('toasts.reports.exported')),
    onError: (err) => toast.error(extractApiErrorMessage(err)),
  });
}
