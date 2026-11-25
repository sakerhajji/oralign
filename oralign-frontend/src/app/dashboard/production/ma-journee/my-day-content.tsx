'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { ProductionCancelDialog } from '@/components/production/cancel-dialog';
import {
  DeclarationList,
  DeclarationListSkeleton,
} from '@/components/production/declaration-list';
import {
  groupDeclarations,
  isProductionRole,
  productionErrorText,
  type DeclarationGroup,
} from '@/components/production/production-format';
import {
  BackLink,
  ProductionFrame,
  ProductionMessage,
  ProductionNoAccess,
} from '@/components/production/production-ui';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useProductionMyDay } from '@/lib/hooks/use-production';
import { useT } from '@/lib/i18n/lang-context';
import { useAuth } from '@/lib/providers/auth-provider';
import {
  PRODUCTION_EVENT_TYPES,
  type ProductionEventWithOrder,
  type ProductionMyDay,
  type ProductionMyDayChoice,
} from '@/lib/types/production';
import { cn } from '@/lib/utils';
import { formatCalendarDay } from '@/lib/utils/business-day';

function readDayChoice(params: { get(name: string): string | null }): ProductionMyDayChoice {
  return params.get('day') === 'yesterday' ? 'yesterday' : 'today';
}

export function MyDayContent() {
  const { user } = useAuth();
  if (!user) return <MyDaySkeleton />;
  if (!isProductionRole(user.role)) return <ProductionNoAccess />;
  return <MyDay />;
}

function MyDay() {
  const { t, lang } = useT();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [choice, setChoice] = useState<ProductionMyDayChoice>(() => readDayChoice(searchParams));
  const [cancelling, setCancelling] = useState<DeclarationGroup<ProductionEventWithOrder> | null>(null);
  const entriesHeadingRef = useRef<HTMLHeadingElement>(null);

  // A link to this page with other params re-renders it without a
  // remount: follow a URL changed from outside. Our own replaceState
  // comes back through useSearchParams equal to the state, so it is a no-op.
  const urlSearch = searchParams.toString();
  const [seenUrl, setSeenUrl] = useState(urlSearch);
  if (urlSearch !== seenUrl) {
    setSeenUrl(urlSearch);
    const fromUrl = readDayChoice(searchParams);
    if (fromUrl !== choice) setChoice(fromUrl);
  }

  useEffect(() => {
    const next = choice === 'yesterday' ? '?day=yesterday' : '';
    if (next !== window.location.search) {
      window.history.replaceState(null, '', `${pathname}${next}${window.location.hash}`);
    }
  }, [choice, pathname]);

  const day = useProductionMyDay(choice);
  const groups = useMemo(() => groupDeclarations(day.data?.events ?? []), [day.data]);
  const busy = day.isPlaceholderData;

  return (
    <ProductionFrame>
      <BackLink href="/dashboard/production">{t('production.nav.backToQueue')}</BackLink>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t('production.myDay.title')}</h1>
          <p className="min-h-5 text-sm text-muted-foreground first-letter:uppercase">
            {day.data ? formatCalendarDay(day.data.day, lang, 'weekday') : null}
          </p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          value={choice}
          onValueChange={(value) => {
            if (value) setChoice(value as ProductionMyDayChoice);
          }}
          aria-label={t('production.myDay.choiceAria')}
          className="w-full sm:w-auto"
        >
          {(['today', 'yesterday'] as const).map((value) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className="h-12 flex-1 px-5 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground sm:flex-none pointer-fine:md:h-9"
            >
              {t(`production.myDay.${value}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </header>

      {day.isPending ? (
        <>
          <TotalsSkeleton />
          <DeclarationListSkeleton />
        </>
      ) : day.isError && !day.data ? (
        <ProductionMessage
          role="alert"
          title={t('production.myDay.errorTitle')}
          detail={productionErrorText(t, day.error)}
          action={
            <Button variant="outline" className="h-12 pointer-fine:md:h-8" onClick={() => day.refetch()}>
              <RefreshCw aria-hidden="true" />
              {t('production.retry')}
            </Button>
          }
        />
      ) : (
        <div
          aria-busy={busy || undefined}
          className={cn('flex flex-col gap-4 transition-opacity duration-150', busy && 'opacity-60')}
        >
          <Totals data={day.data} />
          <section aria-labelledby="my-entries" className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <h2 id="my-entries" ref={entriesHeadingRef} tabIndex={-1} className="text-sm font-semibold outline-none">
                {t('production.myDay.entriesTitle')}
              </h2>
              <p className="text-xs text-muted-foreground">{t('production.myDay.grouping')}</p>
            </div>
            {groups.length === 0 ? (
              <ProductionMessage
                icon={<CalendarDays />}
                title={t(choice === 'today' ? 'production.myDay.emptyToday' : 'production.myDay.emptyYesterday')}
                action={
                  choice === 'today' ? (
                    <Button asChild variant="outline" className="h-12 pointer-fine:md:h-8">
                      <Link href="/dashboard/production">{t('production.myDay.openQueue')}</Link>
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <DeclarationList groups={groups} onCancel={setCancelling} showOrder />
            )}
          </section>
        </div>
      )}

      <ProductionCancelDialog
        group={cancelling}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
        // A cancelled row loses its "Annuler": back to the list, not the page top.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          entriesHeadingRef.current?.focus();
        }}
      />
    </ProductionFrame>
  );
}

/** Per act: the quantity made (the big figure) and how many entries. */
function Totals({ data }: { data: ProductionMyDay }) {
  const { t } = useT();
  return (
    <section aria-labelledby="my-totals">
      <h2 id="my-totals" className="sr-only">
        {t('production.myDay.totalsTitle')}
      </h2>
      {/* 1 px rules between the cells: the grid's gap shows the frame tone. */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-foreground/10 ring-1 ring-foreground/10 lg:grid-cols-4">
        {PRODUCTION_EVENT_TYPES.map((act) => {
          const total = data.totals[act];
          return (
            <div key={act} className="flex flex-col gap-0.5 bg-card px-4 py-3">
              <dt className="text-xs text-muted-foreground">{t(`production.acts.${act}`)}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{total.quantity}</dd>
              <dd className="text-xs text-muted-foreground">
                {total.entries === 0
                  ? t('production.myDay.entriesNone')
                  : total.entries === 1
                    ? t('production.myDay.entriesOne')
                    : t('production.myDay.entries', { count: total.entries })}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function TotalsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-foreground/10 ring-1 ring-foreground/10 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="space-y-1.5 bg-card px-4 py-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-10" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function MyDaySkeleton() {
  return (
    <ProductionFrame>
      <Skeleton className="h-12 w-40 pointer-fine:md:h-9" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-12 w-full rounded-lg sm:w-52 pointer-fine:md:h-9" />
      </div>
      <TotalsSkeleton />
      <DeclarationListSkeleton />
    </ProductionFrame>
  );
}
