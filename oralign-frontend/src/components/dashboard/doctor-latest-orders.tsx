'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowUpRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  RefreshCwIcon,
  SearchIcon,
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
import { PatientRestPhoto } from '@/components/orders/patient-rest-photo';
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
  const returnTo = `${pathname}${searchParamsToString(
    new URLSearchParams(searchParams.toString()),
  )}`;

  const openOrder = useCallback(
    (order: DentalOrder) => {
      handleOrderNavigation(order, router, { returnTo });
    },
    [returnTo, router],
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
        <CardHeader className="gap-4 border-b bg-muted/20 p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_190px]">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue}
                onChange={(event) => {
                  setSearchValue(event.target.value);
                  debouncedSearch(event.target.value);
                }}
                placeholder={t('dashboard.orders.searchPlaceholder')}
                className="pl-9"
              />
            </div>
            <Select
              value={filterKey}
              onValueChange={(value) =>
                updateQuery({
                  ordersStatus: value === 'all' ? null : value,
                  ordersPage: null,
                })
              }
            >
              <SelectTrigger aria-label={t('dashboard.orders.filterLabel')}>
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
              onValueChange={(value) =>
                updateQuery({
                  ordersSort: value === 'updated-desc' ? null : value,
                  ordersPage: null,
                })
              }
            >
              <SelectTrigger aria-label={t('dashboard.orders.sortLabel')}>
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
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableHead>{t('dashboard.orders.colOrder')}</TableHead>
                      <TableHead>{t('dashboard.orders.colPatient')}</TableHead>
                      <TableHead>{t('dashboard.orders.colStatus')}</TableHead>
                      <TableHead>{t('dashboard.orders.colLastUpdated')}</TableHead>
                      <TableHead className="w-12 text-right">
                        <span className="sr-only">
                          {t('dashboard.orders.colOpen')}
                        </span>
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
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
                              <ClipboardListIcon className="size-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{order.orderCode}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {t('dashboard.orders.created', {
                                  date: formatDateTime(order.createdAt, lang),
                                })}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <PatientRestPhoto
                              order={order}
                              alt={t('orderForm.files.slots.faceRest')}
                            />
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {order.patient?.fullName ??
                                  t('dashboard.orders.noPatient')}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {order.patient?.phone ||
                                  order.patient?.email ||
                                  t('dashboard.orders.noContact')}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <OrderStatusBadge status={order.status} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDateTime(order.updatedAt, lang)}
                        </TableCell>
                        <TableCell className="text-right">
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

          <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {t('dashboard.orders.paginationSummary', {
                total,
                page,
                totalPages,
              })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
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
        <div className="flex items-start gap-3">
          <PatientRestPhoto
            order={order}
            size="card"
            alt={t('orderForm.files.slots.faceRest')}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {order.patient?.fullName ?? t('dashboard.orders.noPatient')}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {order.orderCode}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {order.patient?.phone ||
                order.patient?.email ||
                t('dashboard.orders.noContact')}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
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
