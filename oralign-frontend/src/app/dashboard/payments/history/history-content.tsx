'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import {
  EMPTY_HISTORY_FILTERS,
  HISTORY_PAGE_SIZE,
  SEARCH_MAX_LENGTH,
  hasActiveFilters,
  historyUrlSearch,
  includesDay,
  periodRange,
  readHistoryUrlState,
  sameFilters,
  statusForTab,
  takingsRange,
  toFeeParams,
  toInstallmentParams,
  toSummaryParams,
  withoutSort,
  type HistoryFilters,
  type HistoryTab,
  type MethodFilter,
} from '@/components/payments/history/history-filters';
import { HistoryToolbar, type TabTotals } from '@/components/payments/history/history-toolbar';
import { InstallmentsTable } from '@/components/payments/history/installments-table';
import {
  EmptyList,
  ListMessage,
  UndatedFeesNote,
} from '@/components/payments/history/list-messages';
import { HistoryListSkeleton } from '@/components/payments/history/row-parts';
import { TakingsSummary } from '@/components/payments/history/takings-summary';
import { TreatmentFeesTable } from '@/components/payments/history/treatment-fees-table';
import { ListPagination } from '@/components/shared/list-pagination';
import { Button } from '@/components/ui/button';
import { Figure, FigureRow } from '@/components/ui/figure-row';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import type { TreatmentFeeRow } from '@/lib/api/orders.service';
import { extractApiError } from '@/lib/api/error';
import {
  useAllPayments,
  useDentistOptions,
  useMyPayments,
  usePaymentsSummary,
  usePaymentsTotal,
  useTreatmentFeesHistory,
  useTreatmentFeesTotal,
} from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';
import { useAuth } from '@/lib/providers/auth-provider';
import type { PaymentListItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { businessToday, formatBusinessTime } from '@/lib/utils/business-day';

const NO_INSTALLMENTS: PaymentListItem[] = [];
const NO_FEES: TreatmentFeeRow[] = [];
const NO_DENTISTS: { id: string; fullName: string }[] = [];

/**
 * A view that covers today refreshes itself this often while it stays
 * open (a front-desk screen left on "today" all morning); React Query
 * pauses it in a background tab.
 */
const LIVE_REFRESH_MS = 60_000;

/**
 * The payments desk. Waits for the signed-in user (the role decides the
 * endpoint, the columns and the wording), so a hard reload never
 * flashes the "no access" card.
 */
export function PaymentHistoryContent() {
  const { user, isAdmin, isDentist } = useAuth();
  if (!user) return <PaymentsPageSkeleton />;
  if (!isAdmin && !isDentist) return <NoAccess />;
  return <PaymentsDesk key={user.id} isAdmin={isAdmin} />;
}

/**
 * Today's business day (Africa/Tunis), kept current when the tab comes
 * back into view, so "Aujourd’hui" left open overnight means the new day.
 */
function useBusinessToday(): [string, () => void] {
  const [today, setToday] = useState(businessToday);
  const sync = useCallback(() => setToday(businessToday()), []);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sync]);
  return [today, sync];
}

