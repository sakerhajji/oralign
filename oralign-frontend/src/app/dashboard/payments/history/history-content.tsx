'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import {
  includesDay,
  periodRange,
  takingsRange,
  toFeeParams,
  toInstallmentParams,
  toSummaryParams,
  withoutSort,
  type HistoryTab,
} from '@/components/payments/history/history-filters';
import { FeesPanel, InstallmentsPanel } from '@/components/payments/history/history-tab-panels';
import { ListMessage } from '@/components/payments/history/list-messages';
import { PeriodFilter } from '@/components/payments/history/period-filter';
import { periodName, rangeText } from '@/components/payments/history/period-text';
import { ReportExport } from '@/components/payments/history/report-export';
import { HistoryListSkeleton } from '@/components/payments/history/row-parts';
import { TakingsSummary } from '@/components/payments/history/takings-summary';
import { useDeskState } from '@/components/payments/history/use-desk-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  usePaymentsSummary,
  usePaymentsTotal,
  useTreatmentFeesTotal,
} from '@/lib/hooks';
import { invalidatePaymentViews } from '@/lib/hooks/payment-keys';
import { useT } from '@/lib/i18n/lang-context';
import { useAuth } from '@/lib/providers/auth-provider';
import { cn } from '@/lib/utils';
import { businessToday, formatBusinessTime } from '@/lib/utils/business-day';

/** The takings covering today refresh themselves this often (see the lists). */
const LIVE_REFRESH_MS = 60_000;

