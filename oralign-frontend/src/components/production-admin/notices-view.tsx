'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { ListPagination } from '@/components/shared/list-pagination';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  useProductionNotices,
  useRetryProductionNotice,
} from '@/lib/hooks/use-production-admin';
import { useT } from '@/lib/i18n/lang-context';
import {
  PRODUCTION_NOTICE_STATUSES,
  type ProductionNoticesParams,
  type ProductionNoticeStatus,
  type ProductionNoticeView,
} from '@/lib/types/production';
import { NOTICE_MAX_ATTEMPTS, PAGE_SIZE } from '@/lib/production/limits';
import { cn } from '@/lib/utils';
import { formatBusinessDayShort, formatBusinessTime } from '@/lib/utils/business-day';
import { pastEndPage } from './format';
import { BlockError, BlockMessage, CARD, caseSheetHref } from './parts';
import type { NoticeFilter, NoticeFilters } from './pilotage-state';

const STATUS_CLASS: Record<ProductionNoticeStatus, string> = {
  pending: 'bg-muted text-foreground',
  sending: 'bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
  sent: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  failed: 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300',
  skipped: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
};

/**
 * "Notifications": the outbox of the practitioner notices (one row per
 * channel and delivery, plus the corrections of cancelled deliveries).
 * A status filter, the attempts and the last error, and "Relancer" on the
 * rows the server would accept again (failed, or skipped because e-mail
 * was not set up or the practitioner had no address). Rows on their way
 * are polled until they settle.
 */
