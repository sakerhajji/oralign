'use client';

import { useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ActivityIcon,
  AlertTriangleIcon,
  BadgeCheckIcon,
  BanIcon,
  CircleDollarSignIcon,
  ClipboardListIcon,
  PackageIcon,
  RefreshCwIcon,
  TimerIcon,
  TrendingUpIcon,
  UserPlusIcon,
  UserRoundIcon,
  UsersIcon,
  WalletIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { KpiCard, KpiGrid } from './kpi-card';
import { DashboardRangePicker } from './date-range-picker';
import {
  useAdminBestPacks,
  useAdminDashboardKpis,
  useAdminTopDoctors,
  useAdminTrends,
  useDashboardSocket,
} from '@/lib/hooks';
import { getAvatarUrl } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import type { DashboardRange } from '@/lib/types';

const TND = (n: number, opts: Intl.NumberFormatOptions = {}) =>
  new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    ...opts,
  }).format(n) + ' TND';

const N = (n: number) => new Intl.NumberFormat('en-US').format(n);

const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

function defaultRange(): DashboardRange {
  // Match the backend default: last 30 days.
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * Admin dashboard — the landing experience for admin / super_admin
 * users. KPI grid → trends chart → top doctors → best packs.
 *
 * The whole page is reactive to a single date-range filter; the WS
 * hook keeps every block in lockstep with backend writes (payment
 * confirmed, order created, etc.) by invalidating the React-Query
 * cache. The cards self-render skeletons while the first fetch
 * resolves so the page never flashes empty.
 */
export function AdminDashboard() {
  const { t, lang } = useT();
  const [range, setRange] = useState<DashboardRange>(defaultRange);
  useDashboardSocket();
  // Chart axis/tooltip dates follow the app language, not the browser.
  const dateLocale = lang === 'fr' ? 'fr-FR' : 'en-US';

  const kpis = useAdminDashboardKpis(range);
  const topDoctors = useAdminTopDoctors({ ...range, limit: 5 });
  const bestPacks = useAdminBestPacks({ ...range, limit: 10 });
  const trends = useAdminTrends(range);

  const d = kpis.data;
  const loading = kpis.isLoading;
  // Surface ANY of the four queries failing — if the backend is down or
  // a route is missing, render an error banner instead of an infinite
  // skeleton sea so the admin knows what to fix.
  const anyError =
    kpis.isError || topDoctors.isError || bestPacks.isError || trends.isError;
  const firstError =
    kpis.error ?? topDoctors.error ?? bestPacks.error ?? trends.error;

  const refetchAll = () => {
    kpis.refetch();
    topDoctors.refetch();
    bestPacks.refetch();
    trends.refetch();
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      {/* Header — title + global date range */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('adminDashboard.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('adminDashboard.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DashboardRangePicker value={range} onChange={setRange} />
          <Button
            variant="outline"
            size="icon"
            onClick={refetchAll}
            disabled={kpis.isFetching}
            aria-label={t('adminDashboard.refreshAria')}
          >
            <RefreshCwIcon
              className={kpis.isFetching ? 'size-4 animate-spin' : 'size-4'}
            />
          </Button>
        </div>
      </div>

      {/* Visible error banner — without this the cards stay in skeleton
          mode forever and the user has no way to know the API failed. */}
      {anyError && (
        <Alert variant="destructive">
          <AlertTriangleIcon className="size-4" />
          <AlertTitle>{t('adminDashboard.errorTitle')}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              {firstError instanceof Error
                ? firstError.message
                : t('adminDashboard.errorGeneric')}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={refetchAll}
              className="mt-2"
            >
              {t('dashboard.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Top KPIs — money first */}
      <KpiGrid>
        <KpiCard
          label={t('adminDashboard.kpi.totalRevenueRange')}
          value={TND(d?.revenue.total ?? 0)}
          icon={CircleDollarSignIcon}
          delta={{
            value: d?.revenue.monthlyGrowthPct ?? 0,
            direction:
              (d?.revenue.monthlyGrowthPct ?? 0) >= 0 ? 'up' : 'down',
          }}
          footerLabel={t('dashboard.kpi.paidOrdersCollected', {
            amount: TND(d?.revenue.collected ?? 0),
          })}
          footerDetail={t('adminDashboard.kpi.unpaidAmount', {
            amount: TND(d?.revenue.unpaid ?? 0),
          })}
          loading={loading}
        />
        <KpiCard
          label={t('adminDashboard.kpi.revenueThisMonth')}
          value={TND(d?.revenue.thisMonth ?? 0)}
          icon={WalletIcon}
          delta={{
            value: d?.revenue.monthlyGrowthPct ?? 0,
            direction:
              (d?.revenue.monthlyGrowthPct ?? 0) >= 0 ? 'up' : 'down',
            label: t('adminDashboard.kpi.vsLastMonth'),
          }}
          footerLabel={t('adminDashboard.kpi.todayAmount', {
            amount: TND(d?.revenue.today ?? 0),
          })}
          footerDetail={t('adminDashboard.kpi.prevMonthAmount', {
            amount: TND(d?.revenue.prevMonth ?? 0),
          })}
          loading={loading}
        />
        <KpiCard
          label={t('adminDashboard.kpi.avgOrderValue')}
          value={TND(d?.packs.averageOrderValue ?? 0)}
          icon={TrendingUpIcon}
          footerLabel={t('adminDashboard.kpi.conversion', {
            pct: d?.packs.conversionRatePct ?? 0,
          })}
          footerDetail={t('adminDashboard.kpi.conversionDetail')}
          loading={loading}
        />
        <KpiCard
          label={t('dashboard.kpi.pendingPayments')}
          value={t('adminDashboard.kpi.pendingCount', {
            count: N(d?.payments.pending ?? 0),
          })}
          icon={TimerIcon}
          footerLabel={t('dashboard.kpi.awaitingConfirmation', {
            count: N(d?.payments.awaitingConfirmation ?? 0),
          })}
          footerDetail={t('adminDashboard.kpi.failedRejected', {
            failed: N(d?.payments.failed ?? 0),
            rejected: N(d?.payments.rejected ?? 0),
          })}
          loading={loading}
        />
      </KpiGrid>

      {/* Doctors + Patients KPIs */}
      <KpiGrid>
        <KpiCard
          label={t('adminDashboard.kpi.totalDoctors')}
          value={N(d?.doctors.total ?? 0)}
          icon={UsersIcon}
          footerLabel={t('adminDashboard.kpi.activeInactive', {
            active: N(d?.doctors.active ?? 0),
            inactive: N(d?.doctors.inactive ?? 0),
          })}
          footerDetail={t('adminDashboard.kpi.newInRange', {
            count: N(d?.doctors.newInRange ?? 0),
          })}
          loading={loading}
        />
        <KpiCard
          label={t('adminDashboard.kpi.newDoctorsRange')}
          value={N(d?.doctors.newInRange ?? 0)}
          icon={UserPlusIcon}
          loading={loading}
        />
        <KpiCard
          label={t('dashboard.kpi.totalPatients')}
          value={N(d?.patients.total ?? 0)}
          icon={UserRoundIcon}
          footerLabel={t('adminDashboard.kpi.patientsInRange', {
            count: N(d?.patients.newInRange ?? 0),
          })}
          loading={loading}
        />
        <KpiCard
          label={t('adminDashboard.kpi.activePacks')}
          value={N(d?.packs.active ?? 0)}
          icon={PackageIcon}
          footerLabel={
            d?.packs.bestSelling
              ? t('adminDashboard.kpi.topPack', {
                  name: d.packs.bestSelling.name,
                })
              : t('adminDashboard.kpi.noBestSeller')
          }
          footerDetail={
            d?.packs.bestSelling
              ? t('adminDashboard.kpi.soldRevenue', {
                  count: N(d.packs.bestSelling.soldCount),
                  amount: TND(d.packs.bestSelling.revenue),
                })
              : undefined
          }
          loading={loading}
        />
      </KpiGrid>

      {/* Orders + Payments KPIs */}
      <KpiGrid>
        <KpiCard
          label={t('dashboard.kpi.totalOrders')}
          value={N(d?.orders.total ?? 0)}
          icon={ClipboardListIcon}
          footerLabel={t('dashboard.kpi.totalOrdersThisMonth', {
            count: N(d?.orders.thisMonth ?? 0),
          })}
          footerDetail={t('adminDashboard.kpi.todayInRange', {
            today: N(d?.orders.today ?? 0),
            range: N(d?.orders.inRange ?? 0),
          })}
          loading={loading}
        />
        <KpiCard
          label={t('dashboard.kpi.paidOrders')}
          value={N(d?.orders.paid ?? 0)}
          icon={BadgeCheckIcon}
          footerLabel={t('dashboard.kpi.paidOrdersCollected', {
            amount: TND(d?.revenue.total ?? 0),
          })}
          loading={loading}
        />
        <KpiCard
          label={t('dashboard.kpi.unpaidOrders')}
          value={N(d?.orders.unpaid ?? 0)}
          icon={BanIcon}
          footerLabel={t('adminDashboard.kpi.unpaidBalance', {
            amount: TND(d?.revenue.unpaid ?? 0),
          })}
          loading={loading}
        />
        <KpiCard
          label={t('adminDashboard.kpi.completedPayments')}
          value={N(d?.payments.completed ?? 0)}
          icon={ActivityIcon}
          footerLabel={t('adminDashboard.kpi.failedCount', {
            count: N(d?.payments.failed ?? 0),
          })}
          footerDetail={t('adminDashboard.kpi.pendingDetail', {
            count: N(d?.payments.pending ?? 0),
          })}
          loading={loading}
        />
      </KpiGrid>

      {/* Revenue + orders trend chart */}
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>{t('adminDashboard.trend.title')}</CardTitle>
          <CardDescription>
            {t('adminDashboard.trend.subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          {trends.isLoading || !trends.data ? (
            <Skeleton className="h-[260px] w-full" />
          ) : trends.data.points.length === 0 ? (
            <p className="grid h-[260px] place-items-center text-sm text-muted-foreground">
              {t('adminDashboard.trend.empty')}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trends.data.points}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeOpacity={0.2} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tickFormatter={(d: string) =>
                    new Date(d).toLocaleDateString(dateLocale, {
                      month: 'short',
                      day: 'numeric',
                    })
                  }
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    background: 'hsl(var(--popover))',
                  }}
                  formatter={(value, name) => {
                    const v = typeof value === 'number' ? value : Number(value ?? 0);
                    const key = String(name ?? '');
                    const seriesLabel =
                      key === 'revenue'
                        ? t('adminDashboard.trend.seriesRevenue')
                        : key === 'orders'
                          ? t('adminDashboard.trend.seriesOrders')
                          : key;
                    return [key === 'revenue' ? TND(v) : N(v), seriesLabel];
                  }}
                  labelFormatter={(label) => {
                    const raw = typeof label === 'string' ? label : String(label ?? '');
                    if (!raw) return '';
                    const dt = new Date(raw);
                    if (Number.isNaN(dt.getTime())) return raw;
                    return dt.toLocaleDateString(dateLocale, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    });
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--primary))"
                  fill="url(#revenueFill)"
                  strokeWidth={2}
                  // Recharts' default 1.5 s SVG path animation re-runs
                  // every time ResponsiveContainer fires a resize event
                  // — and ResponsiveContainer's ResizeObserver fires on
                  // every frame of the sidebar's width transition.
                  // Disabling animation kills that re-run and is the
                  // single biggest fix for the sidebar lag on this page.
                  // Data updates still appear instantly when the
                  // backend pushes a new dataset; only the entry
                  // animation is suppressed.
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="orders"
                  stroke="hsl(var(--muted-foreground))"
                  fill="url(#ordersFill)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top doctors — tabbed list */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adminDashboard.topDoctors.title')}</CardTitle>
          <CardDescription>
            {t('adminDashboard.topDoctors.subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topDoctors.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Tabs defaultValue="orders">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="orders">
                  {t('adminDashboard.topDoctors.tabOrders')}
                </TabsTrigger>
                <TabsTrigger value="paid">
                  {t('adminDashboard.topDoctors.tabPaid')}
                </TabsTrigger>
                <TabsTrigger value="outstanding">
                  {t('adminDashboard.topDoctors.tabOutstanding')}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="orders">
                <DoctorList
                  rows={topDoctors.data?.byOrders ?? []}
                  amountKey="orders"
                />
              </TabsContent>
              <TabsContent value="paid">
                <DoctorList
                  rows={topDoctors.data?.byPaidOrders ?? []}
                  amountKey="paidOrders"
                />
              </TabsContent>
              <TabsContent value="outstanding">
                <DoctorList
                  rows={topDoctors.data?.byOutstanding ?? []}
                  amountKey="outstanding"
                />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Best-selling packs */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adminDashboard.bestPacks.title')}</CardTitle>
          <CardDescription>
            {t('adminDashboard.bestPacks.subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bestPacks.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (bestPacks.data?.length ?? 0) === 0 ? (
            <p className="grid h-24 place-items-center text-sm text-muted-foreground">
              {t('adminDashboard.bestPacks.empty')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">
                      {t('adminDashboard.bestPacks.colPack')}
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      {t('adminDashboard.bestPacks.colSold')}
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      {t('adminDashboard.bestPacks.colRevenue')}
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      {t('adminDashboard.bestPacks.colCollected')}
                    </th>
                    <th className="py-2 text-right font-medium">
                      {t('adminDashboard.bestPacks.colCurrentPrice')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bestPacks.data!.map((row) => (
                    <tr key={row.packId} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{row.name}</span>
                          {!row.isActive ? (
                            <Badge variant="outline" className="text-xs">
                              {t('adminDashboard.bestPacks.inactive')}
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {N(row.sold)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {TND(row.revenue)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {TND(row.collected)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {TND(row.currentPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DoctorList({
  rows,
  amountKey,
}: {
  rows: Array<{
    doctorId: string;
    fullName: string;
    email: string;
    avatarUrl: string | null;
    clinicName: string | null;
    city: string | null;
    orders: number;
    paidOrders: number;
    revenue: number;
    outstanding: number;
  }>;
  amountKey: 'orders' | 'paidOrders' | 'outstanding';
}) {
  const { t } = useT();
  if (rows.length === 0) {
    return (
      <p className="grid h-24 place-items-center text-sm text-muted-foreground">
        {t('adminDashboard.topDoctors.empty')}
      </p>
    );
  }
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li
          key={r.doctorId}
          className="flex items-center gap-3 py-3"
        >
          <Avatar className="size-9">
            <AvatarImage src={getAvatarUrl(r.avatarUrl ?? undefined)} />
            <AvatarFallback>{initials(r.fullName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{r.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {r.clinicName ?? r.email}
              {r.city ? ` · ${r.city}` : ''}
            </p>
          </div>
          <div className="text-right text-sm tabular-nums">
            {amountKey === 'orders' && (
              <>
                <p className="font-semibold">
                  {t('adminDashboard.topDoctors.ordersCount', {
                    count: N(r.orders),
                  })}
                </p>
                <p className="text-xs text-muted-foreground">{TND(r.revenue)}</p>
              </>
            )}
            {amountKey === 'paidOrders' && (
              <>
                <p className="font-semibold">
                  {t('adminDashboard.topDoctors.paidCount', {
                    count: N(r.paidOrders),
                  })}
                </p>
                <p className="text-xs text-muted-foreground">{TND(r.revenue)}</p>
              </>
            )}
            {amountKey === 'outstanding' && (
              <>
                <p className="font-semibold text-destructive">
                  {TND(r.outstanding)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('adminDashboard.topDoctors.unpaid')}
                </p>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