/**
 * The payment history: what was collected over a period (three cards, by
 * method), then the two kinds of payments in two tabs — treatment fees
 * and installment payments — each with its own search and filters, and
 * the PDF report of it all. Waits for the signed-in user (the role
 * decides the endpoints, the columns and the wording), so a hard reload
 * never flashes the "no access" card.
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
  const { t, lang } = useT();
  const queryClient = useQueryClient();
  const desk = useDeskState(isAdmin);
  const { state, setPeriod, setTab } = desk;
  const [today, syncToday] = useBusinessToday();

  const range = useMemo(() => periodRange(state.period, today), [state.period, today]);
  const summaryParams = useMemo(() => toSummaryParams(range, today), [range, today]);
  const summary = usePaymentsSummary(summaryParams, {
    refetchInterval: includesDay(takingsRange(range, today), today) ? LIVE_REFRESH_MS : false,
  });

  // Each tab's count follows the period and that tab's own filters.
  const feeFilters = state.filters.frais;
  const installmentFilters = state.filters.echeances;
  const feeCountParams = useMemo(
    () => withoutSort(toFeeParams(feeFilters, range, { isAdmin })),
    [feeFilters, range, isAdmin],
  );
  const installmentCountParams = useMemo(
    () => withoutSort(toInstallmentParams(installmentFilters, range, { isAdmin })),
    [installmentFilters, range, isAdmin],
  );
  const feeCount = useTreatmentFeesTotal(feeCountParams);
  const installmentCount = usePaymentsTotal(installmentCountParams, {
    scope: isAdmin ? 'all' : 'mine',
  });
  const totals: Partial<Record<HistoryTab, number>> = {
    frais: feeCount.data,
    echeances: installmentCount.data,
  };

  const rangeLabel = rangeText(range, today, lang, t);
  const periodLabel = periodName(state.period, range, today, lang, t);
  const showAllDates = useCallback(
    () => setPeriod({ key: 'all', from: '', to: '' }),
    [setPeriod],
  );
  const refresh = () => {
    syncToday();
    invalidatePaymentViews(queryClient);
  };

  const panelProps = (tab: HistoryTab) => ({
    filters: state.filters[tab],
    page: state.pages[tab],
    range,
    today,
    isAdmin,
    returnTo: desk.returnTo,
    searchKey: desk.searchKeys[tab],
    onFiltersChange: (patch: Parameters<typeof desk.patchFilters>[1]) =>
      desk.patchFilters(tab, patch),
    onReset: () => desk.resetFilters(tab),
    onPage: (page: number) => desk.setPage(tab, page),
    onAllDates: showAllDates,
  });

  return (
    <DeskFrame>
      <DeskHeader
        onRefresh={refresh}
        refreshing={summary.isFetching}
        updatedAt={summary.dataUpdatedAt}
        action={
          <ReportExport
            state={state}
            today={today}
            isAdmin={isAdmin}
            totals={totals}
            rangeLabel={rangeLabel}
          />
        }
      />

      <PeriodFilter period={state.period} range={range} today={today} onChange={setPeriod} />

      <TakingsSummary
        summary={summary}
        isAdmin={isAdmin}
        periodLabel={periodLabel}
        rangeLabel={rangeLabel}
      />

      <Tabs
        value={state.tab}
        onValueChange={(next) => setTab(next as HistoryTab)}
        className="gap-4"
      >
        {/* The strip sits on a full-width rule; it scrolls sideways on a
            narrow phone instead of wrapping. */}
        <div className="no-scrollbar -mx-4 overflow-x-auto border-b px-4 lg:mx-0 lg:px-0">
          <TabsList variant="line" aria-label={t('paymentsDesk.tabs.aria')} className="h-auto gap-5 pb-[5px]">
            {(['frais', 'echeances'] as const).map((tab) => (
              <TabsTrigger key={tab} value={tab} className="flex-none px-0.5 text-[15px]">
                {tab === 'frais' ? t('paymentsDesk.tabs.fees') : t('paymentsDesk.tabs.installments')}
                <span
                  className={cn(
                    'min-w-6 rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular-nums',
                    totals[tab] === undefined && 'invisible',
                  )}
                >
                  {totals[tab] ?? 0}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Only the open tab's panel is mounted: only its list is fetched. */}
        <TabsContent value="frais" className="outline-none">
          <FeesPanel {...panelProps('frais')} />
        </TabsContent>
        <TabsContent value="echeances" className="outline-none">
          <InstallmentsPanel {...panelProps('echeances')} />
        </TabsContent>
      </Tabs>
    </DeskFrame>
  );
}

// ─── Frame, header, messages ────────────────────────────────────────

function DeskFrame({ children }: { children: ReactNode }) {
  return (
    <div className="@container/main flex min-w-0 flex-1 flex-col">
      {/* Bottom room on phones: the support bubble floats there. */}
      <div className="flex min-w-0 flex-col gap-4 px-4 pt-4 pb-24 md:gap-5 md:pt-6 md:pb-8 lg:px-6">
        {children}
      </div>
    </div>
  );
}

function DeskHeader({
  onRefresh,
  refreshing = false,
  updatedAt = 0,
  action,
}: {
  onRefresh?: () => void;
  refreshing?: boolean;
  /** When the figures on screen were fetched (ms; 0 while none are). */
  updatedAt?: number;
  /** The page's main action (the PDF report). */
  action?: ReactNode;
}) {
  const { t, lang } = useT();
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t('paymentsDesk.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('paymentsDesk.subtitle')}</p>
      </div>
      {(onRefresh || action) && (
        <div className="flex items-center gap-1 sm:gap-2">
          {/* How fresh the figures are, beside the way to refresh them. */}
          {updatedAt > 0 && (
            <span className="hidden text-xs text-muted-foreground tabular-nums md:inline">
              {t('paymentsDesk.updatedAt', {
                time: formatBusinessTime(new Date(updatedAt).toISOString(), lang),
              })}
            </span>
          )}
          {onRefresh && (
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
          )}
          {action}
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
  return (
    <DeskFrame>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-80 max-w-[70vw]" />
        </div>
        <Skeleton className="h-9 w-44 rounded-lg" />
      </div>
      <div className="flex gap-1.5 overflow-hidden">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-24 shrink-0 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-[74px] rounded-xl sm:h-[122px]" />
        ))}
      </div>
      <div className="flex gap-5 border-b pb-2">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-5 w-44" />
      </div>
      <div className="flex flex-col gap-2 md:flex-row">
        <Skeleton className="h-9 w-full rounded-lg md:max-w-md" />
        <Skeleton className="h-9 w-full rounded-lg md:w-64" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <HistoryListSkeleton />
    </DeskFrame>
  );
}
