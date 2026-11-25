'use client';

import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { ListPagination } from '@/components/shared/list-pagination';
import { ListSearch } from '@/components/shared/list-search';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useProductionProgress } from '@/lib/hooks/use-production-admin';
import { useT } from '@/lib/i18n/lang-context';
import {
  PRODUCTION_ARCHES,
  type ActCounterKey,
  type PlannedTotal,
  type ProductionArch,
  type ProductionEventType,
  type ProductionProgressParams,
  type ProductionProgressRow,
  type ProductionProgressState,
} from '@/lib/types/production';
import { cn } from '@/lib/utils';
import { formatBusinessDayShort } from '@/lib/utils/business-day';
import { pastEndPage } from './format';
import { BlockError, BlockMessage, CARD, CaseCell, Count, Dash } from './parts';
import {
  PAGE_SIZE,
  PROGRESS_STATES,
  SEARCH_MAX_LENGTH,
  type ProgressFilters,
} from './pilotage-state';

/** The four counters in workshop order, with the act each one counts. */
const COUNTERS: readonly { key: ActCounterKey; act: ProductionEventType }[] = [
  { key: 'printed', act: 'model_printed' },
  { key: 'thermoformed', act: 'aligner_thermoformed' },
  { key: 'cut', act: 'aligner_cut' },
  { key: 'delivered', act: 'aligner_delivered' },
];

/**
 * "Avancement": every case in production or with production behind it,
 * per arch: planned (provisional when no approved plan sizes it), the
 * distinct steps printed, thermoformed, cut and delivered, what is left
 * to deliver, the first and last act. A table from xl up (one row per
 * arch, the case spanning them), cards below. Read from the progress
 * projection: one page costs the same whatever its size.
 */
