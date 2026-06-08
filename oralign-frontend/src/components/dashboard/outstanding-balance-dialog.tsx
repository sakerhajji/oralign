'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import {
  ExternalLink,
  FileText,
  PackageIcon,
  Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
 * Popup the doctor dashboard opens when the "Outstanding balance" KPI
 * is clicked. Shows the per-order breakdown that adds up to the headline
 * number on the card.
 *
 * Why a dialog instead of a route: the doctor is in a "spot-check"
 * intent — they want to know *what* the balance is made of without
 * losing their dashboard context. A modal keeps them anchored; a deep
 * link can still happen from each row (the order code is a Link).
 *
 * The query inside is lazy — it only fires while the dialog is open
 * (`enabled` flag is tied to `open`), so we don't pay for the per-order
 * fetch on every dashboard mount.
 */
export interface OutstandingBalanceDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}

export function OutstandingBalanceDialog({
  open,
  onOpenChange,
}: OutstandingBalanceDialogProps) {
  // `enabled: open` — fires the query the moment the user clicks the
  // KPI card, refreshes every 30s while the dialog stays open, stops
  // entirely when they close it. No wasted polling on a closed modal.
  const { data, isLoading, isError, error, refetch, isFetching } =
    useDoctorOutstandingOrders(open);
  const rows = data?.data ?? [];
  const total = data?.totalOutstanding ?? 0;
  const currency = data?.currency ?? 'TND';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Same modal dimensions as the treatment-fee receipt dialog so
        every popup in the dashboard family feels related — wide enough
        for a clean table, capped at 90vh with internal scroll for long
        lists. The summary header anchors the "what total" question
        at the top so the doctor reads the takeaway before scanning
        the rows.
       */}
      <DialogContent className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl">
        <DialogHeader className="space-y-3 border-b bg-card px-6 py-5 text-left">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base font-semibold sm:text-lg">
                <Wallet className="size-5 text-primary" />
                Outstanding balance
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                Every order with a remaining amount due, newest update first.
              </DialogDescription>
            </div>
            <Badge
              variant="outline"
              // Tone follows the headline tile on the dashboard. Zero
              // outstanding ships as emerald (clear), >0 as red so the
              // dialog header confirms the dashboard reading at a glance.
              className={
                total > 0
                  ? 'gap-1.5 border-red-200 bg-red-50 text-red-700'
                  : 'gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700'
              }
            >
              {data?.count ?? 0} order{(data?.count ?? 0) === 1 ? '' : 's'}
            </Badge>
          </div>
          {/* Total strip — the single number the user came to see. */}
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Total due
            </span>
            <span className="text-base font-bold tabular-nums">
              {TND(total, currency)}
            </span>
          </div>
        </DialogHeader>

        {/* ─── Body ──────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-auto">
          {isError ? (
            <ErrorState message={(error as Error)?.message} onRetry={refetch} />
          ) : isLoading ? (
            <LoadingState />
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
        <DialogFooter className="flex flex-row flex-wrap items-center justify-between gap-2 border-t bg-card px-6 py-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <FileText className="size-3.5" />
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              asChild
              size="sm"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              <Link href="/dashboard/payments/history">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sub-states
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
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 p-8 text-center">
      <Wallet className="size-8 text-emerald-500" />
      <div className="space-y-1">
        <p className="text-sm font-semibold">Nothing outstanding</p>
        <p className="max-w-md text-xs text-muted-foreground">
          All your orders are paid in full. Nothing for you to chase.
        </p>
      </div>
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
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-semibold text-destructive">
        Couldn&apos;t load your outstanding orders.
      </p>
      {message ? (
        <p className="max-w-md text-xs text-muted-foreground">{message}</p>
      ) : null}
      <Button size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
