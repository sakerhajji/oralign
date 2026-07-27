'use client';

import { useState } from 'react';
import {
  AlertTriangleIcon,
  CircleDollarSignIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  PackageCheckIcon,
  RefreshCwIcon,
  StethoscopeIcon,
  WalletIcon,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { KpiCard } from './kpi-card';
import { DashboardSlider } from './dashboard-slider';
import { DoctorLatestOrders } from './doctor-latest-orders';
import { OutstandingBalanceDialog } from './outstanding-balance-dialog';
import { PaidOrdersDialog } from './paid-orders-dialog';
import { useDashboardSocket, useDoctorDashboardKpis } from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';

// Number formatters keyed on the current language so French users see
// `1 234` (FR locale uses NBSP as thousands separator) and English
// users see `1,234`. TND symbol stays universal — Tunisia uses Dinar
// in both languages.
const useFormatters = () => {
  const { lang } = useT();
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  const TND = (n: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n) +
    ' TND';
  const N = (n: number) => new Intl.NumberFormat(locale).format(n);
  return { TND, N };
};

/**
 * Doctor dashboard — re-spec'd to the layout the clinical team asked for.
 *
 * Order on the page:
 *   1. Slider          (most visible — promo / latest from Oralign)
 *   2. KPI grid        (workflow, finance, and pack-credit signals)
 *   3. Latest orders   (searchable, paginated, last-updated first)
 *
 * Every KPI is doctor-scoped: the backend enforces `doctorId = req.user.sub`
 * on the underlying Prisma queries, so a doctor only ever sees their own
 * data. Real-time updates via `useDashboardSocket()` keep counters fresh
 * after a doctor pays, an admin confirms a transfer, etc.
 *
 * The Outstanding-balance tile is colour-coded:
 *   • 0 TND   → emerald  ("you're clear")
 *   • > 0 TND → destructive red ("you owe — pay it or follow up with the team")
 *
 * The order stream below the cards uses the same role-scoped /orders
 * endpoint as the full orders page, so doctors only see their cases.
 */
export function DoctorDashboard() {
  useDashboardSocket();
  const { data, isLoading, isError, error, refetch, isFetching } =
    useDoctorDashboardKpis();
  const d = data;
  const loading = isLoading;
  const { t } = useT();
  const { TND, N } = useFormatters();

  // Click on the Outstanding-balance KPI (and the Unpaid-orders KPI —
  // they show the same underlying data) opens a detailed breakdown
  // modal. Kept as local state so the dashboard owns the only source
  // of truth for whether the dialog is open. The Paid-orders KPI gets
  // its own mirrored dialog with an emerald "money collected" story.
  const [outstandingOpen, setOutstandingOpen] = useState(false);
  const [paidOpen, setPaidOpen] = useState(false);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      {/* ─── Header ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('dashboard.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('dashboard.subtitle')}
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
          {t('dashboard.refresh')}
        </Button>
      </div>

      {/* Visible error banner — without this every KPI sits in a
          skeleton state forever and the doctor has no clue why. */}
      {isError && (
        <Alert variant="destructive">
          <AlertTriangleIcon className="size-4" />
          <AlertTitle>{t('dashboard.loadError.title')}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              {error instanceof Error
                ? error.message
                : t('dashboard.loadError.generic')}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              className="mt-2"
            >
              {t('dashboard.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ─── 1. Slider ────────────────────────────────────────────── */}
      {/* Promoted to the TOP per spec — what's new is the first thing
          the doctor sees the moment they log in. */}
      <section className="space-y-3">
        <DashboardSlider />
      </section>

      {/* ─── 2. KPI grid ──────────────────────────────────────────── */}
      <section className="grid w-full grid-cols-1 items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label={t('dashboard.kpi.submittedOrders')}
          value={N(d?.orders.submitted ?? 0)}
          icon={ClipboardListIcon}
          tone="primary"
          href="/dashboard/orders"
          footerLabel={t('dashboard.kpi.submittedHint')}
          footerDetail={t('dashboard.kpi.totalOrdersThisMonth', {
            count: N(d?.orders.thisMonth ?? 0),
          })}
          loading={loading}
        />
        <KpiCard
          label={t('dashboard.kpi.treatmentOrders')}
          value={N(d?.orders.inTreatment ?? 0)}
          icon={StethoscopeIcon}
          tone="violet"
          href="/dashboard/orders"
          footerLabel={t('dashboard.kpi.treatmentHint')}
          footerDetail={t('dashboard.kpi.totalOrdersToday', {
            count: N(d?.orders.today ?? 0),
          })}
          loading={loading}
        />
        <KpiCard
          label={t('dashboard.kpi.completedOrders')}
          value={N(d?.orders.completed ?? 0)}
          icon={ClipboardCheckIcon}
          tone="emerald"
          href="/dashboard/orders"
          footerLabel={t('dashboard.kpi.completedHint')}
          footerDetail={t('dashboard.kpi.paidOrdersCollected', {
            amount: TND(d?.revenue.collected ?? 0),
          })}
          loading={loading}
        />
        <KpiCard
          label={t('dashboard.kpi.availableCredits')}
          value={
            d?.currentPack?.isUnlimitedSteps
              ? t('dashboard.kpi.creditsUnlimited')
              : N(
                  d?.currentPack?.remainingCredits ??
                    d?.currentPack?.totalCredits ??
                    0,
                )
          }
          icon={PackageCheckIcon}
          tone={d?.currentPack ? 'sky' : 'neutral'}
          href="/dashboard/packs"
          footerLabel={
            d?.currentPack?.name ?? t('dashboard.kpi.noActivePack')
          }
          footerDetail={
            d?.currentPack?.remainingDays != null
              ? t('dashboard.kpi.creditsRemainingDays', {
                  count: N(d.currentPack.remainingDays),
                })
              : t('dashboard.kpi.viewPacks')
          }
          loading={loading}
        />
        <KpiCard
          label={t('dashboard.kpi.outstandingBalance')}
          value={TND(d?.revenue.unpaidDebt ?? 0)}
          icon={WalletIcon}
          tone={(d?.revenue.unpaidDebt ?? 0) > 0 ? 'red' : 'emerald'}
          valueClassName={
            (d?.revenue.unpaidDebt ?? 0) > 0
              ? 'text-destructive'
              : undefined
          }
          onClick={() => setOutstandingOpen(true)}
          footerLabel={
            (d?.revenue.unpaidDebt ?? 0) > 0
              ? t('dashboard.kpi.outstandingClickForDetails', {
                  count: N(d?.orders.unpaid ?? 0),
                })
              : t('dashboard.kpi.outstandingAllClear')
          }
          loading={loading}
        />
        <KpiCard
          label={t('dashboard.kpi.paidOrders')}
          value={N(d?.orders.paid ?? 0)}
          icon={CircleDollarSignIcon}
          tone="emerald"
          onClick={() => setPaidOpen(true)}
          footerLabel={
            (d?.orders.paid ?? 0) > 0
              ? t('dashboard.kpi.paidOrdersCollected', {
                  amount: TND(d?.revenue.collected ?? 0),
                })
              : t('dashboard.kpi.paidOrdersEmpty')
          }
          loading={loading}
        />
      </section>

      {/* ─── 3. Latest orders ────────────────────────────────────── */}
      <DoctorLatestOrders />

      {/*
        Outstanding-balance details modal. Mounted at the page level so
        a single instance handles every click on the KPI card. The
        underlying query stays disabled until `open === true` so we
        don't fetch the per-order breakdown until the doctor actually
        opens it.

        We pass the headline figures the KPI already resolved so the
        dialog can:
          • Short-circuit to an empty state when nothing is due (no
            network round-trip for an empty list).
          • Degrade to a "summary only" view if the per-order endpoint
            isn't reachable — keeps the popup useful during deploy
            windows where the new route isn't live yet on the running
            backend.
       */}
      <OutstandingBalanceDialog
        open={outstandingOpen}
        onOpenChange={setOutstandingOpen}
        fallbackTotal={d?.revenue.unpaidDebt ?? 0}
        fallbackCount={d?.orders.unpaid ?? 0}
      />

      {/*
        Paid-orders details modal — same lazy-fetch + graceful-degrade
        pattern as the outstanding dialog. Falls back to the KPI's own
        collected revenue + paid-order count if the dedicated
        breakdown endpoint isn't reachable, so the popup is still
        useful during deploy windows when the new route hasn't shipped.
       */}
      <PaidOrdersDialog
        open={paidOpen}
        onOpenChange={setPaidOpen}
        fallbackTotal={d?.revenue.collected ?? 0}
        fallbackCount={d?.orders.paid ?? 0}
      />
    </div>
  );
}
