'use client';

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { ListPagination } from '@/components/shared/list-pagination';
import { ListSearch } from '@/components/shared/list-search';
import { Button } from '@/components/ui/button';
import type { TreatmentFeeRow } from '@/lib/api/orders.service';
import { extractApiError } from '@/lib/api/error';
import {
  useAllPayments,
  useMyPayments,
  useTreatmentFeesHistory,
  useTreatmentFeesTotal,
} from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';
import {
  PaymentRecordStatus,
  type PaginatedResponse,
  type PaymentListItem,
} from '@/lib/types';
import { ActiveFilters } from './active-filters';
import { AdvancedFilters } from './advanced-filters';
import {
  HISTORY_PAGE_SIZE,
  SEARCH_MAX_LENGTH,
  TAB_PURPOSE,
  includesDay,
  toFeeParams,
  toInstallmentParams,
  withoutSort,
  type DayRange,
  type HistoryTab,
  type TabFilters,
} from './history-filters';
import { InstallmentsTable } from './installments-table';
import { EmptyList, ListMessage, UndatedFeesNote } from './list-messages';
import { PractitionerFilter } from './practitioner-filter';
import { HistoryListSkeleton } from './row-parts';
import { TreatmentFeesTable } from './treatment-fees-table';

/**
 * A list that covers today refreshes itself this often while it stays
 * open (a front-desk screen left on "today" all morning); React Query
 * pauses it in a background tab. Only the first page: deeper pages would
 * shift under the reader as new payments push rows down.
 */
const LIVE_REFRESH_MS = 60_000;

const NO_FEES: TreatmentFeeRow[] = [];
const NO_INSTALLMENTS: PaymentListItem[] = [];

export interface TabPanelProps {
  filters: TabFilters;
  page: number;
  /** The days of the global period. */
  range: DayRange;
  today: string;
  isAdmin: boolean;
  /** The desk's URL, for the way back from an order or a receipt. */
  returnTo: string;
  /** Bumped to clear the search box (it owns its draft). */
  searchKey: number;
  onFiltersChange: (patch: Partial<TabFilters>) => void;
  onReset: () => void;
  onPage: (page: number) => void;
  /** Switch the global period to every date. */
  onAllDates: () => void;
}

/** The treatment-fees tab: its toolbar, its list (read from the orders), its pages. */
export function FeesPanel(props: TabPanelProps) {
  const { filters, page, range, today, isAdmin } = props;
  const params = useMemo(
    () => ({ ...toFeeParams(filters, range, { isAdmin }), page, limit: HISTORY_PAGE_SIZE }),
    [filters, range, isAdmin, page],
  );
  const list = useTreatmentFeesHistory(params, {
    refetchInterval: page === 1 && includesDay(range, today) ? LIVE_REFRESH_MS : false,
  });

  // Fees to confirm have no payment date, so a period hides them all;
  // under "every status" the tab says how many it cannot show (the same
  // search, practitioner and method, any date).
  const showUndated = Boolean(range.from || range.to) && filters.status === 'all';
  const undatedParams = useMemo(
    () =>
      withoutSort(
        toFeeParams(
          { ...filters, status: PaymentRecordStatus.AWAITING_CONFIRMATION },
          { from: null, to: null },
          { isAdmin },
        ),
      ),
    [filters, isAdmin],
  );
  const undated = useTreatmentFeesTotal(undatedParams, { enabled: showUndated });

  return (
    <PanelFrame
      tab="frais"
      list={list}
      rowCount={list.data?.data.length ?? 0}
      note={
        showUndated && undated.data ? (
          <UndatedFeesNote count={undated.data} onAllDates={props.onAllDates} />
        ) : null
      }
      table={(busy) => (
        <TreatmentFeesTable
          rows={list.data?.data ?? NO_FEES}
          isAdmin={isAdmin}
          busy={busy}
          returnTo={props.returnTo}
          today={today}
        />
      )}
      {...props}
    />
  );
}