function PaymentsDesk({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useT();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Desk state: React owns it, the URL mirrors it ────────────────
  const [initial] = useState(() => readHistoryUrlState(searchParams, { isAdmin }));
  const [tab, setTab] = useState<HistoryTab>(initial.tab);
  const [filters, setFilters] = useState<HistoryFilters>(initial.filters);
  const [page, setPage] = useState(initial.page);
  const [searchKey, setSearchKey] = useState(0);
  const [today, syncToday] = useBusinessToday();
  const listTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const search = historyUrlSearch({ tab, page, filters }, window.location.search);
    if (search !== window.location.search) {
      window.history.replaceState(null, '', `${pathname}${search}${window.location.hash}`);
    }
  }, [tab, page, filters, pathname]);

  // Every change of what is listed goes back to the first page.
  const changeFilters = (patch: Partial<HistoryFilters>) => {
    const next = { ...filters, ...patch };
    next.search = next.search.slice(0, SEARCH_MAX_LENGTH);
    if (sameFilters(next, filters)) return;
    setFilters(next);
    setPage(1);
  };
  const clearFilters = () => {
    setFilters({ ...EMPTY_HISTORY_FILTERS, sort: filters.sort });
    setSearchKey((key) => key + 1);
    setPage(1);
    // Both "clear" buttons vanish with the filters: the keyboard carries
    // on from the list they just widened (the panel is a tab stop),
    // rather than from the top of the page. Not the search box: on a
    // phone that would raise the keyboard. No scroll: the view stays put.
    listTopRef.current?.focus({ preventScroll: true });
  };
  const changeTab = (next: HistoryTab) => {
    if (next === tab) return;
    setTab(next);
    setPage(1);
    // A fee is only ever paid or to confirm: "failed" does not follow.
    const status = statusForTab(filters.status, next);
    if (status !== filters.status) setFilters({ ...filters, status });
  };
  const goToPage = (next: number) => {
    setPage(next);
    const top = listTopRef.current;
    if (top && top.getBoundingClientRect().top < 0) {
      top.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // ── Data ─────────────────────────────────────────────────────────
  const range = useMemo(() => periodRange(filters, today), [filters, today]);
  const installmentBase = useMemo(
    () => toInstallmentParams(filters, range, { isAdmin }),
    [filters, range, isAdmin],
  );
  const feeBase = useMemo(() => toFeeParams(filters, range, { isAdmin }), [filters, range, isAdmin]);
  const installmentPage = useMemo(
    () => ({ ...installmentBase, page, limit: HISTORY_PAGE_SIZE }),
    [installmentBase, page],
  );
  const feePage = useMemo(
    () => ({ ...feeBase, page, limit: HISTORY_PAGE_SIZE }),
    [feeBase, page],
  );

  // A list or takings that cover today keep themselves current. Only the
  // list's first page: deeper pages would shift under the reader as new
  // payments push rows down.
  const takingsDays = takingsRange(range, today);
  const listRefresh = page === 1 && includesDay(range, today) ? LIVE_REFRESH_MS : false;
  const takingsRefresh = includesDay(takingsDays, today) ? LIVE_REFRESH_MS : false;

  // Only the open tab's list runs, on the caller's own endpoint (a
  // dentist would get a 403 from the admin one).
  const onInstallments = tab === 'echeances';
  const adminInstallments = useAllPayments(installmentPage, {
    enabled: isAdmin && onInstallments,
    refetchInterval: listRefresh,
  });
  const ownInstallments = useMyPayments(installmentPage, {
    enabled: !isAdmin && onInstallments,
    refetchInterval: listRefresh,
  });
  const installments = isAdmin ? adminInstallments : ownInstallments;
  const fees = useTreatmentFeesHistory(feePage, {
    enabled: !onInstallments,
    refetchInterval: listRefresh,
  });
  const list = onInstallments ? installments : fees;

  // Each tab's total follows the search and filters, never the sort.
  const installmentCount = usePaymentsTotal(
    useMemo(() => withoutSort(installmentBase), [installmentBase]),
    { scope: isAdmin ? 'all' : 'mine' },
  );
  const feeCount = useTreatmentFeesTotal(useMemo(() => withoutSort(feeBase), [feeBase]));
  const totals: TabTotals = { echeances: installmentCount.data, frais: feeCount.data };
  // The open tab shows the total of the rows on screen, so the two can
  // never disagree while one of them refreshes.
  if (list.data && !list.isPlaceholderData) totals[tab] = list.data.total;

  const summary = usePaymentsSummary(
    useMemo(() => toSummaryParams(filters, range, { isAdmin }), [filters, range, isAdmin]),
    { refetchInterval: takingsRefresh },
  );
  const dentists = useDentistOptions({ enabled: isAdmin });
  const dentistList = dentists.data?.data ?? NO_DENTISTS;

  // Fees to confirm have no payment date, so a period hides them all;
  // under "every status" the fees tab says how many it cannot show (the
  // same search, method and dentist, any date).
  const dated = Boolean(range.from || range.to);
  const showUndated =
    !onInstallments && dated && statusForTab(filters.status, 'frais') === 'all';
  const undatedFees = useTreatmentFeesTotal(
    useMemo(
      () =>
        withoutSort(
          toFeeParams(
            { ...filters, period: 'all', from: '', to: '', status: 'pending' },
            { from: null, to: null },
            { isAdmin },
          ),
        ),
      [filters, isAdmin],
    ),
    { enabled: showUndated },
  );

  const installmentRows = installments.data?.data ?? NO_INSTALLMENTS;
  const feeRows = fees.data?.data ?? NO_FEES;
  const rowCount = onInstallments ? installmentRows.length : feeRows.length;
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, list.data?.totalPages ?? 1);
  const refreshing = list.isPlaceholderData;
  const filtered = hasActiveFilters(filters);

  // The takings are scoped like the list's dentist filter: say whose.
  const dentistName =
    isAdmin && filters.doctor !== 'all'
      ? (dentistList.find((dentist) => dentist.id === filters.doctor)?.fullName ??
        t('paymentsDesk.filters.dentistUnlisted'))
      : null;

  // A takings figure is "open" when the list shows exactly what it
  // counts: paid, that method, the takings' days, no search.
  const pickedTakings: MethodFilter | null =
    dated && filters.status === 'paid' && filters.search === '' ? filters.method : null;
  const pickTakings = (method: MethodFilter) => {
    if (pickedTakings === method) {
      changeFilters({ method: 'all', status: 'all' });
      return;
    }
    if (filters.search) setSearchKey((key) => key + 1);
    changeFilters({
      search: '',
      method,
      status: 'paid',
      // No period: the figures are today's, so the list goes to today.
      ...(dated ? {} : { period: 'today' as const, from: '', to: '' }),
    });
  };

  // A page past the end (filters narrowed, rows moved) snaps back once
  // real data has arrived, instead of showing an empty page.
  if (list.data && !list.isPlaceholderData && page > totalPages) {
    setPage(totalPages);
  }

  // Where an order or a receipt opened from here returns: this desk, as is.
  const returnTo = `${pathname}${historyUrlSearch({ tab, page, filters }, '')}`;

  const refresh = () => {
    syncToday();
    void summary.refetch();
    void list.refetch();
    void installmentCount.refetch();
    void feeCount.refetch();
    // refetch() runs even a disabled query: only when its note is on.
    if (showUndated) void undatedFees.refetch();
  };

  const showAnyDate = () => changeFilters({ period: 'all', from: '', to: '' });

  return (
    <DeskFrame>
      <DeskHeader
        onRefresh={refresh}
        refreshing={summary.isFetching || list.isFetching}
        updatedAt={summary.dataUpdatedAt}
      />

      <TakingsSummary
        summary={summary}
        range={takingsDays}
        today={today}
        isAdmin={isAdmin}
        dentistName={dentistName}
        picked={pickedTakings}
        onPick={pickTakings}
      />

      <Tabs
        value={tab}
        onValueChange={(next) => changeTab(next as HistoryTab)}
        className="gap-3"
      >
        <HistoryToolbar
          tab={tab}
          totals={totals}
          filters={filters}
          onFiltersChange={changeFilters}
          isAdmin={isAdmin}
          dentists={dentistList}
          busy={refreshing}
          searchKey={searchKey}
          canClear={filtered}
          onClear={clearFilters}
          range={range}
          today={today}
        />

        {/* The open tab's panel (Radix makes it a tab stop: show its focus). */}
        <TabsContent
          value={tab}
          ref={listTopRef}
          className="flex scroll-mt-4 flex-col gap-3 rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {showUndated && undatedFees.data ? (
            <UndatedFeesNote count={undatedFees.data} onAnyDate={showAnyDate} />
          ) : null}

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
            refreshing ? (
              <HistoryListSkeleton />
            ) : (
              <EmptyList
                tab={tab}
                isAdmin={isAdmin}
                filters={filters}
                range={range}
                onClear={clearFilters}
                onAnyDate={showAnyDate}
              />
            )
          ) : onInstallments ? (
            <InstallmentsTable
              rows={installmentRows}
              isAdmin={isAdmin}
              busy={refreshing}
              returnTo={returnTo}
              today={today}
            />
          ) : (
            <TreatmentFeesTable
              rows={feeRows}
              isAdmin={isAdmin}
              busy={refreshing}
              returnTo={returnTo}
              today={today}
            />
          )}

          <ListPagination
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
            total={total}
            pageSize={HISTORY_PAGE_SIZE}
            onPageChange={goToPage}
          />
        </TabsContent>
      </Tabs>
    </DeskFrame>
  );
}

