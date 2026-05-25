'use client';

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

  return (
    <Card className={cn('@container/card', className)}>
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
          {label}
        </CardDescription>
        <CardTitle
          className={cn(
            'font-semibold tabular-nums',
            compact ? 'text-xl @[250px]/card:text-2xl' : 'text-2xl @[250px]/card:text-3xl',
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
