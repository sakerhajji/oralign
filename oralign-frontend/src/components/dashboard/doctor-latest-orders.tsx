'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowUpRightIcon,
  ArrowDown,
  ArrowUpDown,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  Filter,
  RefreshCwIcon,
  SearchIcon,
  X,
} from 'lucide-react';
import { useDebouncedCallback } from 'use-debounce';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import {
  OrderPatientCell,
  OrderReviewBadge,
} from '@/components/orders/order-list-cells';
import { useOrderPrefetch, useOrders } from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';
import {
  buildOrderNavigationHref,
  handleOrderNavigation,
} from '@/lib/orders/order-navigation';
import {
  type DentalOrder,
  type OrderFilterParams,
  OrderStatus,
  type SortOrder,
} from '@/lib/types';
import { cn } from '@/lib/utils';

const DASHBOARD_ORDERS_LIMIT = 8;

type DashboardOrderFilterKey =
  | 'all'
  | 'submitted'
  | 'treatment'
  | 'payment'
  | 'production'
  | 'completed';

type DashboardOrderSortKey = 'updated-desc' | 'created-desc' | 'code-asc';

const FILTERS: Array<{
  key: DashboardOrderFilterKey;
  labelKey: string;
  statuses?: OrderStatus[];
}> = [
  { key: 'all', labelKey: 'dashboard.orders.filters.all' },
  {
    key: 'submitted',
    labelKey: 'dashboard.orders.filters.submitted',
    statuses: [OrderStatus.SUBMITTED, OrderStatus.UNDER_REVIEW],
  },
  {
    key: 'treatment',
    labelKey: 'dashboard.orders.filters.treatment',
    statuses: [
      OrderStatus.TREATMENT_PLANNING,
      OrderStatus.TREATMENT_PLAN_READY,
      OrderStatus.REVISION_REQUESTED,
      OrderStatus.TREATMENT_APPROVED,
    ],
  },
  {
    key: 'payment',
    labelKey: 'dashboard.orders.filters.payment',
    statuses: [
      OrderStatus.QUOTATION_SENT,
      OrderStatus.PAYMENT_PLAN_SELECTED,
      OrderStatus.PAYMENT_PENDING,
      OrderStatus.PAYMENT_REVIEW,
    ],
  },
  {
    key: 'production',
    labelKey: 'dashboard.orders.filters.production',
    statuses: [
      OrderStatus.PAID,
      OrderStatus.FABRICATION,
      OrderStatus.READY_TO_SHIP,
      OrderStatus.SHIPPED,
    ],
  },
  {
    key: 'completed',
    labelKey: 'dashboard.orders.filters.completed',
    statuses: [OrderStatus.FINISHED],
  },
];

const SORTS: Array<{
  key: DashboardOrderSortKey;
  labelKey: string;
  sortBy: OrderFilterParams['sortBy'];
  sortOrder: SortOrder;
}> = [
  {
    key: 'updated-desc',
    labelKey: 'dashboard.orders.sort.updatedDesc',
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  },
  {
    key: 'created-desc',
    labelKey: 'dashboard.orders.sort.createdDesc',
    sortBy: 'createdAt',
    sortOrder: 'desc',
  },
  {
    key: 'code-asc',
    labelKey: 'dashboard.orders.sort.codeAsc',
    sortBy: 'orderCode',
    sortOrder: 'asc',
  },
];

function validFilter(value: string | null): DashboardOrderFilterKey {
  return FILTERS.some((filter) => filter.key === value)
    ? (value as DashboardOrderFilterKey)
    : 'all';
}

function validSort(value: string | null): DashboardOrderSortKey {
  return SORTS.some((sort) => sort.key === value)
    ? (value as DashboardOrderSortKey)
    : 'updated-desc';
}

