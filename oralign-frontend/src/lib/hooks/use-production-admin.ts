'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { classifyApiError } from '@/lib/api/error';
import { productionService } from '@/lib/api/production.service';
import { useT } from '@/lib/i18n/lang-context';
import { productionErrorCodeText, type Translate } from '@/lib/production/errors';
import { toast } from '@/lib/toast';
import {
  type ProductionAnomalies,
  type ProductionExportParams,
  type ProductionNoticePage,
  type ProductionNoticesParams,
  type ProductionNoticeView,
  type ProductionPeriodParams,
  type ProductionProgressPage,
  type ProductionProgressParams,
  type ProductionSummary,
} from '@/lib/types/production';

/**
 * The production admin desk (/dashboard/production/pilotage): one query
 * per endpoint of ProductionAdminController, under one key root so the
 * desk's refresh (and anything that changes production) can invalidate it
 * all at once. Paged lists keep their rows on screen while the next page
 * or filter loads (`keepPreviousData`); the views read the
 * `isPlaceholderData` flag to dim them meanwhile.
 */
export const productionAdminKeys = {
  all: ['productionAdmin'] as const,
  summaries: () => [...productionAdminKeys.all, 'summary'] as const,
  summary: (period: ProductionPeriodParams) =>
    [...productionAdminKeys.summaries(), period] as const,
  progressLists: () => [...productionAdminKeys.all, 'progress'] as const,
  progress: (params: ProductionProgressParams) =>
    [...productionAdminKeys.progressLists(), params] as const,
  anomalyLists: () => [...productionAdminKeys.all, 'anomalies'] as const,
  anomalies: (period: ProductionPeriodParams) =>
    [...productionAdminKeys.anomalyLists(), period] as const,
  noticeLists: () => [...productionAdminKeys.all, 'notices'] as const,
  notices: (params: ProductionNoticesParams) =>
    [...productionAdminKeys.noticeLists(), params] as const,
};

/** Everything on the desk refetches: after a declaration elsewhere, or the refresh button. */
export function invalidateProductionAdmin(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: productionAdminKeys.all });
}

// Technicians declare all day long: figures older than this refetch when
// a view is opened or the window regains focus.
const STALE_MS = 30_000;
/** A period that covers today refreshes itself this often (the lab keeps working). */
const LIVE_REFRESH_MS = 60_000;
/** While a notice is on its way, its row is polled to show the outcome. */
const NOTICE_POLL_MS = 15_000;

/**
 * A failed admin call in the UI language: a production error code maps to
 * `production.errors.*`, the one mapping the technician screens use too
 * (INVALID_DATE_RANGE and NOTICE_NOT_RETRYABLE are the desk's own);
 * anything else (offline, timeout, a restarting API, a 404) gets the
 * classified message: a read, not "the entry could not be saved".
 */
export function productionAdminErrorText(error: unknown, t: Translate): string {
  return productionErrorCodeText(t, error) ?? classifyApiError(error).message;
}

/** Journal (from = to) or recap. `live`: the period holds today. */
export function useProductionSummary(
  period: ProductionPeriodParams,
  { live = false }: { live?: boolean } = {},
): UseQueryResult<ProductionSummary, Error> {
  return useQuery<ProductionSummary, Error>({
    queryKey: productionAdminKeys.summary(period),
    queryFn: () => productionService.getSummary(period),
    staleTime: STALE_MS,
    refetchInterval: live ? LIVE_REFRESH_MS : false,
    // The previous day or month stays on screen (dimmed) while the next loads.
    placeholderData: keepPreviousData,
  });
}

