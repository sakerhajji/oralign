'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { CalendarDays, Factory, RefreshCw, Search, X } from 'lucide-react';
import { ProductionFrame, ProductionMessage, ProductionNoAccess } from '@/components/production/production-ui';
import { isProductionRole, productionErrorText } from '@/components/production/production-format';
import {
  ProductionQueueList,
  ProductionQueueSkeleton,
} from '@/components/production/queue-list';
import { ListPagination } from '@/components/shared/list-pagination';
import { ListSearch } from '@/components/shared/list-search';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProductionQueue } from '@/lib/hooks/use-production';
import { useT } from '@/lib/i18n/lang-context';
import { PAGE_SIZE, SEARCH_MAX_LENGTH } from '@/lib/production/limits';
import { useAuth } from '@/lib/providers/auth-provider';
import type { ProductionQueueItem, ProductionQueueTab } from '@/lib/types/production';
import { formatBusinessTime } from '@/lib/utils/business-day';

const NO_ROWS: ProductionQueueItem[] = [];

interface QueueUrlState {
  tab: ProductionQueueTab;
  search: string;
  page: number;
}

interface SearchParamsLike {
  get(name: string): string | null;
}

/** Read on mount and when the URL changes from outside; React owns the state otherwise. */
function readQueueUrl(params: SearchParamsLike): QueueUrlState {
  const page = Number.parseInt(params.get('page') ?? '', 10);
  return {
    tab: params.get('tab') === 'done' ? 'done' : 'active',
    search: (params.get('q') ?? '').trim().slice(0, SEARCH_MAX_LENGTH),
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

/** Defaults are omitted, so a plain visit stays `/dashboard/production`. */
function queueUrlSearch(state: QueueUrlState): string {
  const params = new URLSearchParams();
  if (state.tab !== 'active') params.set('tab', state.tab);
  if (state.search) params.set('q', state.search);
  if (state.page > 1) params.set('page', String(state.page));
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * The production queue. Waits for the signed-in user: the screens are
 * the lab's and the admins' only.
 */
export function QueueContent() {
  const { user } = useAuth();
  if (!user) return <QueuePageSkeleton />;
  if (!isProductionRole(user.role)) return <ProductionNoAccess />;
  return <QueueDesk />;
}

function QueueDesk() {
  const { t, lang } = useT();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [initial] = useState(() => readQueueUrl(searchParams));
  const [tab, setTab] = useState<ProductionQueueTab>(initial.tab);
  const [search, setSearch] = useState(initial.search);
  const [page, setPage] = useState(initial.page);
  // Bumped to clear the search box (it owns its draft).
  const [searchKey, setSearchKey] = useState(0);
  const listTopRef = useRef<HTMLElement>(null);

  // A link to this page with other params (the sidebar "Production" from
  // ?tab=done&page=2) re-renders it without a remount: follow a URL
  // changed from outside. Our own replaceState comes back through
  // useSearchParams equal to the state, so it changes nothing.
  const urlSearch = searchParams.toString();
  const [seenUrl, setSeenUrl] = useState(urlSearch);
  if (urlSearch !== seenUrl) {
    setSeenUrl(urlSearch);
    const fromUrl = readQueueUrl(searchParams);
    if (queueUrlSearch(fromUrl) !== queueUrlSearch({ tab, search, page })) {
      setTab(fromUrl.tab);
      setPage(fromUrl.page);
      if (fromUrl.search !== search) {
        setSearch(fromUrl.search);
        setSearchKey((key) => key + 1);
      }
    }
  }

  useEffect(() => {
    const next = queueUrlSearch({ tab, search, page });
    if (next !== window.location.search) {
      window.history.replaceState(null, '', `${pathname}${next}${window.location.hash}`);
    }
  }, [tab, search, page, pathname]);

  const list = useProductionQueue(
    useMemo(
      () => ({ tab, search: search || undefined, page, limit: PAGE_SIZE }),
      [tab, search, page],
    ),
  );

  const rows = list.data?.data ?? NO_ROWS;
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, list.data?.totalPages ?? 1);
  // A page past the end (cases left the queue meanwhile) snaps back once
  // real data has arrived, instead of showing an empty page.
  if (list.data && !list.isPlaceholderData && page > totalPages) setPage(totalPages);

  const changeTab = (next: ProductionQueueTab) => {
    if (next === tab) return;
    setTab(next);
    setPage(1);
  };
  const changeSearch = (next: string) => {
    if (next === search) return;
    setSearch(next);
    setPage(1);
  };
  const clearSearch = () => {
    setSearch('');
    setSearchKey((key) => key + 1);
    setPage(1);
  };
  const goToPage = (next: number) => {
    setPage(next);
    const top = listTopRef.current;
    if (top && top.getBoundingClientRect().top < 0) {
      top.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const tabs: { value: ProductionQueueTab; label: string }[] = [
    { value: 'active', label: t('production.queue.tabs.active') },
    { value: 'done', label: t('production.queue.tabs.done') },
  ];
  const shownTotal = list.data && !list.isPlaceholderData ? list.data.total : undefined;

  return (
    <ProductionFrame>
      <QueueHeader />

      <div className="flex flex-col gap-3">
        <Tabs value={tab} onValueChange={(next) => changeTab(next as ProductionQueueTab)}>
          {/* The list must grow to its 48 px tabs: the primitive pins it to
              h-8 through a group variant (a plain h-auto loses), and this
              scrolling strip then clipped each tab to ~32 px of tappable
              height and hid the active underline. */}
          <div className="no-scrollbar -mx-4 overflow-x-auto border-b px-4 lg:mx-0 lg:px-0">
            <TabsList variant="line" className="gap-6 pb-[5px] group-data-horizontal/tabs:h-auto">
              {tabs.map(({ value, label }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="min-h-12 flex-none px-0.5 text-[15px] pointer-fine:md:min-h-8 md:text-sm"
                >
                  {label}
                  {value === tab && (
                    <span className="font-normal text-muted-foreground tabular-nums">
                      {shownTotal ?? ''}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <ListSearch
            key={searchKey}
            value={search}
            onChange={changeSearch}
            placeholder={t('production.queue.searchPh')}
            ariaLabel={t('production.queue.searchAria')}
            busy={list.isPlaceholderData}
            maxLength={SEARCH_MAX_LENGTH}
            // A gloved thumb needs a 48 px field and clear button on the bench.
            size="touch"
            className="sm:max-w-md sm:flex-1"
          />
          {list.dataUpdatedAt > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground sm:ml-auto">
              <span aria-live="off">
                {t('production.queue.updated', {
                  time: formatBusinessTime(new Date(list.dataUpdatedAt).toISOString(), lang),
                })}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-12 pointer-fine:md:size-8"
                onClick={() => list.refetch()}
                disabled={list.isFetching}
                aria-label={t('production.queue.refresh')}
              >
                <RefreshCw className={list.isFetching ? 'animate-spin' : undefined} aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <section ref={listTopRef} className="flex scroll-mt-4 flex-col gap-3">
        {list.isPending ? (
          <ProductionQueueSkeleton />
        ) : list.isError && !list.data ? (
          <ProductionMessage
            role="alert"
            title={t('production.queue.errorTitle')}
            detail={productionErrorText(t, list.error)}
            action={
              <Button variant="outline" className="h-12 pointer-fine:md:h-8" onClick={() => list.refetch()}>
                <RefreshCw aria-hidden="true" />
                {t('production.retry')}
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          search ? (
            <ProductionMessage
              icon={<Search />}
              title={t('production.queue.empty.searchTitle')}
              detail={t('production.queue.empty.searchBody')}
              action={
                <Button variant="outline" className="h-12 pointer-fine:md:h-8" onClick={clearSearch}>
                  <X aria-hidden="true" />
                  {t('production.queue.empty.clear')}
                </Button>
              }
            />
          ) : (
            <ProductionMessage
              icon={<Factory />}
              title={t(tab === 'done' ? 'production.queue.empty.doneTitle' : 'production.queue.empty.activeTitle')}
              detail={t(tab === 'done' ? 'production.queue.empty.doneBody' : 'production.queue.empty.activeBody')}
            />
          )
        ) : (
          <ProductionQueueList rows={rows} busy={list.isPlaceholderData} />
        )}

        <ListPagination
          page={Math.min(page, totalPages)}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={goToPage}
          size="touch"
        />
      </section>
    </ProductionFrame>
  );
}

function QueueHeader() {
  const { t } = useT();
  return (
    <header className="flex items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
        {t('production.queue.title')}
      </h1>
      <Button asChild variant="outline" className="h-12 px-4 pointer-fine:md:h-9 md:px-3">
        <Link href="/dashboard/production/ma-journee">
          <CalendarDays aria-hidden="true" />
          {t('production.queue.myDayLink')}
        </Link>
      </Button>
    </header>
  );
}

/** The page's own layout with grey bars, before the user (or the URL) is known. */
export function QueuePageSkeleton() {
  return (
    <ProductionFrame>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-12 w-36 rounded-lg pointer-fine:md:h-9" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex gap-6 border-b pt-[3px] pb-[5px]">
          <Skeleton className="my-3 h-6 w-20 pointer-fine:md:my-1" />
          <Skeleton className="my-3 h-6 w-20 pointer-fine:md:my-1" />
        </div>
        <Skeleton className="h-12 w-full rounded-lg sm:max-w-md pointer-fine:md:h-9" />
      </div>
      <ProductionQueueSkeleton />
    </ProductionFrame>
  );
}
