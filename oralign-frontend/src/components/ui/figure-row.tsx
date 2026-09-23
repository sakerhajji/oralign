'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * A row of aggregate figures — the quiet alternative to a grid of KPI
 * cards: one surface, hairline dividers, numbers in tabular figures.
 * Callers set the column count (`sm:grid-cols-3`, `sm:grid-cols-4`…).
 */
export function FigureRow({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 divide-y rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10 sm:divide-x sm:divide-y-0',
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function Figure({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  /** null while the figure is loading. */
  value: string | null;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="px-4 py-3">
      <dt className="text-xs leading-tight text-muted-foreground">
        {label}
        {hint ? <span className="ml-1 opacity-70">({hint})</span> : null}
      </dt>
      <dd
        className={cn(
          'mt-0.5 truncate tabular-nums',
          strong ? 'text-base font-semibold sm:text-lg' : 'text-sm font-medium sm:text-base',
        )}
      >
        {value === null ? <Skeleton className="h-5 w-24" /> : value}
      </dd>
    </div>
  );
}