export function useProductionProgress(
  params: ProductionProgressParams,
): UseQueryResult<ProductionProgressPage, Error> {
  return useQuery<ProductionProgressPage, Error>({
    queryKey: productionAdminKeys.progress(params),
    queryFn: () => productionService.getProgress(params),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

/**
 * The period's discrepancies: the desk's heaviest report. `live` polls
 * (only the Écarts view asks for it; the interval belongs to each
 * observer, so the tab badge reading the same key never polls: it costs
 * one fetch per period).
 */
export function useProductionAnomalies(
  period: ProductionPeriodParams,
  { live = false }: { live?: boolean } = {},
): UseQueryResult<ProductionAnomalies, Error> {
  return useQuery<ProductionAnomalies, Error>({
    queryKey: productionAdminKeys.anomalies(period),
    queryFn: () => productionService.getAnomalies(period),
    staleTime: STALE_MS,
    refetchInterval: live ? LIVE_REFRESH_MS : false,
    placeholderData: keepPreviousData,
  });
}

function hasNoticeInFlight(page: ProductionNoticePage | undefined): boolean {
  return !!page?.data.some((notice) => notice.status === 'pending' || notice.status === 'sending');
}

export function useProductionNotices(
  params: ProductionNoticesParams,
): UseQueryResult<ProductionNoticePage, Error> {
  return useQuery<ProductionNoticePage, Error>({
    queryKey: productionAdminKeys.notices(params),
    queryFn: () => productionService.getNotices(params),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (hasNoticeInFlight(query.state.data) ? NOTICE_POLL_MS : false),
  });
}

/**
 * How many notices failed for good (the tab's badge): one `limit: 1`
 * request. `exhausted` leaves out the failures the dispatcher will still
 * retry on its own, so the badge and Écarts' "Notification en échec"
 * count the same rows.
 */
export function useFailedNoticeCount(): number | undefined {
  const params: ProductionNoticesParams = {
    status: 'failed',
    exhausted: true,
    page: 1,
    limit: 1,
  };
  return useQuery({
    queryKey: productionAdminKeys.notices(params),
    queryFn: () => productionService.getNotices(params),
    staleTime: STALE_MS,
    select: (page: ProductionNoticePage) => page.total,
  }).data;
}

function patchNotice(
  page: ProductionNoticePage | undefined,
  noticeId: string,
  patch: (notice: ProductionNoticeView) => ProductionNoticeView,
): ProductionNoticePage | undefined {
  if (!page || !page.data.some((notice) => notice.id === noticeId)) return page;
  return {
    ...page,
    data: page.data.map((notice) => (notice.id === noticeId ? patch(notice) : notice)),
  };
}

/**
 * "Relancer" on a failed or skipped notice. The row turns "En attente" at
 * once (optimistic), the server's view replaces it on success, and a
 * refusal (409 NOTICE_NOT_RETRYABLE: the dispatcher took it meanwhile)
 * puts the cached rows back before the lists refetch. The discrepancies
 * refetch too: a resent notice leaves "Notification en échec".
 */
export function useRetryProductionNotice() {
  const queryClient = useQueryClient();
  const { t } = useT();
  const lists = productionAdminKeys.noticeLists();
  return useMutation({
    mutationFn: (noticeId: string) => productionService.retryNotice(noticeId),
    onMutate: async (noticeId: string) => {
      await queryClient.cancelQueries({ queryKey: lists });
      const snapshots = queryClient.getQueriesData<ProductionNoticePage>({ queryKey: lists });
      queryClient.setQueriesData<ProductionNoticePage>({ queryKey: lists }, (page) =>
        patchNotice(page, noticeId, (notice) => ({
          ...notice,
          status: 'pending',
          attempts: 0,
          retryable: false,
        })),
      );
      return { snapshots };
    },
    onSuccess: (view) => {
      queryClient.setQueriesData<ProductionNoticePage>({ queryKey: lists }, (page) =>
        patchNotice(page, view.id, () => view),
      );
      toast.success(t('productionAdmin.notices.retried'));
    },
    onError: (error, _noticeId, context) => {
      for (const [key, data] of context?.snapshots ?? []) queryClient.setQueryData(key, data);
      toast.error(productionAdminErrorText(error, t), { duration: 9000 });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: lists });
      void queryClient.invalidateQueries({ queryKey: productionAdminKeys.anomalyLists() });
    },
  });
}

/** The CSV export of a period (détail or par jour), saved under the server's name. */
export function useExportProductionCsv() {
  const { t } = useT();
  return useMutation({
    mutationFn: (params: ProductionExportParams) => productionService.exportCsv(params),
    onSuccess: () => toast.success(t('productionAdmin.exportCsv.done')),
    onError: (error) => toast.error(productionAdminErrorText(error, t), { duration: 9000 }),
  });
}