export function ProgressView({
  filters,
  searchKey,
  today,
  onPatch,
  onReset,
  onPage,
}: {
  filters: ProgressFilters;
  /** Remounts the search box when the filters are cleared from outside it. */
  searchKey: number;
  today: string;
  onPatch: (patch: Partial<Omit<ProgressFilters, 'page'>>) => void;
  onReset: () => void;
  onPage: (page: number) => void;
}) {
  const { t } = useT();
  const params = useMemo<ProductionProgressParams>(
    () => ({
      search: filters.search || undefined,
      state: filters.state,
      page: filters.page,
      limit: PAGE_SIZE,
    }),
    [filters.search, filters.state, filters.page],
  );
  const query = useProductionProgress(params);
  const page = query.data;
  const busy = query.isPlaceholderData;
  const narrowed = filters.search !== '' || filters.state !== 'all';
  // A page past the end (cases finished since, an old link) goes back to
  // the last one instead of saying nothing matches. An effect: the page
  // lives in the desk's state, which must not change during this render.
  const lastPage = pastEndPage(page, busy, filters.page);
  useEffect(() => {
    if (lastPage !== null) onPage(lastPage);
  }, [lastPage, onPage]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <ListSearch
          key={searchKey}
          value={filters.search}
          onChange={(search) => onPatch({ search })}
          placeholder={t('productionAdmin.progress.searchPlaceholder')}
          ariaLabel={t('productionAdmin.progress.searchAria')}
          busy={query.isFetching && busy}
          maxLength={SEARCH_MAX_LENGTH}
          className="w-full md:max-w-md"
        />
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={1}
          value={filters.state}
          onValueChange={(value) => {
            if (value) onPatch({ state: value as ProductionProgressState });
          }}
          aria-label={t('productionAdmin.progress.stateAria')}
          className="w-full md:w-max"
        >
          {PROGRESS_STATES.map((state) => (
            <ToggleGroupItem
              key={state}
              value={state}
              className="h-11 flex-1 px-3 text-[13px] md:h-9 md:flex-none data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
            >
              {t(`productionAdmin.progress.states.${state}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {page && lastPage === null ? (
        page.data.length === 0 ? (
          narrowed ? (
            <BlockMessage
              title={t('productionAdmin.progress.noMatchTitle')}
              detail={t('productionAdmin.progress.noMatchBody')}
              action={
                <Button variant="outline" size="sm" className="h-11 sm:h-8" onClick={onReset}>
                  <X aria-hidden="true" />
                  {t('productionAdmin.progress.clear')}
                </Button>
              }
            />
          ) : (
            <BlockMessage
              title={t('productionAdmin.progress.emptyTitle')}
              detail={t('productionAdmin.progress.emptyBody')}
            />
          )
        ) : (
          <div
            aria-busy={busy || undefined}
            className={cn('flex flex-col gap-3 transition-opacity duration-150', busy && 'opacity-60')}
          >
            <ProgressTable rows={page.data} today={today} />
            <ProgressCards rows={page.data} today={today} />
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
          title={t('productionAdmin.progress.loadFailed')}
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <ProgressSkeleton />
      )}
      {page && query.isError && !query.isFetching ? (
        <BlockError
          title={t('productionAdmin.progress.loadFailed')}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
    </div>
  );
}

/**
 * The arches a row shows: the treated ones, plus any arch entered anyway
 * (an `arch_not_treated` confirmation), in upper → lower order.
 */
function shownArches(row: ProductionProgressRow): ProductionArch[] {
  const arches = PRODUCTION_ARCHES.filter(
    (arch) =>
      row.treatedArches.includes(arch) ||
      COUNTERS.some(({ key }) => row.counters[arch][key] > 0),
  );
  return arches.length > 0 ? arches : [...PRODUCTION_ARCHES];
}

function PlannedCell({ planned }: { planned: PlannedTotal | null }) {
  const { t } = useT();
  if (!planned) return <Dash label={t('productionAdmin.progress.notTreated')} />;
  if (planned.total === null) return <Dash label={t('productionAdmin.progress.unknownTotal')} />;
  const hint =
    planned.source === 'pack'
      ? t('productionAdmin.progress.provisionalPack')
      : t('productionAdmin.progress.provisionalCase');
  return (
    <span className="inline-flex items-baseline gap-1 tabular-nums">
      {planned.total}
      {planned.provisional ? (
        <span className="text-[11px] text-muted-foreground" title={hint}>
          <span aria-hidden="true">{t('productionAdmin.progress.provisional')}</span>
          <span className="sr-only">{hint}</span>
        </span>
      ) : null}
    </span>
  );
}

function RemainingCell({ value, treated }: { value: number | null; treated: boolean }) {
  const { t } = useT();
  if (value === null) {
    return (
      <Dash
        label={
          treated ? t('productionAdmin.progress.unknownTotal') : t('productionAdmin.progress.notTreated')
        }
      />
    );
  }
  return <Count value={value} className={value > 0 ? 'font-semibold' : undefined} />;
}

function RowBadges({ row }: { row: ProductionProgressRow }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center gap-1">
      <OrderStatusBadge status={row.status} />
      {row.inQueue ? (
        <Badge variant="outline" className="text-[11px]">
          {t('productionAdmin.progress.inQueue')}
        </Badge>
      ) : null}
      {row.deliveryComplete ? (
        <Badge
          variant="secondary"
          className="bg-emerald-50 text-[11px] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          {t('productionAdmin.progress.complete')}
        </Badge>
      ) : null}
    </div>
  );
}

function Activity({ row, today }: { row: ProductionProgressRow; today: string }) {
  const { t, lang } = useT();
  if (!row.firstActionAt && !row.lastActionAt) {
    return <span className="text-muted-foreground">{t('productionAdmin.progress.noActivity')}</span>;
  }
  return (
    <span className="flex flex-col gap-0.5">
      {row.firstActionAt ? (
        <span className="text-muted-foreground">
          {t('productionAdmin.progress.first', {
            day: formatBusinessDayShort(row.firstActionAt, lang, today),
          })}
        </span>
      ) : null}
      {row.lastActionAt ? (
        <span>
          {t('productionAdmin.progress.last', {
            day: formatBusinessDayShort(row.lastActionAt, lang, today),
          })}
        </span>
      ) : null}
    </span>
  );
}

// ─── Table (xl and up) ──────────────────────────────────────────────

function ProgressTable({ rows, today }: { rows: ProductionProgressRow[]; today: string }) {
  const { t } = useT();
  const head = 'h-10 px-2 text-xs font-normal text-muted-foreground';
  return (
    // Both layouts are rendered and CSS picks one: no flash while a media query settles.
    <div className={cn(CARD, 'hidden overflow-x-auto xl:block')}>
      <table className="w-full min-w-[56rem] table-fixed text-sm">
        <colgroup>
          <col />
          <col className="w-[4.5rem]" />
          <col className="w-[5rem]" />
          {COUNTERS.map(({ key }) => (
            <col key={key} className="w-[5.5rem]" />
          ))}
          <col className="w-[4.5rem]" />
          <col className="w-[10.5rem]" />
        </colgroup>
        <thead className="border-b">
          <tr className="text-left">
            <th scope="col" className={cn(head, 'pl-4')}>
              {t('productionAdmin.cols.case')}
            </th>
            <th scope="col" className={head}>
              {t('productionAdmin.progress.colArch')}
            </th>
            <th scope="col" className={cn(head, 'text-right')}>
              {t('productionAdmin.progress.colPlanned')}
            </th>
            {COUNTERS.map(({ key, act }) => (
              <th
                key={key}
                scope="col"
                className={cn(head, 'text-right')}
                title={t(`production.acts.${act}`)}
              >
                {t(`production.actsShort.${act}`)}
              </th>
            ))}
            <th scope="col" className={cn(head, 'text-right')}>
              {t('productionAdmin.progress.colRemaining')}
            </th>
            <th scope="col" className={cn(head, 'pr-4')}>
              {t('productionAdmin.progress.colActivity')}
            </th>
          </tr>
        </thead>
        {rows.map((row) => {
          const arches = shownArches(row);
          return (
            // One body per case: its arch rows read as one group.
            <tbody key={row.orderId} className="border-b last:border-0 hover:bg-muted/40">
              {arches.map((arch, index) => {
                const treated = row.treatedArches.includes(arch);
                return (
                  <tr key={arch} className="align-top">
                    {index === 0 ? (
                      <th
                        scope="rowgroup"
                        rowSpan={arches.length}
                        className="py-3 pr-2 pl-4 text-left font-normal"
                      >
                        <CaseCell
                          order={row}
                          sub={row.practitionerName}
                          className="max-w-full"
                        />
                        <div className="mt-1.5">
                          <RowBadges row={row} />
                        </div>
                      </th>
                    ) : null}
                    <td className={cn('px-2 py-3', !treated && 'text-muted-foreground')}>
                      {t(`production.archesShort.${arch}`)}
                      {!treated ? (
                        <span className="block text-[11px]">{t('productionAdmin.progress.notTreated')}</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <PlannedCell planned={row.planned[arch]} />
                    </td>
                    {COUNTERS.map(({ key }) => (
                      <td key={key} className="px-2 py-3 text-right">
                        <Count value={row.counters[arch][key]} />
                      </td>
                    ))}
                    <td className="px-2 py-3 text-right">
                      <RemainingCell value={row.remaining[arch]} treated={treated} />
                    </td>
                    {index === 0 ? (
                      <td rowSpan={arches.length} className="py-3 pr-4 pl-2 text-xs">
                        <Activity row={row} today={today} />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

// ─── Cards (below xl) ───────────────────────────────────────────────

function ProgressCards({ rows, today }: { rows: ProductionProgressRow[]; today: string }) {
  const { t } = useT();
  const head = 'pb-1 text-right font-normal text-muted-foreground';
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:hidden">
      {rows.map((row) => {
        const arches = shownArches(row);
        return (
          <li key={row.orderId} className={cn(CARD, 'flex flex-col gap-3 p-4')}>
            <CaseCell order={row} sub={row.practitionerName} />
            <RowBadges row={row} />
            <table className="w-full table-fixed text-xs">
              <thead>
                <tr>
                  <th scope="col" className="w-[3.25rem] pb-1 text-left font-normal text-muted-foreground">
                    <span className="sr-only">{t('productionAdmin.progress.colArch')}</span>
                  </th>
                  <th scope="col" className={head}>
                    {t('productionAdmin.progress.colPlanned')}
                  </th>
                  {COUNTERS.map(({ key, act }) => (
                    <th key={key} scope="col" className={head} title={t(`production.acts.${act}`)}>
                      <span aria-hidden="true">{t(`production.actsAbbr.${act}`)}</span>
                      <span className="sr-only">{t(`production.acts.${act}`)}</span>
                    </th>
                  ))}
                  <th scope="col" className={head}>
                    {t('productionAdmin.progress.colRemaining')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {arches.map((arch) => {
                  const treated = row.treatedArches.includes(arch);
                  return (
                    <tr key={arch}>
                      <th
                        scope="row"
                        className={cn('py-1.5 text-left font-medium', !treated && 'text-muted-foreground')}
                      >
                        {t(`production.archesShort.${arch}`)}
                      </th>
                      <td className="py-1.5 text-right">
                        <PlannedCell planned={row.planned[arch]} />
                      </td>
                      {COUNTERS.map(({ key }) => (
                        <td key={key} className="py-1.5 text-right">
                          <Count value={row.counters[arch][key]} />
                        </td>
                      ))}
                      <td className="py-1.5 text-right">
                        <RemainingCell value={row.remaining[arch]} treated={treated} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="text-xs">
              <Activity row={row} today={today} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ProgressSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className={cn(CARD, 'hidden overflow-hidden xl:block')} aria-hidden="true">
        <div className="border-b px-4 py-3">
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex items-start gap-6 border-b px-4 py-3 last:border-0">
            <div className="w-56 space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3.5 w-32" />
            </div>
            <div className="flex-1 space-y-3 pt-0.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:hidden" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={cn(CARD, 'space-y-2 p-4')}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
