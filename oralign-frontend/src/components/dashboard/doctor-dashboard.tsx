'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  ActivityIcon,
  AlertTriangleIcon,
  BadgeCheckIcon,
  BanIcon,
  CalendarDaysIcon,
  CircleDollarSignIcon,
  ClipboardListIcon,
  PackageIcon,
  RefreshCwIcon,
  SparklesIcon,
  TimerIcon,
  TrendingUpIcon,
  UserPlusIcon,
  UserRoundIcon,
  WalletIcon,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { KpiCard, KpiGrid } from './kpi-card';
import { DashboardSlider } from './dashboard-slider';
import { AvailablePacks } from './available-packs';
import { useDashboardSocket, useDoctorDashboardKpis } from '@/lib/hooks';

const TND = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n) + ' TND';
const N = (n: number) => new Intl.NumberFormat('en-US').format(n);

/**
 * Doctor dashboard layout (exact spec order):
 *   1. Doctor KPI / statistics section
 *   2. Slider
 *   3. Available packs
 *
 * Every KPI is doctor-scoped (the backend enforces `doctorId = req.user.sub`).
 * Real-time updates via `useDashboardSocket()` keep counters fresh
 * after a doctor pays, an admin confirms a transfer, etc.
 */
export function DoctorDashboard() {
  useDashboardSocket();
  const { data, isLoading, isError, error, refetch, isFetching } =
    useDoctorDashboardKpis();
  const d = data;
  const loading = isLoading;

  // Month-over-month indicator for orders so the doctor sees their
  // own momentum without needing an admin-level chart.
  const monthlyGrowth = (() => {
    const cur = d?.orders.thisMonth ?? 0;
    const prev = d?.orders.prevMonth ?? 0;
    if (prev === 0) return cur > 0 ? 100 : 0;
    return ((cur - prev) / prev) * 100;
  })();

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      {/* ─── 1. Header + KPI section ──────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Your dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Your clinic&apos;s activity, revenue, and pack usage at a glance.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCwIcon
            className={isFetching ? 'mr-2 size-4 animate-spin' : 'mr-2 size-4'}
          />
          Refresh
        </Button>
      </div>

      {/* Visible error banner — without this every KPI just sits in a
          skeleton state forever and the doctor has no clue why. */}
      {isError && (
        <Alert variant="destructive">
          <AlertTriangleIcon className="size-4" />
          <AlertTitle>Could not load your dashboard</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              {error instanceof Error
                ? error.message
                : 'The API did not respond. Please check your internet connection and try again.'}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              className="mt-2"
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Money KPIs */}
      <KpiGrid>
        <KpiCard
          label="Total revenue generated"
          value={TND(d?.revenue.totalGenerated ?? 0)}
          icon={CircleDollarSignIcon}
          footerLabel={`Collected: ${TND(d?.revenue.collected ?? 0)}`}
          footerDetail={`Outstanding: ${TND(d?.revenue.unpaidDebt ?? 0)}`}
          loading={loading}
        />
        <KpiCard
          label="Outstanding balance"
          value={TND(d?.revenue.unpaidDebt ?? 0)}
          icon={BanIcon}
          footerLabel={`Unpaid orders: ${N(d?.orders.unpaid ?? 0)}`}
          loading={loading}
        />
        <KpiCard
          label="Collected to date"
          value={TND(d?.revenue.collected ?? 0)}
          icon={WalletIcon}
          footerLabel={`Paid orders: ${N(d?.orders.paid ?? 0)}`}
          loading={loading}
        />
        <KpiCard
          label="Monthly performance"
          value={N(d?.orders.thisMonth ?? 0) + ' orders'}
          icon={TrendingUpIcon}
          delta={{
            value: Number.isFinite(monthlyGrowth) ? monthlyGrowth : 0,
            direction: monthlyGrowth >= 0 ? 'up' : 'down',
          }}
          footerLabel={`Previous month: ${N(d?.orders.prevMonth ?? 0)}`}
          loading={loading}
        />
      </KpiGrid>

      {/* Cases + patients */}
      <KpiGrid>
        <KpiCard
          label="Total cases"
          value={N(d?.orders.total ?? 0)}
          icon={ClipboardListIcon}
          footerLabel={`This month: ${N(d?.orders.thisMonth ?? 0)}`}
          footerDetail={`Today: ${N(d?.orders.today ?? 0)}`}
          loading={loading}
        />
        <KpiCard
          label="Cases today"
          value={N(d?.orders.today ?? 0)}
          icon={ActivityIcon}
          loading={loading}
        />
        <KpiCard
          label="Total patients"
          value={N(d?.patients.total ?? 0)}
          icon={UserRoundIcon}
          footerLabel={`+${N(d?.patients.newThisMonth ?? 0)} new this month`}
          loading={loading}
        />
        <KpiCard
          label="New patients (month)"
          value={N(d?.patients.newThisMonth ?? 0)}
          icon={UserPlusIcon}
          loading={loading}
        />
      </KpiGrid>

      {/* Payments + orders status */}
      <KpiGrid>
        <KpiCard
          label="Paid orders"
          value={N(d?.orders.paid ?? 0)}
          icon={BadgeCheckIcon}
          loading={loading}
        />
        <KpiCard
          label="Unpaid orders"
          value={N(d?.orders.unpaid ?? 0)}
          icon={BanIcon}
          loading={loading}
        />
        <KpiCard
          label="Pending payments"
          value={N(d?.payments.pending ?? 0)}
          icon={TimerIcon}
          footerLabel={`Awaiting confirmation: ${N(d?.payments.awaitingConfirmation ?? 0)}`}
          loading={loading}
        />
        <KpiCard
          label="Completed payments"
          value={N(d?.payments.completed ?? 0)}
          icon={CircleDollarSignIcon}
          footerLabel={`Failed: ${N(d?.payments.failed ?? 0)}`}
          loading={loading}
        />
      </KpiGrid>

      {/* Current pack panel — only shown when the doctor actually has one */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <PackageIcon className="size-5 text-primary" />
                Current pack
              </CardTitle>
              {d?.currentPack ? (
                <Badge variant="default" className="gap-1">
                  <BadgeCheckIcon className="size-3" /> Active
                </Badge>
              ) : null}
            </div>
            <CardDescription>
              {d?.currentPack
                ? d.currentPack.description ?? 'Active pack for your clinic.'
                : 'You have not subscribed to a pack yet.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="h-24 animate-pulse rounded bg-muted" />
            ) : d?.currentPack ? (
              <>
                <p className="text-xl font-semibold">{d.currentPack.name}</p>
                {d.currentPack.expiresAt ? (
                  <p className="text-sm text-muted-foreground">
                    <CalendarDaysIcon className="mr-1 inline size-3.5" />
                    Expires on{' '}
                    {new Date(d.currentPack.expiresAt).toLocaleDateString()}
                    {typeof d.currentPack.remainingDays === 'number' && (
                      <>
                        {' · '}
                        {d.currentPack.remainingDays} day
                        {d.currentPack.remainingDays === 1 ? '' : 's'} remaining
                      </>
                    )}
                  </p>
                ) : null}
                {!d.currentPack.isUnlimitedSteps &&
                typeof d.currentPack.usagePct === 'number' ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Pack usage</span>
                      <span className="tabular-nums">{d.currentPack.usagePct}%</span>
                    </div>
                    <Progress value={d.currentPack.usagePct} />
                  </div>
                ) : (
                  <Badge variant="outline">Unlimited steps</Badge>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Browse the packs below to subscribe to a plan that fits your clinic.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Suggested pack — admin-level recommendation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <SparklesIcon className="size-5 text-emerald-600" />
              Recommended for you
            </CardTitle>
            <CardDescription>
              Based on platform-wide pack performance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="h-24 animate-pulse rounded bg-muted" />
            ) : d?.suggestedPack ? (
              <>
                <p className="text-lg font-semibold">{d.suggestedPack.name}</p>
                <p className="text-sm text-muted-foreground">
                  {d.suggestedPack.description ??
                    'A popular pack other doctors are subscribing to.'}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                We don't have a recommendation for you yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── 2. Slider section ────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Latest from Oralign
          </h2>
        </div>
        <DashboardSlider />
      </div>

      {/* ─── 3. Available packs section ───────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Available packs
          </h2>
          <span className="text-sm text-muted-foreground">
            Subscribe or upgrade anytime.
          </span>
        </div>
        <AvailablePacks recommendedId={d?.suggestedPack?.id} />
      </div>
    </div>
  );
}
