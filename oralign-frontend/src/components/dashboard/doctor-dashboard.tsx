'use client';

import { useState } from 'react';
import {
  AlertTriangleIcon,
  BadgeCheckIcon,
  BanIcon,
  ClipboardListIcon,
  PackageIcon,
  RefreshCwIcon,
  TimerIcon,
  UserRoundIcon,
  WalletIcon,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { KpiCard } from './kpi-card';
import { DashboardSlider } from './dashboard-slider';
import { AvailablePacks } from './available-packs';
import { OutstandingBalanceDialog } from './outstanding-balance-dialog';
import { useDashboardSocket, useDoctorDashboardKpis } from '@/lib/hooks';

const TND = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n) + ' TND';
const N = (n: number) => new Intl.NumberFormat('en-US').format(n);

/**
 * Doctor dashboard — re-spec'd to the layout the clinical team asked for.
 *
 * Order on the page:
 *   1. Slider          (most visible — promo / latest from Oralign)
 *   2. KPI grid        (6 tiles, centered, two rows × three columns on desktop)
 *   3. Packs catalogue (read-only — packs are info, not a buy surface)
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
 * The Pending-payments tile is clickable and deep-links to the payment
 * history page so the doctor can drill straight from the KPI to the
 * actionable list.
 */
export function DoctorDashboard() {
  useDashboardSocket();
  const { data, isLoading, isError, error, refetch, isFetching } =
    useDoctorDashboardKpis();
  const d = data;
  const loading = isLoading;

  // Click on the Outstanding-balance KPI opens a detailed breakdown
  // modal — kept as local state so the dashboard owns the only source
  // of truth for whether the dialog is open.
  const [outstandingOpen, setOutstandingOpen] = useState(false);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      {/* ─── Header ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Your dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Your clinic&apos;s activity, balance, and pack usage at a glance.
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

      {/* Visible error banner — without this every KPI sits in a
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

      {/* ─── 1. Slider ────────────────────────────────────────────── */}
      {/* Promoted to the TOP per spec — what's new is the first thing
          the doctor sees the moment they log in. */}
      <section className="space-y-3">
        <DashboardSlider />
      </section>

      {/* ─── 2. KPI grid ──────────────────────────────────────────── */}
      {/*
        Six tiles, two rows × three columns on desktop, centred with a
        max-width so the grid doesn't stretch edge-to-edge on a wide
        screen. The KpiGrid wrapper used elsewhere caps at 4 columns —
        we roll our own here for the specific 6-tile layout the doctor
        spec calls for.

        Order of tiles (top-left → bottom-right):
          • Total orders               (book of work)
          • Outstanding balance        (red / green — most actionable)
          • Total patients             (clinic size)
          • Pending payments           (clickable → /payments/history)
          • Unpaid orders              (count, secondary signal)
          • Paid orders                (count, healthy signal)
       */}
      <section className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs dark:*:data-[slot=card]:bg-card">
        <KpiCard
          label="Total orders"
          value={N(d?.orders.total ?? 0)}
          icon={ClipboardListIcon}
          footerLabel={`This month: ${N(d?.orders.thisMonth ?? 0)}`}
          footerDetail={`Today: ${N(d?.orders.today ?? 0)}`}
          loading={loading}
        />
        <KpiCard
          label="Outstanding balance"
          // Value rendered with the default neutral tone — the
          // red/green hint moved into the dialog so the dashboard
          // card stays visually uniform with the rest of the grid.
          value={TND(d?.revenue.unpaidDebt ?? 0)}
          icon={WalletIcon}
          // Click → opens the per-order breakdown popup. The KpiCard
          // wraps itself in a semantic <button> so keyboard
          // activation + screen-reader role come for free.
          onClick={() => setOutstandingOpen(true)}
          footerLabel={
            (d?.revenue.unpaidDebt ?? 0) > 0
              ? `Click for details — ${N(d?.orders.unpaid ?? 0)} unpaid`
              : 'All clear — click for details.'
          }
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
          label="Pending payments"
          value={N(d?.payments.pending ?? 0)}
          icon={TimerIcon}
          // Deep-link straight into the payment-history page so the
          // doctor sees the list of rows behind the number. The page
          // is role-aware and shows only the doctor's own payments.
          href="/dashboard/payments/history"
          footerLabel={`Awaiting confirmation: ${N(d?.payments.awaitingConfirmation ?? 0)}`}
          loading={loading}
        />
        <KpiCard
          label="Unpaid orders"
          value={N(d?.orders.unpaid ?? 0)}
          icon={BanIcon}
          loading={loading}
        />
        <KpiCard
          label="Paid orders"
          value={N(d?.orders.paid ?? 0)}
          icon={BadgeCheckIcon}
          loading={loading}
        />
      </section>

      {/* ─── 3. Packs catalogue (info-only) ──────────────────────── */}
      {/* Pack cards now ship as a read-only catalogue. Subscription /
          purchase flows live elsewhere (the order wizard picks the
          pack inline when the doctor creates a new case) — surfacing
          them here as a "buy" affordance was confusing because the
          actual pack selection happens later in the order flow. */}
      <section className="space-y-3">
        <div className="flex items-baseline gap-2">
          <PackageIcon className="size-5 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight">
            Available packs
          </h2>
          <span className="text-sm text-muted-foreground">
            · informational — choose your pack on the order form.
          </span>
        </div>
        <AvailablePacks recommendedId={d?.suggestedPack?.id} />
      </section>

      {/*
        Outstanding-balance details modal. Mounted at the page level so
        a single instance handles every click on the KPI card. The
        underlying query stays disabled until `open === true` so we
        don't fetch the per-order breakdown until the doctor actually
        opens it.
       */}
      <OutstandingBalanceDialog
        open={outstandingOpen}
        onOpenChange={setOutstandingOpen}
      />
    </div>
  );
}
