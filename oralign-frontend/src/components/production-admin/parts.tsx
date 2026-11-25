'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { CircleAlert, Factory, RotateCw } from 'lucide-react';
import { OrderKindBadge } from '@/components/dashboard/order-kind-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { productionAdminErrorText } from '@/lib/hooks/use-production-admin';
import { useT } from '@/lib/i18n/lang-context';
import type { UserRole } from '@/lib/types';
import type {
  ActTotals,
  ProductionOrderRef,
  ProductionSummary,
  ProductionWarningCode,
} from '@/lib/types/production';
import { cn } from '@/lib/utils';
import { ACTS, formatCount, pluralSuffix } from './format';

/**
 * The desk's building blocks: a titled panel, the act figures, counts,
 * a case cell, warning tags, and the empty / error / loading states every
 * block keeps inside its own frame.
 */

export const CARD = 'min-w-0 rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10';

/** The case sheet of the production module (FE-TECH owns the route). */
export function caseSheetHref(orderId: string): string {
  return `/dashboard/production/${encodeURIComponent(orderId)}`;
}

export function orderHref(orderId: string): string {
  return `/dashboard/orders/${encodeURIComponent(orderId)}`;
}

export function Panel({
  title,
  hint,
  action,
  children,
  footer,
  className,
  busy = false,
}: {
  title: string;
  hint?: ReactNode;
  /** Right of the title: a count, a toggle. */
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Newer figures are loading behind these. */
  busy?: boolean;
}) {
  return (
    <section
      className={cn(CARD, 'flex flex-col overflow-hidden', className)}
      aria-busy={busy || undefined}
    >
      <header className="border-b px-4 py-3">
        {/* The action stays on the title's line; the hint runs under both. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 className="min-w-0 text-sm font-semibold">{title}</h2>
          {action ? <div className="flex max-w-full items-center gap-2">{action}</div> : null}
        </div>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </header>
      <div className={cn('min-w-0 flex-1 transition-opacity duration-150', busy && 'opacity-60')}>
        {children}
      </div>
      {footer ? (
        <footer className="border-t px-4 py-2.5 text-xs text-muted-foreground">{footer}</footer>
      ) : null}
    </section>
  );
}

export function PanelSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn(CARD, 'overflow-hidden', className)} aria-hidden="true">
      <div className="border-b px-4 py-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-1.5 h-3.5 w-64 max-w-full" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center justify-between gap-4 px-4 py-3">
            <Skeleton className="h-4 w-40 max-w-[50%]" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** An empty block: keeps its frame, one sentence, its way out. */
export function BlockMessage({
  title,
  detail,
  action,
  className,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-12 text-center ring-1 ring-foreground/10',
        className,
      )}
    >
      <Factory className="size-6 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {detail ? <p className="max-w-md text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/**
 * A block that failed to load: what failed, why (offline, a restarting
 * API, a refused period…), and "Réessayer". Announced as an alert.
 */
export function BlockError({
  title,
  error,
  onRetry,
  retrying = false,
  className,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}) {
  const { t } = useT();
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10 sm:flex-row sm:items-center',
        className,
      )}
    >
      <CircleAlert className="size-5 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{productionAdminErrorText(error, t)}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-11 sm:h-8"
        onClick={onRetry}
        disabled={retrying}
      >
        <RotateCw className={cn(retrying && 'animate-spin')} aria-hidden="true" />
        {t('productionAdmin.errors.retry')}
      </Button>
    </div>
  );
}

/** A count in a column: tabular, a real zero printed but quiet. */
export function Count({ value, className }: { value: number; className?: string }) {
  const { lang } = useT();
  return (
    <span className={cn('tabular-nums', value === 0 && 'text-muted-foreground', className)}>
      {formatCount(value, lang)}
    </span>
  );
}

