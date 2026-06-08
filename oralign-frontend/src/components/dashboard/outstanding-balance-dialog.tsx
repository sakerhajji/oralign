'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ExternalLink,
  PackageIcon,
  ReceiptText,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDoctorOutstandingOrders } from '@/lib/hooks';

const TND = (n: number, currency = 'TND') =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n) +
  ' ' +
  currency;

/**
 * Outstanding-balance details popup.
 *
 * Visual chrome mirrors the TreatmentFeeReceiptDialog so every popup
 * in the dashboard family feels related:
 *   • 920 px / 90vh shell, rounded-2xl, shadow-2xl, border-0
 *   • Header strip: circular icon badge + title + description on the
 *     left, count pill on the right
 *   • Summary strip just under the title: TOTAL DUE in a bordered
 *     mini-card (same idea as the "Declared 350 TND · filename"
 *     strip in the receipt dialog)
 *   • Full-bleed body: table when there's data; empty / loading /
 *     error states centred otherwise
 *   • Sticky footer: Refresh on the left, "Open payment history" +
 *     Close on the right
 *
 * The query is lazy — only fires while `open === true`, so we don't
 * pay for the per-order fetch on every dashboard mount. Refetches
 * every 30s while open so a payment landing in another tab drops
 * its row from the list in near-real-time.
 *
 * Graceful degradation
 * --------------------
 * The dedicated `/outstanding-orders` endpoint is recent — older
 * backend containers return 404. To keep the dialog useful during
 * the deployment window, we always render the headline figures
 * (`fallbackTotal` + `fallbackCount`) that the parent KPI already
 * resolved. When the detailed breakdown fetch fails, we surface
 * those numbers in a polite "summary only" state instead of a hard
 * error. The dialog still works; it just can't show per-row data
 * until the new endpoint lands.
 */
export interface OutstandingBalanceDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /**
   * Headline outstanding amount the parent already knows from the
   * doctor KPIs. Used to short-circuit the body to an empty-state
   * when 0 (no need to round-trip for an empty list), and as a
   * fallback display when the breakdown endpoint isn't reachable.
   */
  fallbackTotal?: number;
  /** Same idea for the unpaid-order count from KPIs. */
  fallbackCount?: number;
  fallbackCurrency?: string;
}

