'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * A row of aggregate figures — the quiet alternative to a grid of KPI
 * cards: one surface, hairline dividers, numbers in tabular figures.
 * Callers set the column count from sm up (`sm:grid-cols-3`,
 * `sm:grid-cols-4`…).
 *
 * Phones get two columns: a rule between the columns and between the
 * rows (never along the frame's own edge), and an odd last figure takes
 * the whole row instead of leaving an empty half.
 */
export function FigureRow({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <dl
      className={cn(
        // overflow-hidden: a selected figure's fill keeps the rounded corners.
        'grid grid-cols-2 overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10',
        '[&>:nth-child(odd)]:border-e [&>:nth-child(n+3)]:border-t',
        '[&>:last-child:nth-child(odd)]:col-span-2 [&>:last-child:nth-child(odd)]:border-e-0',
        'sm:[&>*]:border-e sm:[&>:last-child]:border-e-0 sm:[&>:nth-child(n+3)]:border-t-0',
        'sm:[&>:last-child:nth-child(odd)]:col-span-1',
        className,
      )}
    >
      {children}
    </dl>
  );
}

/**
 * Value sizes. `default` is a secondary strip (the invoices desk); `lg`
 * is a screen's answer (the payments takings): larger on every width and
 * the strong figure at least 1.25-1.33× its siblings. The skeleton bars
 * match each line height, so nothing moves when the value lands.
 */
const SIZES = {
  default: {
    cell: 'py-3',
    value: 'text-sm font-medium sm:text-base',
    strong: 'text-base font-semibold sm:text-lg',
    bar: 'h-5 sm:h-6',
    strongBar: 'h-6 sm:h-7',
  },
  lg: {
    cell: 'py-2 sm:py-3',
    value: 'text-base font-medium lg:text-lg',
    strong: 'text-xl font-semibold lg:text-2xl',
    bar: 'h-6 lg:h-7',
    strongBar: 'h-7 lg:h-8',
  },
} as const;

export function Figure({
  label,
  value,
  unit,
  hint,
  strong,
  size = 'default',
  onSelect,
  selected = false,
  selectLabel,
}: {
  label: string;
  /** null while the figure is loading. */
  value: string | null;
  /**
   * A unit set apart as a smaller grey suffix ("TND"). With a unit the
   * value never truncates: a long amount wraps its unit to a second line
   * instead of losing digits behind an ellipsis.
   */
  unit?: string;
  hint?: string;
  strong?: boolean;
  size?: keyof typeof SIZES;
  /** Makes the figure a toggle (e.g. "show these payments in the list"). */
  onSelect?: () => void;
  /** The toggle is on: the list below shows what the figure counts. */
  selected?: boolean;
  /** The toggle's accessible name (the visible value alone says too little). */
  selectLabel?: string;
}) {
  const sizes = SIZES[size];
  const interactive = onSelect !== undefined && value !== null;
  const shown = unit ? (
    <>
      <span className="min-w-0">{value}</span>
      <span className="text-xs font-normal text-muted-foreground">{unit}</span>
    </>
  ) : (
    value
  );
  const layout = unit ? 'flex flex-wrap items-baseline gap-x-1' : 'truncate';

  return (
    <div
      className={cn(
        'relative min-w-0 px-4',
        sizes.cell,
        interactive && 'transition-colors hover:bg-muted/40',
        selected && 'bg-muted/70 hover:bg-muted/70',
      )}
    >
      <dt
        className={cn(
          'text-xs leading-tight',
          selected ? 'font-medium text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
        {hint ? <span className="ml-1 tabular-nums">({hint})</span> : null}
      </dt>
      <dd className={cn('mt-0.5 tabular-nums', strong ? sizes.strong : sizes.value)}>
        {value === null ? (
          <Skeleton className={cn('w-24', strong ? sizes.strongBar : sizes.bar)} />
        ) : interactive ? (
          // The whole cell is the target (the ::after covers it); the
          // button stays inside the <dd> so the list keeps its dt/dd pairs.
          <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            aria-label={selectLabel}
            className={cn(
              'block w-full text-left focus-visible:outline-none',
              'after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset',
              layout,
            )}
          >
            {shown}
          </button>
        ) : (
          <span className={cn('block', layout)}>{shown}</span>
        )}
      </dd>
    </div>
  );
}
