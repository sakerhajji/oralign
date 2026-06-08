'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  type LucideIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react';

/**
 * Reusable KPI card used by both admin + doctor dashboards. Same
 * visual treatment as the legacy `<SectionCards />` (gradient bg,
 * tabular-nums, badge trend chip on the right) so the look stays
 * consistent across the whole product.
 *
 * Pass `loading` to render a skeleton placeholder. Pass `delta` to
 * surface a colored up/down chip on the right of the title.
 */
export interface KpiCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  delta?: { value: number; direction: 'up' | 'down' | 'neutral'; label?: string };
  footerLabel?: string;
  footerDetail?: string;
  loading?: boolean;
  className?: string;
  /** Tweaks the title size so cramped grids stay readable. */
  compact?: boolean;
  /**
   * Extra Tailwind classes applied to the value (CardTitle). Most KPIs
   * use the default neutral tone — this hook is here for the rare
   * surface that needs e.g. a destructive red on a negative number.
   * Default UX keeps the value the same colour as every other tile.
   */
  valueClassName?: string;
  /**
   * When set, the entire card becomes a Next.js Link to that route.
   * The card gets a subtle hover affordance so the user knows it's
   * clickable. Used for the doctor "Pending payments" KPI to deep-
   * link into the payment history filtered view.
   */
  href?: string;
  /**
   * When set, the entire card becomes a button that fires `onClick`
   * instead of navigating. Use this for KPI tiles that open a popup
   * (e.g. the doctor's Outstanding balance details). Mutually
   * exclusive with `href` — if both are passed, `href` wins because
   * navigation is the stricter contract.
   */
  onClick?: () => void;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
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
  if (loading) {
    return (
      <Card className={cn('@container/card', className)}>
        <CardHeader>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-7 w-24" />
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-32" />
        </CardFooter>
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

  // Either the card navigates (`href`), opens a popup (`onClick`), or
  // is purely informational. The first two get a subtle hover cue so
  // the user knows the card is interactive.
  const isInteractive = !!href || !!onClick;
  const cardBody = (
    <Card
      className={cn(
        '@container/card',
        isInteractive &&
          'transition cursor-pointer hover:border-primary/50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/40',
        className,
      )}
    >
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
          {label}
        </CardDescription>
        <CardTitle
          className={cn(
            'font-semibold tabular-nums',
            compact ? 'text-xl @[250px]/card:text-2xl' : 'text-2xl @[250px]/card:text-3xl',
            valueClassName,
          )}
        >
          {value}
        </CardTitle>
        {delta ? (
          <CardAction>
            <Badge variant="outline" className={cn('gap-1', deltaTone)}>
              <DeltaIcon className="size-3" />
              {delta.value > 0 && delta.direction !== 'neutral' ? '+' : ''}
              {Number.isFinite(delta.value) ? `${delta.value.toFixed(1)}%` : '—'}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      {footerLabel || footerDetail ? (
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {footerLabel ? (
            <div className="line-clamp-1 flex gap-2 font-medium">
              {footerLabel}
            </div>
          ) : null}
          {footerDetail ? (
            <div className="text-muted-foreground">{footerDetail}</div>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );

  if (href) {
    // `block` lets the Link expand to the card's full size so the
    // entire surface is clickable. `aria-label` mirrors the visible
    // label so screen-reader users get the same context.
    return (
      <Link href={href} aria-label={label} className="block focus:outline-none">
        {cardBody}
      </Link>
    );
  }
  if (onClick) {
    // Plain semantic button — keyboard activation + screen-reader role
    // come for free. `text-left` keeps the card content left-aligned
    // because <button> defaults to centred text in some browsers.
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="block w-full text-left focus:outline-none"
      >
        {cardBody}
      </button>
    );
  }
  return cardBody;
}

/**
 * Standard responsive grid wrapper for KPI cards. Matches the legacy
 * SectionCards layout exactly so the new dashboards drop in without
 * any visual jank.
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
        'grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @4xl/main:grid-cols-3 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card',
        className,
      )}
    >
      {children}
    </div>
  );
}
