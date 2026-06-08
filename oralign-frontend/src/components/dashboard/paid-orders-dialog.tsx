'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  History,
  PackageIcon,
  RefreshCw,
  Sparkles,
  TrendingUp,
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
import { cn } from '@/lib/utils';
import { useDoctorPaidOrders } from '@/lib/hooks';
import type { DoctorOutstandingOrder } from '@/lib/api/dashboard.service';
import { useT } from '@/lib/i18n/lang-context';
import { fr as frLocale } from 'date-fns/locale';
import type { Locale } from 'date-fns';

/**
 * Paid-orders details popup — mirrors the OutstandingBalanceDialog
 * layout exactly (desktop table ↔ mobile cards) but tuned to the
 * "money collected" story:
 *
 *   • Emerald tone replaces red — the headline money strip celebrates
 *     revenue collected instead of warning about debt.
 *   • Headline reads "Total collected" instead of "Total due".
 *   • Progress bars show 100 % (every row here is fully paid) but we
 *     keep them so the visual rhythm matches the outstanding dialog.
 *
 * Behaviour:
 *   • Lazy query (only fires while open) + graceful degradation when
 *     the dedicated endpoint is unreachable: the parent's KPI count
 *     populates the summary so the popup is still informative.
 *   • Each row deep-links to the order detail with the quote tab
 *     pre-selected — the doctor can review what was paid for.
 */
// Locale-aware money + date formatters. Same pattern as the
// outstanding-balance dialog — accept the current Lang so leaf
// components don't have to re-pull the context each render.
const tnd = (n: number, currency = 'TND', lang: 'en' | 'fr' = 'en') =>
  new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(n) +
  ' ' +
  currency;

const dateLocale = (lang: 'en' | 'fr'): Locale | undefined =>
  lang === 'fr' ? frLocale : undefined;

export interface PaidOrdersDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Total surfaced by the parent KPI — populates the summary-only
   *  fallback. */
  fallbackTotal?: number;
  fallbackCount?: number;
  fallbackCurrency?: string;
}