/** The installments tab: payments of quote installments, one row per attempt. */
export function InstallmentsPanel(props: TabPanelProps) {
  const { filters, page, range, today, isAdmin } = props;
  const params = useMemo(
    () => ({
      ...toInstallmentParams(filters, range, { isAdmin }),
      page,
      limit: HISTORY_PAGE_SIZE,
    }),
    [filters, range, isAdmin, page],
  );
  const refetchInterval = page === 1 && includesDay(range, today) ? LIVE_REFRESH_MS : false;
  // The caller's own endpoint: a dentist would get a 403 from the admin one.
  const adminList = useAllPayments(params, { enabled: isAdmin, refetchInterval });
  const ownList = useMyPayments(params, { enabled: !isAdmin, refetchInterval });
  const list = isAdmin ? adminList : ownList;

  return (
    <PanelFrame
      tab="echeances"
      list={list}
      rowCount={list.data?.data.length ?? 0}
      table={(busy) => (
        <InstallmentsTable
          rows={list.data?.data ?? NO_INSTALLMENTS}
          isAdmin={isAdmin}
          busy={busy}
          returnTo={props.returnTo}
          today={today}
        />
      )}
      {...props}
    />
  );
}

function PanelFrame({
  tab,
  list,
  rowCount,
  note,
  table,
  filters,
  page,
  range,
  isAdmin,
  searchKey,
  onFiltersChange,
  onReset,
  onPage,
  onAllDates,
}: TabPanelProps & {
  tab: HistoryTab;
  list: UseQueryResult<PaginatedResponse<unknown>, Error>;
  rowCount: number;
  note?: ReactNode;
  table: (busy: boolean) => ReactNode;
}) {
  const { t } = useT();
  const listTopRef = useRef<HTMLDivElement>(null);
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, list.data?.totalPages ?? 1);
  const busy = list.isPlaceholderData;
  const settled = Boolean(list.data) && !list.isPlaceholderData;

  // A page past the end (filters narrowed, rows moved) snaps back once
  // real data has arrived, instead of showing an empty page.
  useEffect(() => {
    if (settled && page > totalPages) onPage(totalPages);
  }, [settled, page, totalPages, onPage]);

  const goToPage = (next: number) => {
    onPage(next);
    const top = listTopRef.current;
    if (top && top.getBoundingClientRect().top < 0) {
      top.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <ListSearch
            key={searchKey}
            value={filters.search}
            onChange={(search) => onFiltersChange({ search })}
            placeholder={
              isAdmin
                ? t('paymentsDesk.filters.searchPhAdmin')
                : t('paymentsDesk.filters.searchPhDentist')
            }
            ariaLabel={
              tab === 'frais'
                ? t('paymentsDesk.filters.searchAriaFees')
                : t('paymentsDesk.filters.searchAriaInstallments')
            }
            busy={busy}
            maxLength={SEARCH_MAX_LENGTH}
            className="md:max-w-md md:flex-1"
          />
          <div className="flex min-w-0 gap-2">
            {isAdmin && (
              <div className="min-w-0 flex-1 md:w-64 md:flex-none">
                <PractitionerFilter
                  purpose={TAB_PURPOSE[tab]}
                  value={filters.doctor}
                  onChange={(doctor) => onFiltersChange({ doctor })}
                />
              </div>
            )}
            <AdvancedFilters tab={tab} filters={filters} onChange={onFiltersChange} />
          </div>
        </div>
        <ActiveFilters
          tab={tab}
          filters={filters}
          isAdmin={isAdmin}
          onChange={onFiltersChange}
          onReset={onReset}
        />
      </div>

      {note}

      <div ref={listTopRef} className="flex scroll-mt-4 flex-col gap-3">
        {list.isPending ? (
          <HistoryListSkeleton />
        ) : list.isError && !list.data ? (
          <ListMessage
            title={t('paymentsDesk.empty.errorTitle')}
            detail={extractApiError(list.error).message}
            action={
              <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
                <RefreshCw aria-hidden="true" />
                {t('paymentsDesk.retry')}
              </Button>
            }
          />
        ) : rowCount === 0 ? (
          // An empty previous result stays a placeholder until the new
          // one lands: its message would describe the wrong filters.
          busy ? (
            <HistoryListSkeleton />
          ) : (
            <EmptyList
              tab={tab}
              isAdmin={isAdmin}
              filters={filters}
              dated={Boolean(range.from || range.to)}
              onReset={onReset}
              onAllDates={onAllDates}
            />
          )
        ) : (
          table(busy)
        )}

        <ListPagination
          page={Math.min(page, totalPages)}
          totalPages={totalPages}
          total={total}
          pageSize={HISTORY_PAGE_SIZE}
          onPageChange={goToPage}
        />
      </div>
    </div>
  );
}