// ─── Frame, header, messages ────────────────────────────────────────

function DeskFrame({ children }: { children: ReactNode }) {
  return (
    <div className="@container/main flex min-w-0 flex-1 flex-col">
      {/* Bottom room on phones: the support bubble floats there. The
          phone gaps are tighter than the Patients page's: the takings sit
          above the toolbar, and the first row should still start in the
          upper part of the screen. */}
      <div className="flex min-w-0 flex-col gap-3 px-4 pt-4 pb-24 md:gap-5 md:pt-6 md:pb-8 lg:px-6">
        {children}
      </div>
    </div>
  );
}

function DeskHeader({
  onRefresh,
  refreshing = false,
  updatedAt = 0,
}: {
  onRefresh?: () => void;
  refreshing?: boolean;
  /** When the figures on screen were fetched (ms; 0 while none are). */
  updatedAt?: number;
}) {
  const { t, lang } = useT();
  return (
    <header className="flex items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
        {t('paymentsDesk.title')}
      </h1>
      {onRefresh && (
        <div className="flex items-center gap-1">
          {/* How fresh the figures are, beside the way to refresh them. */}
          {updatedAt > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {t('paymentsDesk.updatedAt', {
                time: formatBusinessTime(new Date(updatedAt).toISOString(), lang),
              })}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            aria-label={t('paymentsDesk.refresh')}
            title={t('paymentsDesk.refresh')}
            className="text-muted-foreground"
          >
            <RefreshCw className={cn(refreshing && 'animate-spin')} aria-hidden="true" />
          </Button>
        </div>
      )}
    </header>
  );
}

function NoAccess() {
  const { t } = useT();
  return (
    <DeskFrame>
      <DeskHeader />
      <ListMessage title={t('paymentsDesk.noAccess.title')} detail={t('paymentsDesk.noAccess.body')} />
    </DeskFrame>
  );
}

/** The desk's own layout with grey bars, before the user (or the URL) is known. */
export function PaymentsPageSkeleton() {
  const { t } = useT();
  return (
    <DeskFrame>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="size-8 rounded-lg" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-56" />
        <FigureRow className="sm:grid-cols-4">
          <Figure size="lg" label={t('paymentsDesk.method.cash')} value={null} />
          <Figure size="lg" label={t('paymentsDesk.method.card')} value={null} />
          <Figure size="lg" label={t('paymentsDesk.method.bank_transfer')} value={null} />
          <Figure size="lg" label={t('paymentsDesk.takings.total')} value={null} strong />
        </FigureRow>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex gap-4 border-b pb-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex flex-col gap-2 xl:flex-row">
          <Skeleton className="h-9 w-full rounded-lg xl:max-w-md" />
          <div className="grid grid-cols-2 gap-2 sm:flex xl:ml-auto">
            <Skeleton className="h-9 w-full rounded-lg sm:w-44" />
            <Skeleton className="h-9 w-full rounded-lg sm:w-44" />
            <Skeleton className="h-9 w-full rounded-lg sm:w-40" />
            <Skeleton className="h-9 w-full rounded-lg sm:w-44" />
          </div>
        </div>
      </div>
      <HistoryListSkeleton />
    </DeskFrame>
  );
}