function validPage(value: string | null): number {
  const page = Number(value ?? '1');
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function formatDateTime(value: string, lang: 'en' | 'fr') {
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDateOnly(value: string, lang: 'en' | 'fr') {
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-CA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function searchParamsToString(params: URLSearchParams) {
  const value = params.toString();
  return value ? `?${value}` : '';
}

export function DoctorLatestOrders() {
  const { t, lang } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prefetchOrder = useOrderPrefetch();

  const filterKey = validFilter(searchParams.get('ordersStatus'));
  const sortKey = validSort(searchParams.get('ordersSort'));
  const page = validPage(searchParams.get('ordersPage'));
  const urlSearchValue = searchParams.get('ordersSearch') ?? '';
  const [searchValue, setSearchValue] = useState(urlSearchValue);

  useEffect(() => {
    setSearchValue(urlSearchValue);
  }, [urlSearchValue]);

  const filter = FILTERS.find((item) => item.key === filterKey) ?? FILTERS[0]!;
  const sort = SORTS.find((item) => item.key === sortKey) ?? SORTS[0]!;

  const updateQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(patch).forEach(([key, value]) => {
        if (!value) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      });
      router.replace(`${pathname}${searchParamsToString(next)}`, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const debouncedSearch = useDebouncedCallback((value: string) => {
    updateQuery({
      ordersSearch: value.trim() || null,
      ordersPage: null,
    });
  }, 300);

  const queryParams = useMemo<OrderFilterParams>(
    () => ({
      page,
      limit: DASHBOARD_ORDERS_LIMIT,
      search: urlSearchValue.trim() || undefined,
      statuses: filter.statuses,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    }),
    [filter.statuses, page, sort.sortBy, sort.sortOrder, urlSearchValue],
  );

  const ordersQuery = useOrders(queryParams);
  const orders = ordersQuery.data?.data ?? [];
  const total = ordersQuery.data?.total ?? 0;
  const totalPages = Math.max(ordersQuery.data?.totalPages ?? 1, 1);
  const hasActiveFilters =
    filterKey !== 'all' ||
    sortKey !== 'updated-desc' ||
    Boolean(urlSearchValue.trim());
  const returnTo = `${pathname}${searchParamsToString(
    new URLSearchParams(searchParams.toString()),
  )}`;

  const openOrder = useCallback(
    (order: DentalOrder) => {
      handleOrderNavigation(order, router, { returnTo });
    },
    [returnTo, router],
  );

  const clearFilters = useCallback(() => {
    debouncedSearch.cancel();
    setSearchValue('');
    updateQuery({
      ordersSearch: null,
      ordersStatus: null,
      ordersSort: null,
      ordersPage: null,
    });
  }, [debouncedSearch, updateQuery]);

  const setOrderFilter = useCallback(
    (value: DashboardOrderFilterKey) => {
      updateQuery({
        ordersStatus: value === 'all' ? null : value,
        ordersPage: null,
      });
    },
    [updateQuery],
  );

  const setOrderSort = useCallback(
    (value: DashboardOrderSortKey) => {
      updateQuery({
        ordersSort: value === 'updated-desc' ? null : value,
        ordersPage: null,
      });
    },
    [updateQuery],
  );

  return (
    <section className="space-y-4" aria-labelledby="doctor-orders-title">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            <ClipboardListIcon className="size-3.5 text-primary" />
            {t('dashboard.orders.eyebrow')}
          </div>
          <h2
            id="doctor-orders-title"
            className="text-xl font-semibold tracking-tight"
          >
            {t('dashboard.orders.title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('dashboard.orders.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => ordersQuery.refetch()}
            disabled={ordersQuery.isFetching}
          >
            <RefreshCwIcon
              className={cn(
                'mr-2 size-4',
                ordersQuery.isFetching && 'animate-spin',
              )}
            />
            {t('dashboard.refresh')}
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/orders/new">
              {t('dashboard.orders.newOrder')}
            </Link>
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="gap-3 border-b bg-muted/20 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 text-sm font-semibold">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Filter className="size-4" aria-hidden="true" />
              </span>
              {t('dashboard.orders.filterLabel')}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {t('dashboard.orders.paginationSummary', {
                  total,
                  page,
                  totalPages,
                })}
              </span>
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={clearFilters}
                >
                  <X className="size-3.5" aria-hidden="true" />
                  {t('dashboard.orders.clearFilters')}
                </Button>
              )}
            </div>
          </div>

          <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(360px,1.65fr)] xl:grid-cols-[minmax(300px,1fr)_minmax(500px,1.6fr)]">
            <div className="relative min-w-0 md:order-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={searchValue}
                onChange={(event) => {
                  setSearchValue(event.target.value);
                  debouncedSearch(event.target.value);
                }}
                placeholder={t('dashboard.orders.searchPlaceholder')}
                aria-label={t('dashboard.orders.searchPlaceholder')}
                className="h-10 pl-9 pr-9"
              />
              {searchValue && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    debouncedSearch.cancel();
                    setSearchValue('');
                    updateQuery({ ordersSearch: null, ordersPage: null });
                  }}
                  aria-label={t('dashboard.orders.clearSearch')}
                  title={t('dashboard.orders.clearSearch')}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <div
              className="hidden h-10 min-w-0 items-center gap-1 overflow-x-auto rounded-lg border bg-background p-1 scrollbar-none md:order-3 md:col-span-2 xl:order-2 xl:col-span-1"
              role="tablist"
              aria-label={t('dashboard.orders.filterLabel')}
            >
              {FILTERS.map((item) => {
                const active = item.key === filterKey;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setOrderFilter(item.key)}
                    className={cn(
                      'min-h-8 shrink-0 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {t(item.labelKey)}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2 md:hidden">
              <Select
                value={filterKey}
                onValueChange={(value) => setOrderFilter(value as DashboardOrderFilterKey)}
              >
                <SelectTrigger
                  aria-label={t('dashboard.orders.filterLabel')}
                  className="h-10 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILTERS.map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      {t(item.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={sortKey}
                onValueChange={(value) => setOrderSort(value as DashboardOrderSortKey)}
              >
                <SelectTrigger
                  aria-label={t('dashboard.orders.sortLabel')}
                  className="h-10 w-full justify-start gap-1.5"
                >
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t('ordersPage.sortBy')}:
                  </span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORTS.map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      {t(item.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {ordersQuery.isError ? (
            <div className="p-4 sm:p-6">
              <Alert variant="destructive">
                <AlertTitle>{t('dashboard.orders.errorTitle')}</AlertTitle>
                <AlertDescription>
                  {ordersQuery.error?.message ??
                    t('dashboard.orders.errorDescription')}
                </AlertDescription>
              </Alert>
            </div>
          ) : ordersQuery.isLoading ? (
            <OrderSkeleton />
          ) : orders.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <ClipboardListIcon className="size-6" />
              </div>
              <div className="space-y-1">
                <p className="font-medium">{t('dashboard.orders.emptyTitle')}</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  {t('dashboard.orders.emptyDescription')}
                </p>
              </div>
              <Button asChild size="sm">
                <Link href="/dashboard/orders/new">
                  {t('dashboard.orders.newOrder')}
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table className="min-w-[1240px]">
                  <TableHeader className="bg-muted/30">
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableHead className="min-w-[230px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('dashboard.orders.colPatient')}
                      </TableHead>
                      <TableHead
                        className="w-[150px] p-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        aria-sort={sortKey === 'code-asc' ? 'ascending' : 'none'}
                      >
                        <button
                          type="button"
                          className="flex min-h-10 w-full items-center gap-1 px-2 text-left transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                          onClick={() => setOrderSort('code-asc')}
                        >
                          {t('dashboard.orders.colCaseId')}
                          {sortKey === 'code-asc' ? (
                            <ArrowDown className="size-3.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <ArrowUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[190px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('dashboard.orders.colPractice')}
                      </TableHead>
                      <TableHead className="min-w-[180px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('dashboard.orders.colDoctor')}
                      </TableHead>
                      <TableHead
                        className="w-[150px] p-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        aria-sort={sortKey === 'created-desc' ? 'descending' : 'none'}
                      >
                        <button
                          type="button"
                          className="flex min-h-10 w-full items-center gap-1 px-2 text-left transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                          onClick={() => setOrderSort('created-desc')}
                        >
                          {t('dashboard.orders.colSubmitTime')}
                          {sortKey === 'created-desc' ? (
                            <ArrowDown className="size-3.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <ArrowUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
                          )}
                        </button>
                      </TableHead>
                      <TableHead
                        className="w-[150px] p-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        aria-sort={sortKey === 'updated-desc' ? 'descending' : 'none'}
                      >
                        <button
                          type="button"
                          className="flex min-h-10 w-full items-center gap-1 px-2 text-left transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                          onClick={() => setOrderSort('updated-desc')}
                        >
                          {t('dashboard.orders.colUpdateTime')}
                          {sortKey === 'updated-desc' ? (
                            <ArrowDown className="size-3.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <ArrowUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[165px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('dashboard.orders.colCaseStatus')}
                      </TableHead>
                      <TableHead className="min-w-[185px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('dashboard.orders.colReviewStatus')}
                      </TableHead>
                      <TableHead className="min-w-[150px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('dashboard.orders.colOperation')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow
                        key={order.id}
                        role="link"
                        tabIndex={0}
                        aria-label={t('dashboard.orders.openAria', {
                          code: order.orderCode,
                        })}
                        onMouseEnter={() => prefetchOrder(order.id)}
                        onFocus={() => prefetchOrder(order.id)}
                        onClick={(event) => {
                          if (
                            (event.target as HTMLElement).closest('button, a')
                          ) {
                            return;
                          }
                          openOrder(order);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openOrder(order);
                          }
                        }}
                        className="cursor-pointer transition hover:bg-muted/35 focus:bg-muted/50 focus:outline-none"
                      >
                        <TableCell>
                          <OrderPatientCell
                            patient={order.patient}
                            emptyLabel={t('dashboard.orders.noPatient')}
                            emptyContactLabel={t('dashboard.orders.noContact')}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm font-medium text-foreground">
                          {order.orderCode}
                        </TableCell>
                        <TableCell>
                          <span className="block max-w-[190px] truncate text-sm font-medium">
                            {order.doctor?.clinicName ?? t('dashboard.orders.notSet')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {order.doctor?.fullName ?? t('dashboard.orders.notSet')}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {order.doctor?.email}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDateOnly(order.submittedAt ?? order.createdAt, lang)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDateOnly(order.updatedAt, lang)}
                        </TableCell>
                        <TableCell>
                          <OrderStatusBadge status={order.status} />
                        </TableCell>
                        <TableCell>
                          <OrderReviewBadge
                            order={order}
                            isDoctor
                            isAdmin={false}
                            showEmpty
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-3">
                            <Link
                              href={`/dashboard/orders/${order.id}/edit`}
                              className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {t('dashboard.orders.editShort')}
                            </Link>
                            <Link
                              href={buildOrderNavigationHref(order, {
                                returnTo,
                              })}
                              className="text-xs font-semibold text-foreground transition hover:text-primary"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {t('dashboard.orders.detailShort')}
                            </Link>
                            <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              className="size-8"
                            >
                              <Link
                                href={buildOrderNavigationHref(order, {
                                  returnTo,
                                })}
                                aria-label={t('dashboard.orders.openAria', {
                                  code: order.orderCode,
                                })}
                              >
                                <ArrowUpRightIcon className="size-4" />
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 p-3 md:hidden">
                {orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    returnTo={returnTo}
                    onOpen={() => openOrder(order)}
                    onPrefetch={() => prefetchOrder(order.id)}
                  />
                ))}
              </div>
            </>
          )}

          <div className="flex flex-col gap-3 border-t p-4 pr-24 sm:flex-row sm:items-center sm:justify-between sm:pr-28">
            <p className="min-w-0 text-sm text-muted-foreground">
              {t('dashboard.orders.paginationSummary', {
                total,
                page,
                totalPages,
              })}
            </p>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10"
                disabled={page <= 1 || ordersQuery.isFetching}
                onClick={() =>
                  updateQuery({
                    ordersPage: String(Math.max(1, page - 1)),
                  })
                }
              >
                <ChevronLeftIcon className="mr-1 size-4" />
                {t('dashboard.orders.previous')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10"
                disabled={page >= totalPages || ordersQuery.isFetching}
                onClick={() =>
                  updateQuery({
                    ordersPage: String(Math.min(totalPages, page + 1)),
                  })
                }
              >
                {t('dashboard.orders.next')}
                <ChevronRightIcon className="ml-1 size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function OrderSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1.2fr_1fr_120px_170px]"
        >
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-32" />
        </div>
      ))}
    </div>
  );
}

function OrderCard({
  order,
  returnTo,
  onOpen,
  onPrefetch,
}: {
  order: DentalOrder;
  returnTo: string;
  onOpen: () => void;
  onPrefetch: () => void;
}) {
  const { t, lang } = useT();

  return (
    <Card
      role="link"
      tabIndex={0}
      aria-label={t('dashboard.orders.openAria', { code: order.orderCode })}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a')) {
          return;
        }
        onOpen();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer border-border/80 bg-card shadow-sm transition active:scale-[0.99] hover:border-primary/25 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      <CardContent className="space-y-3.5 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <OrderPatientCell
            patient={order.patient}
            emptyLabel={t('dashboard.orders.noPatient')}
            emptyContactLabel={t('dashboard.orders.noContact')}
            className="min-w-0 flex-1"
          />
          <div className="max-w-[42%] shrink-0 [&_span]:max-w-full [&_span]:truncate">
            <OrderStatusBadge status={order.status} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-mono font-semibold text-foreground">
            {order.orderCode}
          </span>
          <span aria-hidden="true">•</span>
          <span className="font-medium text-foreground">
            {t('dashboard.orders.created', {
              date: formatDateTime(order.createdAt, lang),
            })}
          </span>
          <span aria-hidden="true">•</span>
          <span className="truncate">
            {t('dashboard.orders.colLastUpdated')}: {formatDateTime(order.updatedAt, lang)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <span className="text-xs text-muted-foreground">
            {t('dashboard.orders.contact')}
          </span>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href={buildOrderNavigationHref(order, { returnTo })}>
              {t('dashboard.orders.open')}
              <ArrowUpRightIcon className="size-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
