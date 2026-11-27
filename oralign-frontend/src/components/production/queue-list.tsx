'use client';

import type { MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n/lang-context';
import {
  PRODUCTION_EVENT_TYPES,
  type ProductionQueueItem,
} from '@/lib/types/production';
import { cn } from '@/lib/utils';
import { businessToday, formatBusinessDayShort } from '@/lib/utils/business-day';
import { ActCell, ActProgressTable, ProvisionalLegend, hasProvisional } from './act-progress';
import { productionStatusOf } from './production-format';
import { ProductionKindBadge, ProductionStatusBadge } from './production-ui';
import { ReleaseSummary } from './release-summary';

export function productionCaseHref(orderId: string): string {
  return `/dashboard/production/${encodeURIComponent(orderId)}`;
}

/**
 * The production queue: a dense table from lg up, one card per case
 * below (phone and portrait tablet on the bench). Both are rendered and
 * CSS picks one, so nothing flashes while a media query settles.
 */
export function ProductionQueueList({
  rows,
  busy,
}: {
  rows: ProductionQueueItem[];
  /** A newer result set is loading behind these rows. */
  busy: boolean;
}) {
  return (
    <div
      aria-busy={busy || undefined}
      className={cn('transition-opacity duration-150', busy && 'opacity-60')}
    >
      <QueueTable rows={rows} />
      <QueueCards rows={rows} />
    </div>
  );
}

function LastAction({ at }: { at: string | null }) {
  const { t, lang } = useT();
  if (!at) return <span className="text-muted-foreground">{t('production.queue.notStarted')}</span>;
  return <>{formatBusinessDayShort(at, lang, businessToday())}</>;
}

// ─── Table (lg and up) ──────────────────────────────────────────────

/** A click on the row opens the case, except on its own links. */
function opensRow(event: MouseEvent<HTMLElement>): boolean {
  const target = event.target as Element;
  return event.currentTarget.contains(target) && !target.closest('a, button');
}

function QueueTable({ rows }: { rows: ProductionQueueItem[] }) {
  const { t } = useT();
  const router = useRouter();
  return (
    <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:block">
      <table className="w-full table-fixed text-sm">
        <thead className="border-b">
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="h-10 px-2 pl-4 font-medium">
              {t('production.queue.columns.case')}
            </th>
            <th scope="col" className="hidden h-10 w-44 px-2 font-medium xl:table-cell">
              {t('production.queue.columns.practitioner')}
            </th>
            <th scope="col" className="h-10 w-36 px-2 font-medium">
              {t('production.queue.columns.status')}
            </th>
            {PRODUCTION_EVENT_TYPES.map((act) => (
              <th key={act} scope="col" className="h-10 w-28 px-2 text-right font-medium">
                {t(`production.actsShort.${act}`)}
              </th>
            ))}
            <th scope="col" className="h-10 w-32 px-2 pr-4 text-right font-medium">
              {t('production.queue.columns.lastAction')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = productionCaseHref(row.orderId);
            return (
              <tr
                key={row.orderId}
                onClick={(event) => {
                  if (opensRow(event)) router.push(href);
                }}
                className="cursor-pointer border-b align-middle last:border-0 hover:bg-muted/40"
              >
                <td className="px-2 py-2.5 pl-4">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Link
                      href={href}
                      className="truncate rounded-sm font-medium tabular-nums hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {row.orderCode}
                    </Link>
                    <ProductionKindBadge orderType={row.orderType} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.patientName}
                    {row.parentOrderCode &&
                      ` · ${t('production.queue.supplementalOf', { code: row.parentOrderCode })}`}
                  </p>
                  {/* What the lab may work on, read before the counters (spec §3). */}
                  <ReleaseSummary release={row.release} className="mt-1" />
                  {hasProvisional(row) && <ProvisionalLegend className="mt-0.5" />}
                </td>
                <td className="hidden truncate px-2 py-2.5 xl:table-cell">{row.practitionerName}</td>
                <td className="px-2 py-2.5">
                  <ProductionStatusBadge item={row} />
                </td>
                {PRODUCTION_EVENT_TYPES.map((act) => (
                  <td key={act} className="px-2 py-2.5">
                    <ActCell item={row} act={act} />
                  </td>
                ))}
                <td className="px-2 py-2.5 pr-4 text-right text-xs tabular-nums">
                  <LastAction at={row.lastActionAt} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Cards (below lg) ───────────────────────────────────────────────

function QueueCards({ rows }: { rows: ProductionQueueItem[] }) {
  const { t, lang } = useT();
  const today = businessToday();
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
      {rows.map((row) => (
        // The reference is the card's link; its ::after covers the card, so
        // the whole card is one big target while a screen reader still
        // reads the progress table as a table, not as a link label.
        <li
          key={row.orderId}
          className="relative rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40 active:bg-muted/60"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {/* A patient-name code (« Mohamed_Ben_Salah_20261127 ») has no
                  break opportunity: without overflow-wrap it pushes the card
                  past a 375 px screen. */}
              <Link
                href={productionCaseHref(row.orderId)}
                className="text-[15px] font-semibold tabular-nums outline-none [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
              >
                {row.orderCode}
              </Link>
              <ProductionKindBadge orderType={row.orderType} />
            </div>
            <ProductionStatusBadge item={row} className="shrink-0" />
          </div>
          <p className="mt-1 truncate text-[15px] font-medium">{row.patientName}</p>
          <p className="truncate text-sm text-muted-foreground">
            {row.practitionerName}
            {row.parentOrderCode &&
              ` · ${t('production.queue.supplementalOf', { code: row.parentOrderCode })}`}
          </p>
          <ReleaseSummary release={row.release} className="mt-2" />
          <ActProgressTable item={row} className="mt-3" />
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              {row.lastActionAt
                ? t('production.queue.lastAction', {
                    date: formatBusinessDayShort(row.lastActionAt, lang, today),
                  })
                : t('production.queue.notStarted')}
            </span>
            {/* A finished case's badge says "Terminé": say here whether
                every planned aligner went out. */}
            {row.deliveryComplete && productionStatusOf(row) !== 'delivery_complete' ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <CircleCheck className="size-3.5" aria-hidden="true" />
                {t('production.status.delivery_complete')}
              </span>
            ) : hasProvisional(row) ? (
              <ProvisionalLegend />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Loading ────────────────────────────────────────────────────────

/** The final layout with grey bars at the values' real sizes. */
export function ProductionQueueSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:block">
        <div className="h-10 border-b" />
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex h-[69px] items-center gap-4 border-b px-4 last:border-0">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-5 w-24 rounded-full" />
            {Array.from({ length: 4 }, (_, cell) => (
              <div key={cell} className="w-24 space-y-1">
                <Skeleton className="ml-auto h-3.5 w-16" />
                <Skeleton className="ml-auto h-3.5 w-16" />
              </div>
            ))}
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
        {Array.from({ length: Math.min(rows, 4) }, (_, index) => (
          <li key={index} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex justify-between">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <Skeleton className="mt-2 h-4 w-40" />
            <Skeleton className="mt-1.5 h-3.5 w-32" />
            <div className="mt-4 space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