export function NoticesView({
  filters,
  today,
  onStatus,
  onPage,
}: {
  filters: NoticeFilters;
  today: string;
  onStatus: (status: NoticeFilter) => void;
  onPage: (page: number) => void;
}) {
  const { t } = useT();
  const params = useMemo<ProductionNoticesParams>(
    () => ({
      status: filters.status === 'all' ? undefined : filters.status,
      page: filters.page,
      limit: PAGE_SIZE,
    }),
    [filters.status, filters.page],
  );
  const query = useProductionNotices(params);
  const page = query.data;
  const busy = query.isPlaceholderData;
  // A page past the end (a shared ?page=9) goes back to the last one
  // instead of saying there is no notice; see ProgressView.
  const lastPage = pastEndPage(page, busy, filters.page);
  useEffect(() => {
    if (lastPage !== null) onPage(lastPage);
  }, [lastPage, onPage]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* The padding keeps the focus rings inside the phone scroller. */}
      <div className="no-scrollbar -mx-4 -my-1 overflow-x-auto px-4 py-1 lg:mx-0 lg:px-0">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={1}
          value={filters.status}
          onValueChange={(value) => {
            if (value) onStatus(value as NoticeFilter);
          }}
          aria-label={t('productionAdmin.notices.statusAria')}
          className="w-max"
        >
          {(['all', ...PRODUCTION_NOTICE_STATUSES] as const).map((status) => (
            <ToggleGroupItem
              key={status}
              value={status}
              className="h-11 px-3 text-[13px] sm:h-8 data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
            >
              {status === 'all'
                ? t('productionAdmin.notices.all')
                : t(`productionAdmin.notices.statusesMany.${status}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {page && lastPage === null ? (
        page.data.length === 0 ? (
          filters.status === 'all' ? (
            <BlockMessage
              title={t('productionAdmin.notices.emptyTitle')}
              detail={t('productionAdmin.notices.emptyBody')}
            />
          ) : (
            <BlockMessage
              title={t('productionAdmin.notices.noMatchTitle')}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 sm:h-8"
                  onClick={() => onStatus('all')}
                >
                  {t('productionAdmin.notices.showAll')}
                </Button>
              }
            />
          )
        ) : (
          <div
            aria-busy={busy || undefined}
            className={cn('flex flex-col gap-3 transition-opacity duration-150', busy && 'opacity-60')}
          >
            <NoticesTable notices={page.data} today={today} />
            <NoticeCards notices={page.data} today={today} />
            <ListPagination
              page={page.page}
              totalPages={page.totalPages}
              total={page.total}
              pageSize={page.limit}
              onPageChange={onPage}
            />
          </div>
        )
      ) : query.isError && !page ? (
        <BlockError
          title={t('productionAdmin.notices.loadFailed')}
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <NoticesSkeleton />
      )}
      {page && query.isError && !query.isFetching ? (
        <BlockError
          title={t('productionAdmin.notices.loadFailed')}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
    </div>
  );
}

// ─── Cells ──────────────────────────────────────────────────────────

function OrderCell({ notice }: { notice: ProductionNoticeView }) {
  const { t } = useT();
  return (
    <div className="shrink-0">
      <Link
        href={caseSheetHref(notice.orderId)}
        className="rounded-sm font-medium whitespace-nowrap tabular-nums underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={t('productionAdmin.rows.openSheet', { code: notice.orderCode })}
      >
        {notice.orderCode}
      </Link>
      <p className="text-xs text-muted-foreground">{t(`productionAdmin.notices.kinds.${notice.kind}`)}</p>
    </div>
  );
}

function StatusCell({
  notice,
  align = 'start',
}: {
  notice: ProductionNoticeView;
  /** `end` in a card, where the status sits on the right of the order. */
  align?: 'start' | 'end';
}) {
  const { t } = useT();
  const reasonKey = `productionAdmin.notices.skipReasons.${notice.skipReason ?? ''}`;
  const reason = notice.skipReason ? t(reasonKey) : null;
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1',
        align === 'end' ? 'items-end text-right' : 'items-start',
      )}
    >
      <span
        className={cn(
          'inline-flex h-5 flex-none items-center rounded-full px-2 text-xs font-medium whitespace-nowrap',
          STATUS_CLASS[notice.status],
        )}
      >
        {t(`productionAdmin.notices.statuses.${notice.status}`)}
      </span>
      {reason ? (
        <span className="text-xs text-muted-foreground">
          {reason === reasonKey ? notice.skipReason : reason}
        </span>
      ) : null}
    </div>
  );
}

function ChannelCell({ notice }: { notice: ProductionNoticeView }) {
  const { t } = useT();
  return (
    <div className="min-w-0">
      <p>{t(`productionAdmin.notices.channels.${notice.channel}`)}</p>
      {/* An in-app notice's "address" is the practitioner's account id: nothing to read. */}
      {notice.channel === 'email' && notice.recipientAddress ? (
        <p className="truncate text-xs text-muted-foreground" title={notice.recipientAddress}>
          {t('productionAdmin.notices.to', { address: notice.recipientAddress })}
        </p>
      ) : null}
    </div>
  );
}

function DatesCell({ notice, today }: { notice: ProductionNoticeView; today: string }) {
  const { t, lang } = useT();
  const when = (iso: string) =>
    `${formatBusinessDayShort(iso, lang, today)} · ${formatBusinessTime(iso, lang)}`;
  const waiting = notice.status === 'pending' || notice.status === 'failed';
  return (
    <div className="flex flex-col gap-0.5 text-xs tabular-nums">
      <span className="text-muted-foreground">
        {t('productionAdmin.notices.created', { date: when(notice.createdAt) })}
      </span>
      {notice.sentAt ? (
        <span>{t('productionAdmin.notices.sent', { date: when(notice.sentAt) })}</span>
      ) : waiting ? (
        <span>{t('productionAdmin.notices.due', { date: when(notice.notBefore) })}</span>
      ) : null}
    </div>
  );
}

function ErrorText({ notice }: { notice: ProductionNoticeView }) {
  if (!notice.lastError) return <span className="text-muted-foreground" aria-hidden="true">—</span>;
  return (
    <span className="line-clamp-2 text-xs break-words text-muted-foreground" title={notice.lastError}>
      {notice.lastError}
    </span>
  );
}

/**
 * Each row owns its mutation, so two rows resent one after the other each
 * keep their own "Relance…" state.
 */
function RetryCell({ notice }: { notice: ProductionNoticeView }) {
  const { t } = useT();
  const retry = useRetryProductionNotice();
  if (!notice.retryable && !retry.isPending) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-11 sm:h-8"
      disabled={retry.isPending}
      aria-busy={retry.isPending || undefined}
      aria-label={t('productionAdmin.notices.retryAria', {
        channel: t(`productionAdmin.notices.channels.${notice.channel}`),
        code: notice.orderCode,
      })}
      onClick={() => retry.mutate(notice.id)}
    >
      {retry.isPending ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : (
        <RotateCw aria-hidden="true" />
      )}
      {retry.isPending ? t('productionAdmin.notices.retrying') : t('productionAdmin.notices.retry')}
    </Button>
  );
}

function Attempts({ notice }: { notice: ProductionNoticeView }) {
  const { t } = useT();
  return (
    <span className={cn('tabular-nums', notice.attempts === 0 && 'text-muted-foreground')}>
      {t('productionAdmin.notices.attempts', { count: notice.attempts, max: NOTICE_MAX_ATTEMPTS })}
    </span>
  );
}

// ─── Table (xl and up) ──────────────────────────────────────────────

function NoticesTable({ notices, today }: { notices: ProductionNoticeView[]; today: string }) {
  const { t } = useT();
  const head = 'h-10 px-2 text-left text-xs font-normal text-muted-foreground';
  return (
    // Both layouts are rendered and CSS picks one: no flash while a media query settles.
    <div className={cn(CARD, 'hidden overflow-x-auto xl:block')}>
      <table className="w-full min-w-[58rem] table-fixed text-sm">
        <colgroup>
          <col className="w-[9rem]" />
          <col className="w-[11rem]" />
          <col className="w-[11rem]" />
          <col className="w-[5.5rem]" />
          <col />
          <col className="w-[11rem]" />
          <col className="w-[8rem]" />
        </colgroup>
        <thead className="border-b">
          <tr>
            <th scope="col" className={cn(head, 'pl-4')}>
              {t('productionAdmin.notices.colOrder')}
            </th>
            <th scope="col" className={head}>
              {t('productionAdmin.notices.colChannel')}
            </th>
            <th scope="col" className={head}>
              {t('productionAdmin.notices.colStatus')}
            </th>
            <th scope="col" className={cn(head, 'text-right')}>
              {t('productionAdmin.notices.colAttempts')}
            </th>
            <th scope="col" className={head}>
              {t('productionAdmin.notices.colDetail')}
            </th>
            <th scope="col" className={head}>
              {t('productionAdmin.notices.colDates')}
            </th>
            <th scope="col" className={cn(head, 'pr-4')}>
              <span className="sr-only">{t('productionAdmin.notices.colAction')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {notices.map((notice) => (
            <tr key={notice.id} className="border-b align-top last:border-0 hover:bg-muted/40">
              <td className="py-3 pr-2 pl-4">
                <OrderCell notice={notice} />
              </td>
              <td className="px-2 py-3">
                <ChannelCell notice={notice} />
              </td>
              <td className="px-2 py-3">
                <StatusCell notice={notice} />
              </td>
              <td className="px-2 py-3 text-right">
                <Attempts notice={notice} />
              </td>
              <td className="px-2 py-3">
                <ErrorText notice={notice} />
              </td>
              <td className="px-2 py-3">
                <DatesCell notice={notice} today={today} />
              </td>
              <td className="py-2 pr-4 pl-2 text-right">
                <RetryCell notice={notice} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Cards (below xl) ───────────────────────────────────────────────

function NoticeCards({ notices, today }: { notices: ProductionNoticeView[]; today: string }) {
  const { t } = useT();
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:hidden">
      {notices.map((notice) => (
        <li key={notice.id} className={cn(CARD, 'flex flex-col gap-3 p-4 text-sm')}>
          <div className="flex items-start justify-between gap-3">
            <OrderCell notice={notice} />
            <StatusCell notice={notice} align="end" />
          </div>
          <div className="flex items-start justify-between gap-3">
            <ChannelCell notice={notice} />
            <span className="shrink-0 text-xs">
              <span className="text-muted-foreground">{t('productionAdmin.notices.colAttempts')} </span>
              <Attempts notice={notice} />
            </span>
          </div>
          {notice.lastError ? <ErrorText notice={notice} /> : null}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <DatesCell notice={notice} today={today} />
            <RetryCell notice={notice} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function NoticesSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className={cn(CARD, 'hidden overflow-hidden xl:block')} aria-hidden="true">
        <div className="border-b px-4 py-3">
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-6 border-b px-4 py-3 last:border-0">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:hidden" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={cn(CARD, 'space-y-2 p-4')}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