/** A missing value: a grey dash; `label` says why, to the eye (title) and to screen readers. */
export function Dash({ label }: { label?: string }) {
  return (
    <span className="text-muted-foreground" title={label}>
      <span aria-hidden="true">—</span>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

/** Reference (to the case sheet), kind of a supplemental request, patient. */
export function CaseCell({
  order,
  sub,
  className,
}: {
  order: Pick<ProductionOrderRef, 'orderId' | 'orderCode' | 'orderType' | 'patientName'>;
  /** A second grey line (the practitioner). */
  sub?: ReactNode;
  className?: string;
}) {
  const { t } = useT();
  return (
    <div className={cn('min-w-0', className)}>
      {/* The kind badge drops under the code rather than shrink to a letter. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <Link
          href={caseSheetHref(order.orderId)}
          className="shrink-0 rounded-sm font-medium tabular-nums underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={t('productionAdmin.rows.openSheet', { code: order.orderCode })}
        >
          {order.orderCode}
        </Link>
        <OrderKindBadge order={order} />
      </div>
      <p className="truncate text-sm" title={order.patientName}>
        {order.patientName}
      </p>
      {sub ? <div className="truncate text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

/**
 * A person who entered rows: the name snapshot and the role, or "Compte
 * supprimé". `stacked` (a narrow table cell): below sm the role drops
 * under the name instead of being cut off behind it.
 */
export function AuthorLabel({
  name,
  role,
  stacked = false,
}: {
  name: string | null;
  role: UserRole | null;
  stacked?: boolean;
}) {
  const { t } = useT();
  return (
    <span className={cn('min-w-0', stacked && 'block sm:truncate')}>
      <span className={cn('truncate', stacked && 'block sm:inline')}>
        {name ?? t('productionAdmin.rows.deletedAccount')}
      </span>
      {role ? (
        <span
          className={cn(
            'text-xs text-muted-foreground',
            stacked ? 'block truncate sm:ml-1.5 sm:inline' : 'ml-1.5',
          )}
        >
          {t(`usersUi.roles.${role}`)}
        </span>
      ) : null}
    </span>
  );
}

/** Confirmed warnings of an entry, as quiet amber tags. */
export function WarningTags({ warnings }: { warnings: ProductionWarningCode[] }) {
  const { t } = useT();
  if (warnings.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1" aria-label={t('productionAdmin.rows.warningsAria')}>
      {warnings.map((code) => (
        <li
          key={code}
          className="inline-flex h-5 flex-none items-center rounded-sm bg-amber-50 px-1.5 text-[11px] font-medium whitespace-nowrap text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900"
        >
          {t(`production.warnings.${code}.title`)}
        </li>
      ))}
    </ul>
  );
}

/**
 * The four act figures and the theoretical consumption, in one container
 * split by hairlines (journal and recap): the quantity is the figure, the
 * number of entries its subline.
 */
export function ActFigures({
  totals,
  consumption,
  busy = false,
}: {
  totals: ActTotals;
  consumption: ProductionSummary['consumption'];
  busy?: boolean;
}) {
  const { t, lang } = useT();
  const entries = (count: number) =>
    t(`productionAdmin.totals.entries${pluralSuffix(count, lang)}`, {
      count: formatCount(count, lang),
    });
  return (
    <section
      aria-label={t('productionAdmin.totals.aria')}
      aria-busy={busy || undefined}
      className={cn(CARD, 'overflow-hidden transition-opacity duration-150', busy && 'opacity-60')}
    >
      {/* The 1px gaps over the ring colour draw the dividers. */}
      <dl className="grid grid-cols-2 gap-px bg-foreground/10 lg:grid-cols-4">
        {ACTS.map((act) => (
          <div key={act} className="flex min-w-0 flex-col gap-1 bg-card px-4 py-3">
            <dt className="text-xs font-medium text-muted-foreground">{t(`production.acts.${act}`)}</dt>
            <dd className="text-2xl font-semibold tracking-tight tabular-nums">
              {formatCount(totals[act].quantity, lang)}
            </dd>
            <dd className="text-xs text-muted-foreground tabular-nums">
              {entries(totals[act].entries)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t px-4 py-2.5 text-sm">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{t('productionAdmin.consumption.title')}</span>
          <span className="hidden sm:inline"> · {t('productionAdmin.consumption.hint')}</span>
        </p>
        <dl className="flex gap-5">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-xs text-muted-foreground">{t('productionAdmin.consumption.plates')}</dt>
            <dd className="font-semibold tabular-nums">{formatCount(consumption.plates, lang)}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-xs text-muted-foreground">{t('productionAdmin.consumption.models')}</dt>
            <dd className="font-semibold tabular-nums">{formatCount(consumption.models, lang)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

export function ActFiguresSkeleton() {
  return (
    <div className={cn(CARD, 'overflow-hidden')} aria-hidden="true">
      <div className="grid grid-cols-2 gap-px bg-foreground/10 lg:grid-cols-4">
        {ACTS.map((act) => (
          <div key={act} className="flex flex-col gap-1 bg-card px-4 py-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-14" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4 border-t px-4 py-2.5">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-4 w-36" />
      </div>
    </div>
  );
}