export function PaidOrdersDialog({
  open,
  onOpenChange,
  fallbackTotal = 0,
  fallbackCount = 0,
  fallbackCurrency = 'TND',
}: PaidOrdersDialogProps) {
  // Only fire when the dialog is open AND there's something to show;
  // counts of 0 short-circuit to the empty state without a request.
  const shouldFetch = open && fallbackCount > 0;
  const { data, isLoading, isError, error, refetch, isFetching } =
    useDoctorPaidOrders(shouldFetch);
  const rows = data?.data ?? [];
  const total = data?.totalCollected ?? fallbackTotal;
  const currency = data?.currency ?? fallbackCurrency;
  const count = data?.count ?? fallbackCount;
  const { t, lang } = useT();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] w-full flex-col gap-0 overflow-hidden border-0 p-0 shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl sm:max-w-[680px] lg:max-w-[980px]">
        {/* ─── Header ─────────────────────────────────────────────── */}
        <DialogHeader className="space-y-4 border-b bg-card px-5 py-5 text-left sm:px-7 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 sm:h-11 sm:w-11">
                <BadgeCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <DialogTitle className="text-lg font-semibold leading-tight sm:text-xl">
                  {t('dashboard.paidDialog.title')}
                </DialogTitle>
                <DialogDescription className="text-xs leading-relaxed sm:text-[13px]">
                  {t('dashboard.paidDialog.description')}
                </DialogDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 gap-1.5 border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700"
            >
              {t('dashboard.outstandingDialog.orderCount', { count })}
            </Badge>
          </div>

          {/* Headline money strip — emerald celebrates revenue. */}
          <div
            className={cn(
              'flex flex-wrap items-end justify-between gap-3 rounded-xl border p-4',
              count > 0
                ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-card'
                : 'border-muted-foreground/15 bg-gradient-to-br from-muted/30 to-card',
            )}
          >
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {t('dashboard.paidDialog.totalCollected')}
              </p>
              <p
                className={cn(
                  'text-2xl font-bold tabular-nums leading-none sm:text-3xl',
                  count > 0 ? 'text-emerald-700' : 'text-muted-foreground',
                )}
              >
                {tnd(total, currency, lang)}
              </p>
            </div>
            {count > 0 ? (
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700/80">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>{t('dashboard.paidDialog.revenueHint')}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                <span>{t('dashboard.paidDialog.noneYetHint')}</span>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* ─── Body ──────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-auto bg-muted/20">
          {!shouldFetch ? (
            <EmptyState />
          ) : isLoading ? (
            <LoadingState />
          ) : isError && count > 0 ? (
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
            <>
              <DesktopTable rows={rows} onRowOpen={() => onOpenChange(false)} />
              <MobileCardList rows={rows} onRowOpen={() => onOpenChange(false)} />
            </>
          )}
        </div>

        {/* ─── Footer ────────────────────────────────────────────── */}
        <div className="flex flex-col-reverse gap-2 border-t bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-7">
          <Button
            variant="ghost"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-10 w-full gap-2 sm:w-auto"
          >
            <RefreshCw
              className={cn('h-4 w-4', isFetching && 'animate-spin')}
            />
            {isFetching
              ? t('dashboard.refreshing')
              : t('dashboard.refresh')}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button
              asChild
              variant="outline"
              className="h-10 w-full gap-2 sm:w-auto"
            >
              <Link
                href="/dashboard/payments/history"
                onClick={() => onOpenChange(false)}
              >
                <History className="h-4 w-4" />
                {t('dashboard.outstandingDialog.paymentHistory')}
              </Link>
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              className="h-10 w-full sm:w-auto sm:min-w-[120px]"
            >
              {t('dashboard.outstandingDialog.close')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────
// Row primitives — same anatomy as OutstandingBalanceDialog, kept
// inline so the two popups can evolve independently if product asks
// for paid-specific cells later (refund status, days-to-settle, …).
// ────────────────────────────────────────────────────────────────────

function PatientAvatar({ name }: { name: string | null }) {
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
      {initial}
    </div>
  );
}

/**
 * Solid emerald fill for paid rows — visually distinct from the
 * outstanding-balance gradient (which animates from amber to emerald
 * based on % paid). Here every row is 100 %, so we render the bar at
 * full width with no gradient ambiguity.
 */
function PaidProgress() {
  const { t } = useT();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] font-medium tabular-nums text-emerald-700">
        <span>{t('dashboard.paidDialog.progressPaid')}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full w-full rounded-full bg-emerald-500" />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Desktop table (md+)
// ────────────────────────────────────────────────────────────────────

function DesktopTable({
  rows,
  onRowOpen,
}: {
  rows: DoctorOutstandingOrder[];
  onRowOpen: () => void;
}) {
  const { t, lang } = useT();
  const dateFmt = lang === 'fr' ? 'd MMM yyyy' : 'MMM d, yyyy';
  return (
    <div className="hidden md:block">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-10 bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
          <tr>
            <th className="border-b px-5 py-3 text-left">{t('dashboard.outstandingDialog.colOrder')}</th>
            <th className="border-b px-5 py-3 text-left">{t('dashboard.outstandingDialog.colPatient')}</th>
            <th className="border-b px-5 py-3 text-left">{t('dashboard.outstandingDialog.colPack')}</th>
            <th className="border-b px-5 py-3 text-left w-48">{t('dashboard.paidDialog.colStatus')}</th>
            <th className="border-b px-5 py-3 text-right">{t('dashboard.paidDialog.colCollected')}</th>
            <th className="border-b px-5 py-3 text-left">{t('dashboard.paidDialog.colSettled')}</th>
            <th className="border-b px-5 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.orderId}
              className="bg-card transition hover:bg-accent/40"
            >
              <td className="border-b border-border/60 px-5 py-3 font-medium tabular-nums">
                {row.orderCode}
              </td>
              <td className="border-b border-border/60 px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <PatientAvatar name={row.patientName} />
                  <span className="text-sm">
                    {row.patientName ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                </div>
              </td>
              <td className="border-b border-border/60 px-5 py-3 text-xs">
                {row.packName ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 font-medium">
                    <PackageIcon className="h-3 w-3 text-muted-foreground" />
                    {row.packName}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="border-b border-border/60 px-5 py-3">
                <PaidProgress />
              </td>
              <td className="border-b border-border/60 px-5 py-3 text-right">
                <div className="text-base font-semibold tabular-nums text-emerald-700">
                  {tnd(row.paidAmount, row.currency, lang)}
                </div>
                <div className="text-[10px] tabular-nums text-muted-foreground">
                  {t('dashboard.outstandingDialog.ofTotal', {
                    total: tnd(row.totalPrice, row.currency, lang),
                  })}
                </div>
              </td>
              <td className="border-b border-border/60 px-5 py-3 text-xs text-muted-foreground">
                {format(new Date(row.updatedAt), dateFmt, {
                  locale: dateLocale(lang),
                })}
              </td>
              <td className="border-b border-border/60 px-5 py-3 text-right">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5"
                  onClick={onRowOpen}
                >
                  <Link href={`/dashboard/orders/${row.orderId}?tab=quote`}>
                    {t('dashboard.outstandingDialog.openAction')}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Mobile cards (< md)
// ────────────────────────────────────────────────────────────────────

function MobileCardList({
  rows,
  onRowOpen,
}: {
  rows: DoctorOutstandingOrder[];
  onRowOpen: () => void;
}) {
  const { t, lang } = useT();
  const dateFmt = lang === 'fr' ? 'd MMM yyyy' : 'MMM d, yyyy';
  const unknownPatient =
    lang === 'fr' ? 'Patient inconnu' : 'Unknown patient';
  return (
    <ul className="space-y-3 p-4 md:hidden">
      {rows.map((row) => (
        <li key={row.orderId}>
          <Link
            href={`/dashboard/orders/${row.orderId}?tab=quote`}
            onClick={onRowOpen}
            className="block rounded-xl border bg-card p-4 shadow-sm transition active:scale-[0.99] active:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <PatientAvatar name={row.patientName} />
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-semibold">
                    {row.patientName ?? unknownPatient}
                  </p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {row.orderCode}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-bold tabular-nums text-emerald-700">
                  {tnd(row.paidAmount, row.currency, lang)}
                </p>
                <p className="text-[10px] tabular-nums text-muted-foreground">
                  {t('dashboard.outstandingDialog.ofTotal', {
                    total: tnd(row.totalPrice, row.currency, lang),
                  })}
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <PaidProgress />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                {row.packName ? (
                  <span className="inline-flex items-center gap-1">
                    <PackageIcon className="h-3 w-3" />
                    {row.packName}
                  </span>
                ) : (
                  <span />
                )}
                <span>
                  {format(new Date(row.updatedAt), dateFmt, {
                    locale: dateLocale(lang),
                  })}
                </span>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ────────────────────────────────────────────────────────────────────
// State surfaces — share the centred icon-badge anatomy with the
// outstanding-balance dialog so the two popups feel like siblings.
// ────────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}

function EmptyState() {
  const { t } = useT();
  return (
    <div className="flex h-full min-h-[280px] w-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <Sparkles className="h-7 w-7" />
      </div>
      <div className="space-y-1.5">
        <p className="text-base font-semibold">
          {t('dashboard.paidDialog.emptyTitle')}
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          {t('dashboard.paidDialog.emptyBody')}
        </p>
      </div>
    </div>
  );
}

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
  const { t, lang } = useT();
  return (
    <div className="flex h-full min-h-[280px] w-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-700">
        <BadgeCheck className="h-7 w-7" />
      </div>
      <div className="space-y-1.5">
        <p className="text-base font-semibold">
          {t('dashboard.outstandingDialog.summaryOnlyTitle')}
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          {t('dashboard.outstandingDialog.summaryOnlyBody')}
        </p>
      </div>
      <div className="grid w-full max-w-sm grid-cols-2 gap-3 rounded-xl border bg-card p-4">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t('dashboard.paidDialog.totalCollected')}
          </p>
          <p className="text-lg font-bold tabular-nums text-emerald-700">
            {tnd(total, currency, lang)}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t('dashboard.paidDialog.summaryPaidCount')}
          </p>
          <p className="text-lg font-bold tabular-nums">{count}</p>
        </div>
      </div>
      <Button variant="outline" onClick={onRetry} className="h-10 gap-2">
        <RefreshCw className="h-4 w-4" />
        {t('dashboard.tryAgain')}
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
  const { t } = useT();
  const looksLike404 = /404/.test(message ?? '');
  return (
    <div className="flex h-full min-h-[280px] w-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-100 text-red-700">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <div className="space-y-1.5">
        <p className="text-base font-semibold text-destructive">
          {t('dashboard.paidDialog.errorTitle')}
        </p>
        {message ? (
          <p className="max-w-md text-sm text-muted-foreground">{message}</p>
        ) : null}
        {looksLike404 ? (
          <p className="max-w-md text-xs text-muted-foreground">
            {t('dashboard.outstandingDialog.error404Hint')}
          </p>
        ) : null}
      </div>
      <Button variant="outline" onClick={onRetry} className="h-10 gap-2">
        <RefreshCw className="h-4 w-4" />
        {t('dashboard.tryAgain')}
      </Button>
    </div>
  );
}
