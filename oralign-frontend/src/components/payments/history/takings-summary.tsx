'use client';

import { useId, type ComponentType } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Banknote, CreditCard, Landmark, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { extractApiError } from '@/lib/api/error';
import { useT } from '@/lib/i18n/lang-context';
import {
  PaymentMethod,
  type PaymentsSummary,
  type PaymentsSummaryBucket,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { currencyCode, formatAmount, formatPrice } from '@/lib/utils/currency';

type Translate = (path: string, vars?: Record<string, string | number>) => string;

const METHODS: { method: PaymentMethod; icon: ComponentType<{ className?: string }> }[] = [
  { method: PaymentMethod.CASH, icon: Banknote },
  { method: PaymentMethod.CARD, icon: CreditCard },
  { method: PaymentMethod.BANK_TRANSFER, icon: Landmark },
];

/** A grey bar for a value still loading, inside a line of text (Skeleton is a div). */
function InlineBar({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block animate-pulse rounded-md bg-muted align-middle', className)}
    />
  );
}

function countText(count: number, t: Translate): string {
  if (count === 0) return t('paymentsDesk.takings.countNone');
  if (count === 1) return t('paymentsDesk.takings.countOne');
  return t('paymentsDesk.takings.count', { count });
}

/**
 * The money received over the global period, one card per method (cash,
 * card, bank transfer) with the overall total in the heading: successful
 * payments only, treatment fees and installments together, each counted
 * once (the server's sums, never added up from the rows). They follow
 * ONLY the period — never a tab's search or filters — so they always
 * answer "how much came in". An admin collected it; a dentist paid it.
 */
export function TakingsSummary({
  summary,
  isAdmin,
  periodLabel,
  rangeLabel,
}: {
  summary: UseQueryResult<PaymentsSummary, Error>;
  isAdmin: boolean;
  /** The period's name on each card: "Aujourd’hui", "7 derniers jours"… */
  periodLabel: string;
  /** The days in words, for the heading: "du 1er au 6 nov. 2026". */
  rangeLabel: string;
}) {
  const { t } = useT();
  const headingId = useId();
  const data = summary.data;
  const role = isAdmin ? 'admin' : 'dentist';
  const unit = currencyCode(data?.currency);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {/* The period is spelled out just above (under the date filter);
            screen readers still hear it with the figures. */}
        <h2 id={headingId} className="text-sm font-medium">
          {t(`paymentsDesk.takings.${role}.title`)}
          <span className="sr-only"> · {rangeLabel}</span>
        </h2>
        {data ? (
          <p className="text-sm text-muted-foreground">
            {t('paymentsDesk.colon', { label: t(`paymentsDesk.takings.${role}.total`) })}{' '}
            <strong className="font-semibold text-foreground tabular-nums">
              {formatPrice(data.total.amount, data.currency)}
            </strong>{' '}
            · {countText(data.total.count, t)}
          </p>
        ) : !summary.isError ? (
          <Skeleton className="h-5 w-56" />
        ) : null}
      </div>

      {summary.isError && !data ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-card px-4 py-2.5 text-sm ring-1 ring-foreground/10">
          <p className="min-w-0 text-muted-foreground">
            {t('paymentsDesk.takings.error')} {extractApiError(summary.error).message}
          </p>
          <Button variant="ghost" size="sm" onClick={() => void summary.refetch()}>
            <RefreshCw aria-hidden="true" />
            {t('paymentsDesk.retry')}
          </Button>
        </div>
      ) : (
        <ul
          aria-busy={summary.isPlaceholderData || undefined}
          className={cn(
            'grid gap-2 transition-opacity duration-150 sm:grid-cols-3 sm:gap-3',
            summary.isPlaceholderData && 'opacity-60',
          )}
        >
          {METHODS.map(({ method, icon }) => (
            <li key={method}>
              <MethodCard
                icon={icon}
                label={t(`paymentsDesk.methodLong.${method}`)}
                bucket={data?.methods[method]}
                unit={unit}
                currency={data?.currency}
                periodLabel={periodLabel}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One method's takings. A phone gets a compact row (icon, label and
 * count, amount on the right); from sm up, a card with the amount large.
 */
function MethodCard({
  icon: Icon,
  label,
  bucket,
  unit,
  currency,
  periodLabel,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  bucket: PaymentsSummaryBucket | undefined;
  unit: string;
  currency: string | undefined;
  periodLabel: string;
}) {
  const { t } = useT();
  const count = bucket ? countText(bucket.count, t) : null;
  return (
    <article
      aria-label={
        bucket
          ? `${t('paymentsDesk.filters.chip', { label, value: formatPrice(bucket.amount, currency) })}, ${count}`
          : label
      }
      className="flex h-full items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10 sm:flex-col sm:items-stretch sm:gap-2 sm:py-4"
    >
      <div className="flex items-center gap-3 sm:justify-between">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground sm:order-2 sm:size-8">
          <Icon className="size-[18px] sm:size-4" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col sm:order-1">
          <span className="truncate text-sm font-medium sm:font-normal sm:text-muted-foreground">
            {label}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums sm:hidden">
            {count ?? <InlineBar className="mt-1 h-3 w-16" />}
          </span>
        </span>
      </div>

      <div className="ml-auto text-right sm:ml-0 sm:text-left" aria-hidden="true">
        {bucket ? (
          <p className="flex flex-wrap items-baseline justify-end gap-x-1 sm:justify-start">
            <span className="text-lg font-semibold tracking-tight tabular-nums sm:text-2xl">
              {formatAmount(bucket.amount)}
            </span>
            <span className="text-xs text-muted-foreground">{unit}</span>
          </p>
        ) : (
          <Skeleton className="h-7 w-28 sm:h-8 sm:w-36" />
        )}
      </div>

      <p className="hidden items-center justify-between gap-2 text-xs text-muted-foreground sm:flex">
        <span className="tabular-nums">{count ?? <InlineBar className="h-3 w-16" />}</span>
        <span className="truncate">{periodLabel}</span>
      </p>
    </article>
  );
}
