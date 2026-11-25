'use client';

import type { ComponentType, ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { Lang } from '@/lib/i18n/dict';
import { cn } from '@/lib/utils';
import { DEFAULT_MERCHANT_CURRENCY, formatAmount } from '@/lib/utils/currency';

/**
 * The récapitulatif's building blocks: a figure card, a titled section
 * card, and their skeletons (same boxes, same heights, so nothing moves
 * when the figures land).
 */

/** Amounts are numbers per the API contract; a Decimal string still reads right. */
export const num = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

type Translate = (path: string, vars?: Record<string, string | number>) => string;

/**
 * "1 facture" / "3 factures": `${base}One` or `${base}Other`, French
 * keeping the singular for 0 ("0 facture").
 */
export function plural(t: Translate, lang: Lang, base: string, count: number): string {
  const one = count === 1 || (lang === 'fr' && count === 0);
  return t(`${base}${one ? 'One' : 'Other'}`, { count });
}

export const CARD = 'min-w-0 rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10';

export function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  extra,
  emphasis,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sub: ReactNode;
  /** A second line under `sub` (a remise, what is left to collect). */
  extra?: ReactNode;
  /** The figure the TVA return needs: set apart with a stronger frame. */
  emphasis?: boolean;
}) {
  return (
    // From sm up the cards sit in rows: every card keeps room for the
    // fourth line (the skeleton has it too), so nothing moves on load.
    <div
      className={cn(CARD, 'flex flex-col gap-1 p-4 sm:min-h-31', emphasis && 'ring-foreground/25')}
    >
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0">{label}</span>
      </p>
      <p className="flex flex-wrap items-baseline gap-x-1 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
        <span className="min-w-0">{formatAmount(value)}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {DEFAULT_MERCHANT_CURRENCY}
        </span>
      </p>
      <div className="text-xs text-muted-foreground">{sub}</div>
      {extra ? <div className="text-xs text-muted-foreground">{extra}</div> : null}
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className={cn(CARD, 'flex flex-col gap-1 p-4 sm:min-h-31')} aria-hidden="true">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-7 w-40 sm:h-8" />
      <Skeleton className="h-4 w-28" />
      <Skeleton className="hidden h-4 w-36 sm:block" />
    </div>
  );
}

export function SectionCard({
  title,
  hint,
  children,
  footer,
  className,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(CARD, 'flex flex-col overflow-hidden', className)}>
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </header>
      {/* The table scrolls sideways inside the card, never the page. */}
      <div className="min-w-0 flex-1">{children}</div>
      {footer ? (
        <footer className="border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

export function SectionSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn(CARD, 'overflow-hidden', className)} aria-hidden="true">
      <div className="border-b px-4 py-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-1.5 h-3.5 w-64 max-w-full" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center justify-between gap-4 px-4 py-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The whole récapitulatif while its first figures load. */
export function RecapSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <KpiSkeleton key={index} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <SectionSkeleton rows={3} className="xl:col-span-3" />
        <SectionSkeleton rows={3} className="xl:col-span-2" />
      </div>
      <SectionSkeleton rows={4} />
    </div>
  );
}