export function OutstandingBalanceDialog({
  open,
  onOpenChange,
  fallbackTotal = 0,
  fallbackCount = 0,
  fallbackCurrency = 'TND',
}: OutstandingBalanceDialogProps) {
  // Only fire the per-order breakdown fetch when the parent KPI says
  // there's actually anything outstanding. A doctor with 0 TND due
  // doesn't need a network round-trip to confirm an empty list — we
  // know it'll be empty.
  const shouldFetch = open && fallbackTotal > 0;
  const { data, isLoading, isError, error, refetch, isFetching } =
    useDoctorOutstandingOrders(shouldFetch);

  // Prefer fresh server data when available; otherwise the headline
  // figures the parent dashboard already resolved keep the popup
  // informative even when the breakdown endpoint is missing.
  const rows = data?.data ?? [];
  const total = data?.totalOutstanding ?? fallbackTotal;
  const currency = data?.currency ?? fallbackCurrency;
  const count = data?.count ?? fallbackCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Same shell as TreatmentFeeReceiptDialog:
        - h-auto + max-h-[90vh] so short content stays compact
        - max-w-[920px] on lg for desktop comfort
        - sm:max-w-[680px] for the tablet sweet-spot (table needs a bit
          more room than the 600 px the receipt summary uses)
       */}
      <DialogContent className="flex h-auto max-h-[90vh] w-full flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl sm:max-w-[680px] lg:max-w-[920px]">
        {/* ─── Header ─────────────────────────────────────────────── */}
        <DialogHeader className="space-y-3 border-b bg-card px-6 py-5 text-left sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Wallet className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-semibold sm:text-xl">
                  Outstanding balance
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs">
                  Every order with a remaining amount due, newest update first.
                </DialogDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              // Tone follows the headline. Zero outstanding ships as
              // emerald (clear), >0 as red so the dialog header
              // confirms the dashboard reading at a glance.
              className={
                total > 0
                  ? 'shrink-0 gap-1.5 border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700'
                  : 'shrink-0 gap-1.5 border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700'
              }
            >
              <ReceiptText className="h-3 w-3" />
              {count} order{count === 1 ? '' : 's'}
            </Badge>
          </div>

          {/*
            Total strip — same visual as the "Declared · filename"
            strip in the receipt dialog. Anchors the user's eye at
            the single number they came to see before scanning rows.
           */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Total due
            </span>
            <span className="text-base font-bold tabular-nums">
              {TND(total, currency)}
            </span>
          </div>
        </DialogHeader>

        {/* ─── Body ──────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-auto bg-card">
          {/*
            Decision tree:
              1. Nothing to fetch (parent says 0 outstanding) → empty state
              2. Fetch is running → loading state
              3. Fetch failed BUT we have a non-zero headline → degrade
                 gracefully to the "summary only" state, not the hard
                 error wall. This is the case during a deployment
                 window where the new /outstanding-orders endpoint
                 isn't live yet on the running backend.
              4. Fetch failed AND nothing to show → hard error.
              5. Fetch succeeded with empty list → empty state.
              6. Fetch succeeded with rows → table.
           */}
          {!shouldFetch ? (
            <EmptyState />
          ) : isLoading ? (
            <LoadingState />
          ) : isError && total > 0 ? (
            <SummaryOnlyState
              total={total}
              currency={currency}
              count={count}
              onRetry={refetch}
            />
          ) : isError ? (
            <ErrorState
              message={(error as Error)?.message}
              onRetry={refetch}
            />
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Pack</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.orderId}>
                    <TableCell className="font-medium">
                      {row.orderCode}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.patientName ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.packName ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <PackageIcon className="size-3 text-muted-foreground" />
                          {row.packName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {TND(row.totalPrice, row.currency)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-emerald-700">
                      {TND(row.paidAmount, row.currency)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-red-700">
                      {TND(row.remaining, row.currency)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(row.updatedAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        asChild
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => onOpenChange(false)}
                        title="Open order"
                      >
                        <Link
                          href={`/dashboard/orders/${row.orderId}?tab=quote`}
                        >
                          <ExternalLink className="size-3" />
                          Open
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* ─── Footer ────────────────────────────────────────────── */}
        <div className="flex flex-row flex-wrap items-center justify-between gap-2 border-t bg-card px-6 py-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw
              className={isFetching ? 'size-3.5 animate-spin' : 'size-3.5'}
            />
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link
                href="/dashboard/payments/history"
                onClick={() => onOpenChange(false)}
              >
                Open payment history
              </Link>
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sub-states — same visual rhythm as the EmptyState in the receipt
// dialog (centred icon + title + muted hint + optional action).
// ────────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[260px] w-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-700">
        <Wallet className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold">Nothing outstanding</p>
        <p className="max-w-md text-xs text-muted-foreground">
          All your orders are paid in full. Nothing for you to chase.
        </p>
      </div>
    </div>
  );
}

/**
 * Graceful-degradation state: we couldn't load the per-order
 * breakdown, but the parent dashboard already knows the headline
 * total + count. Show those in a polite card with a Retry — the
 * dialog stays informative even when the new endpoint isn't
 * deployed yet on the running backend.
 */
function SummaryOnlyState({
  total,
  currency,
  count,
  onRetry,
}: {
  total: number;
  currency: string;
  count: number;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full min-h-[260px] w-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-700">
        <Wallet className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold">Summary only</p>
        <p className="max-w-md text-xs text-muted-foreground">
          We couldn&apos;t load the per-order breakdown right now — the
          detailed view will be available shortly. Here&apos;s what we
          know from your dashboard:
        </p>
      </div>
      <div className="grid w-full max-w-xs grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Total due
          </p>
          <p className="text-base font-bold tabular-nums">
            {TND(total, currency)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Unpaid orders
          </p>
          <p className="text-base font-bold tabular-nums">{count}</p>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
        <RefreshCw className="size-3.5" />
        Try again
      </Button>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  // Detect the "endpoint not deployed yet" case so the doctor sees a
  // useful hint instead of a raw axios string. A 404 here typically
  // means the running backend container is the old build and doesn't
  // yet have the outstanding-orders route — once it recreates with
  // the new image the call succeeds without any frontend change.
  const looksLike404 = /404/.test(message ?? '');
  return (
    <div className="flex h-full min-h-[260px] w-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-red-100 text-red-700">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-destructive">
          Couldn&apos;t load your outstanding orders.
        </p>
        {message ? (
          <p className="max-w-md text-xs text-muted-foreground">{message}</p>
        ) : null}
        {looksLike404 ? (
          <p className="max-w-md text-[11px] text-muted-foreground">
            The server may be updating. Wait a moment and try again.
          </p>
        ) : null}
      </div>
      <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
        <RefreshCw className="size-3.5" />
        Try again
      </Button>
    </div>
  );
}
