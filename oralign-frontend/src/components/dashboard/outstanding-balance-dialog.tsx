'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  History,
  PackageIcon,
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
import { cn } from '@/lib/utils';
import { useDoctorOutstandingOrders } from '@/lib/hooks';
import type { DoctorOutstandingOrder } from '@/lib/api/dashboard.service';
import { useT } from '@/lib/i18n/lang-context';
import { fr as frLocale } from 'date-fns/locale';
import type { Locale } from 'date-fns';

/**
 * Outstanding-balance details popup — desktop table ↔ mobile cards.
 *
 * Senior UX choices baked in:
 *
 *   • Money strip up top reads at a glance — big red total, count
 *     pill, and a one-line caption that tells the doctor what each
 *     row represents and how to dive in.
 *   • Each row has a payment-progress bar (visual % paid) so the
 *     doctor sees "almost there" vs "barely touched" without doing
 *     mental math.
 *   • Patient initial in a soft tinted circle — gives every row a
 *     scannable anchor instead of a flat code → patient string.
 *   • Below `md` the table becomes a vertical card list. Each card
 *     is one big tappable surface (the order code, the progress bar,
 *     and the remaining amount are on the same chip-shaped button)
 *     so a phone user gets a clean 44 px touch target, not a 16 px
 *     "Open" icon.
 *   • Footer CTAs are default-size with real labels — no more
 *     icon-soup sm buttons on a "money the doctor owes" surface.
 *   • Lazy fetch (only while open) + graceful degradation when the
 *     dedicated endpoint is unreachable: the parent's KPI total +
 *     count populate the summary so the popup is still informative.
 */
// Locale-aware money + date formatters. Both popups call this from
// the dialog body and from the row primitives, so we accept the
// current Lang as a parameter rather than re-running `useT()` in
// each leaf. Cheap construction — these `Intl.NumberFormat` calls are
// effectively memoised by V8 internally when the args match.
const tnd = (n: number, currency = 'TND', lang: 'en' | 'fr' = 'en') =>
  new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(n) +
  ' ' +
  currency;

const dateLocale = (lang: 'en' | 'fr'): Locale | undefined =>
  lang === 'fr' ? frLocale : undefined;

export interface OutstandingBalanceDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Total surfaced by the parent KPI — used to short-circuit the
   *  query when 0 and to populate the summary-only fallback. */
  fallbackTotal?: number;
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
  const shouldFetch = open && fallbackTotal > 0;
  const { data, isLoading, isError, error, refetch, isFetching } =
    useDoctorOutstandingOrders(shouldFetch);
  const rows = data?.data ?? [];
  const total = data?.totalOutstanding ?? fallbackTotal;
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
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary sm:h-11 sm:w-11">
                <Wallet className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <DialogTitle className="text-lg font-semibold leading-tight sm:text-xl">
                  {t('dashboard.outstandingDialog.title')}
                </DialogTitle>
                <DialogDescription className="text-xs leading-relaxed sm:text-[13px]">
                  {t('dashboard.outstandingDialog.description')}
                </DialogDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'shrink-0 gap-1.5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
                total > 0
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700',
              )}
            >
              {t('dashboard.outstandingDialog.orderCount', { count })}
            </Badge>
          </div>

          {/*
            Headline money strip — full-bleed inside the header so the
            "Total due" number is the loudest visual on the screen.
            Red gradient when there's a debt, neutral when clear.
           */}
          <div
            className={cn(
              'flex flex-wrap items-end justify-between gap-3 rounded-xl border p-4',
              total > 0
                ? 'border-red-200 bg-gradient-to-br from-red-50 to-card'
                : 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-card',
            )}
          >
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {t('dashboard.outstandingDialog.totalDue')}
              </p>
              <p
                className={cn(
                  'text-2xl font-bold tabular-nums leading-none sm:text-3xl',
                  total > 0 ? 'text-destructive' : 'text-emerald-700',
                )}
              >
                {tnd(total, currency, lang)}
              </p>
            </div>
            {total > 0 ? (
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-700/80">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{t('dashboard.outstandingDialog.settleHint')}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700/80">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{t('dashboard.outstandingDialog.paidUp')}</span>
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
            <>
              {/* Desktop table — md+ */}
              <DesktopTable rows={rows} onRowOpen={() => onOpenChange(false)} />
              {/* Mobile cards — < md */}
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
// Row primitives — small atoms shared by table + card layouts.
// ────────────────────────────────────────────────────────────────────

/** Single letter avatar circle for the patient — soft brand tint. */
function PatientAvatar({ name }: { name: string | null }) {
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
      {initial}
    </div>
  );
}

/**
 * Payment-progress bar showing % paid for a single quote. Soft
 * gradient base + tinted fill so the doctor sees at a glance whether
 * a row is barely started or almost settled.
 */
function PaymentProgress({
  paid,
  total,
}: {
  paid: number;
  total: number;
}) {
  const { t } = useT();
  const pct = total > 0 ? Math.min(100, Math.max(0, (paid / total) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] font-medium tabular-nums text-muted-foreground">
        <span>
          {t('dashboard.outstandingDialog.progressPaid', { pct: pct.toFixed(0) })}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
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
            <th className="border-b px-5 py-3 text-left w-48">{t('dashboard.outstandingDialog.colProgress')}</th>
            <th className="border-b px-5 py-3 text-right">{t('dashboard.outstandingDialog.colRemaining')}</th>
            <th className="border-b px-5 py-3 text-left">{t('dashboard.outstandingDialog.colUpdated')}</th>
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
                <PaymentProgress paid={row.paidAmount} total={row.totalPrice} />
              </td>
              <td className="border-b border-border/60 px-5 py-3 text-right">
                <div className="text-base font-semibold tabular-nums text-destructive">
                  {tnd(row.remaining, row.currency, lang)}
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
                <p className="text-base font-bold tabular-nums text-destructive">
                  {tnd(row.remaining, row.currency, lang)}
                </p>
                <p className="text-[10px] tabular-nums text-muted-foreground">
                  {t('dashboard.outstandingDialog.ofTotal', {
                    total: tnd(row.totalPrice, row.currency, lang),
                  })}
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <PaymentProgress
                paid={row.paidAmount}
                total={row.totalPrice}
              />
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
// State surfaces — all share the same centred icon-badge anatomy.
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
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="h-7 w-7" />
      </div>
      <div className="space-y-1.5">
        <p className="text-base font-semibold">
          {t('dashboard.outstandingDialog.nothingOutstandingTitle')}
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          {t('dashboard.outstandingDialog.nothingOutstandingBody')}
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
        <Wallet className="h-7 w-7" />
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
            {t('dashboard.outstandingDialog.totalDue')}
          </p>
          <p className="text-lg font-bold tabular-nums text-destructive">
            {tnd(total, currency, lang)}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t('dashboard.outstandingDialog.summaryUnpaidCount')}
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
          {t('dashboard.outstandingDialog.errorTitle')}
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
