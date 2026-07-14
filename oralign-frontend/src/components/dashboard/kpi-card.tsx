'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  type LucideIcon,
  ArrowUpRightIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react';

/**
 * Reusable KPI card used by both admin + doctor dashboards.
 *
 * Anatomy (top to bottom):
 *   • uppercase micro-label + a soft-tinted icon chip on the right
 *   • the value — large, tabular-nums — with the optional trend chip
 *     sitting on the same baseline
 *   • a separated footer line for the secondary stat; interactive
 *     cards close the line with an arrow that nudges on hover so the
 *     affordance is visible without reading any copy
 *
 * Pass `loading` to render a skeleton with the exact same geometry
 * (no layout shift when data lands). Pass `tone` to tint the icon
 * chip — color is reserved for meaning, the card itself stays neutral.
 */

/** Icon-chip tints. Subtle 10% fills so color labels, never shouts. */
const TONE_CHIP: Record<KpiTone, string> = {
  primary: 'bg-primary/10 text-primary ring-primary/15',
  emerald:
    'bg-emerald-500/10 text-emerald-600 ring-emerald-500/15 dark:text-emerald-400',
  red: 'bg-red-500/10 text-red-600 ring-red-500/15 dark:text-red-400',
  amber:
    'bg-amber-500/10 text-amber-600 ring-amber-500/15 dark:text-amber-400',
  violet:
    'bg-violet-500/10 text-violet-600 ring-violet-500/15 dark:text-violet-400',
  sky: 'bg-sky-500/10 text-sky-600 ring-sky-500/15 dark:text-sky-400',
  neutral: 'bg-muted text-muted-foreground ring-border',
};

export type KpiTone =
  | 'primary'
  | 'emerald'
  | 'red'
  | 'amber'
  | 'violet'
  | 'sky'
  | 'neutral';

export interface KpiCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  /** Tint for the icon chip. Defaults to the brand primary. */
  tone?: KpiTone;
  delta?: { value: number; direction: 'up' | 'down' | 'neutral'; label?: string };
  footerLabel?: string;
  footerDetail?: string;
  loading?: boolean;
  className?: string;
  /** Tweaks the value size so cramped grids stay readable. */
  compact?: boolean;
  /**
   * Extra Tailwind classes applied to the value. Most KPIs use the
   * default neutral tone — this hook is here for the rare surface
   * that needs e.g. a destructive red on a negative number.
   */
  valueClassName?: string;
  /**
   * When set, the entire card becomes a Next.js Link to that route.
   * The card gets a hover lift + a footer arrow so the user knows
   * it's clickable.
   */
  href?: string;
  /**
   * When set, the entire card becomes a button that fires `onClick`
   * instead of navigating (e.g. KPI tiles that open a popup).
   * Mutually exclusive with `href` — if both are passed, `href`
   * wins because navigation is the stricter contract.
   */
  onClick?: () => void;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = 'primary',
  delta,
  footerLabel,
  footerDetail,
  loading,
  className,
  compact,
  valueClassName,
  href,
  onClick,
}: KpiCardProps) {
  const hasFooter = !!footerLabel || !!footerDetail;
  const isInteractive = !!href || !!onClick;

  if (loading) {
    // Mirrors the loaded card's geometry exactly — same paddings, same
    // row heights — so the grid doesn't shift when the data lands.
    return (
      <Card className={cn('@container/card gap-0 py-0', className)}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="size-9 shrink-0 rounded-lg" />
        </div>
        <div className="mt-4 border-t px-5 py-3">
          <Skeleton className="h-4 w-40" />
        </div>
      </Card>
    );
  }

  const deltaTone =
    delta?.direction === 'up'
      ? 'text-emerald-700 dark:text-emerald-300'
      : delta?.direction === 'down'
        ? 'text-destructive'
        : 'text-muted-foreground';
  const DeltaIcon =
    delta?.direction === 'down' ? TrendingDownIcon : TrendingUpIcon;

  const cardBody = (
    <Card
      className={cn(
        '@container/card h-full gap-0 py-0',
        isInteractive &&
          'transition-all duration-200 group-hover:shadow-md group-hover:ring-primary/30 group-focus-visible:ring-primary/40',
        className,
      )}
    >
      {/* ── Label row + icon chip ── */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </p>

          {/* ── Value + trend on one baseline ── */}
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              className={cn(
                'font-semibold tabular-nums leading-none tracking-tight text-foreground',
                compact
                  ? 'text-xl @[250px]/card:text-2xl'
                  : 'text-2xl @[250px]/card:text-[1.75rem]',
                valueClassName,
              )}
            >
              {value}
            </span>
            {delta ? (
              <Badge variant="outline" className={cn('gap-1', deltaTone)}>
                <DeltaIcon className="size-3" />
                {delta.value > 0 && delta.direction !== 'neutral' ? '+' : ''}
                {Number.isFinite(delta.value) ? `${delta.value.toFixed(1)}%` : '—'}
              </Badge>
            ) : null}
          </div>
        </div>

        {Icon ? (
          <span
            aria-hidden
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset',
              TONE_CHIP[tone],
            )}
          >
            <Icon className="size-[18px]" />
          </span>
        ) : null}
      </div>

      {/* ── Footer: secondary stat + interaction affordance ── */}
      {hasFooter || isInteractive ? (
        <div className="mt-4 flex items-center justify-between gap-3 border-t px-5 py-3">
          <div className="min-w-0 space-y-0.5">
            {footerLabel ? (
              <p className="truncate text-[13px] font-medium text-foreground/80">
                {footerLabel}
              </p>
            ) : null}
            {footerDetail ? (
              <p className="truncate text-xs text-muted-foreground">
                {footerDetail}
              </p>
            ) : null}
          </div>
          {isInteractive ? (
            <ArrowUpRightIcon
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary"
            />
          ) : null}
        </div>
      ) : (
        // Keep a consistent bottom rhythm on purely informational
        // cards that carry no footer copy.
        <div className="pb-5" />
      )}
    </Card>
  );

  // The focus ring lives on the interactive WRAPPER (the element that
  // actually receives keyboard focus), not on the inner card — with
  // the ring on the card and outline-none on the wrapper, keyboard
  // users had no visible focus indicator at all.
  const interactiveWrapper =
    'group block h-full w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background';

  if (href) {
    return (
      <Link href={href} aria-label={label} className={interactiveWrapper}>
        {cardBody}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={interactiveWrapper}
      >
        {cardBody}
      </button>
    );
  }
  return cardBody;
}

/**
 * Standard responsive grid wrapper for KPI cards. The cards own their
 * surface now (flat bg-card + ring) — the old per-child gradient wash
 * made every dashboard tile look slightly muddy.
 */
export function KpiGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 items-stretch gap-4 @xl/main:grid-cols-2 @4xl/main:grid-cols-3 @5xl/main:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
