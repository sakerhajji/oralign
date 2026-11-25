'use client';

import type { ComponentType, ReactNode } from 'react';
import { CircleCheck, Flame, Lock, Printer, Scissors, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n/lang-context';
import {
  PRODUCTION_EVENT_TYPES,
  type ProductionCaseSheet,
  type ProductionEventType,
  type ReleasedRange,
} from '@/lib/types/production';
import { cn } from '@/lib/utils';
import { ActProgressBar, counterText } from './act-progress';
import { ACT_COUNTER, ARCHES, rangeText } from './production-format';
import { ProductionKindBadge, ProductionStatusBadge } from './production-ui';

const ACT_ICON: Record<ProductionEventType, ComponentType<{ className?: string }>> = {
  model_printed: Printer,
  aligner_thermoformed: Flame,
  aligner_cut: Scissors,
  aligner_delivered: Truck,
};

/**
 * Who and what: reference, patient, practitioner, kind, planned totals,
 * steps. `actions` sits top right (the page's links); on a wide screen the
 * two facts share one row instead of stacking.
 */
export function CaseSheetHeader({ sheet, actions }: { sheet: ProductionCaseSheet; actions?: ReactNode }) {
  const { t } = useT();
  return (
    <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10 sm:px-5 lg:px-6 lg:py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
              {sheet.orderCode}
            </h1>
            <ProductionKindBadge orderType={sheet.orderType} />
            <ProductionStatusBadge item={sheet} />
          </div>
          <p className="mt-1 text-base font-medium">{sheet.patientName}</p>
          <p className="text-sm text-muted-foreground">
            {[
              sheet.practitionerName,
              sheet.clinicName,
              sheet.parentOrderCode
                ? t('production.queue.supplementalOf', { code: sheet.parentOrderCode })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>

      <dl className="mt-4 grid gap-3 border-t pt-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-6 lg:grid-cols-[auto_auto_auto_minmax(0,1fr)] lg:items-center lg:gap-x-8">
        <dt className="text-xs text-muted-foreground sm:pt-0.5 lg:pt-0">{t('production.sheet.plannedTitle')}</dt>
        <dd className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {ARCHES.map((arch) => {
            const planned = sheet.planned[arch];
            return (
              <span key={arch} className="inline-flex items-center gap-1.5">
                <span className="text-muted-foreground">{t(`production.arches.${arch}`)}</span>
                {planned === null ? (
                  <span className="text-muted-foreground">— {t('production.planned.notTreated')}</span>
                ) : (
                  <>
                    <span className="font-semibold tabular-nums">
                      {planned.total ?? t('production.planned.unknown')}
                    </span>
                    {planned.provisional && planned.total !== null && (
                      <Badge
                        variant="outline"
                        className="text-[11px] text-muted-foreground"
                        title={t('production.planned.provisionalHint')}
                      >
                        {t('production.planned.provisional')}
                      </Badge>
                    )}
                  </>
                )}
              </span>
            );
          })}
        </dd>
        <dt className="text-xs text-muted-foreground sm:pt-1 lg:border-l lg:pt-0 lg:pl-8">
          {t('production.sheet.stepsTitle')}
        </dt>
        <dd>
          <ReleasedRangesStrip ranges={sheet.releasedRanges} />
        </dd>
      </dl>
    </section>
  );
}

const RANGE_TONE: Record<ReleasedRange['state'], string> = {
  released: 'bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-100 dark:ring-sky-900',
  delivered:
    'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-100 dark:ring-emerald-900',
  locked: 'bg-background text-muted-foreground ring-border border-dashed',
};

/**
 * The case's step schedule: which ranges the lab may deliver. A locked
 * range reads "non libérées", never anything about money (owner D1).
 */
export function ReleasedRangesStrip({ ranges }: { ranges: ReleasedRange[] | null }) {
  const { t } = useT();
  if (!ranges) {
    return <p className="text-sm text-muted-foreground">{t('production.sheet.stepsNoSchedule')}</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {ranges.map((range) => (
        <li
          key={`${range.from}-${range.to}`}
          className={cn(
            'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs ring-1',
            RANGE_TONE[range.state],
          )}
        >
          {range.state === 'locked' && <Lock className="size-3" aria-hidden="true" />}
          {range.state === 'delivered' && <CircleCheck className="size-3" aria-hidden="true" />}
          <span className="font-medium tabular-nums">{rangeText(t, range.from, range.to)}</span>
          <span>{t(`production.sheet.ranges.${range.state}`)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The four acts as big buttons (2 × 2 on a phone, 4 across from lg):
 * the act, its counters per treated arch, and the next step to do.
 * One tap opens the declaration with that next step prefilled.
 */
export function ActButtons({
  sheet,
  onDeclare,
}: {
  sheet: ProductionCaseSheet;
  onDeclare: (act: ProductionEventType) => void;
}) {
  const { t } = useT();
  const arches = ARCHES.filter((arch) => sheet.planned[arch] !== null);
  const shownArches = arches.length ? arches : ARCHES;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {PRODUCTION_EVENT_TYPES.map((act) => {
        const Icon = ACT_ICON[act];
        const next = sheet.nextStepFrom[act];
        const nextSteps = shownArches.map((arch) => next[arch]);
        const allCovered = nextSteps.every((step) => step === null);
        const differ =
          shownArches.length === 2 && next.upper !== null && next.lower !== null && next.upper !== next.lower;
        return (
          <button
            key={act}
            type="button"
            disabled={!sheet.canDeclare}
            onClick={() => onDeclare(act)}
            className="group flex min-h-32 flex-col items-start gap-2 rounded-xl bg-card p-3.5 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60 sm:p-4"
          >
            {/* lg to xl: four narrow cards where some titles wrap; two lines for all keeps the counters level. */}
            <span className="flex items-center gap-2 text-sm font-semibold sm:text-base lg:max-xl:min-h-12">
              <Icon className="size-4 shrink-0 text-muted-foreground sm:size-5" />
              {t(`production.acts.${act}`)}
            </span>
            <span className="flex flex-col gap-2 self-stretch">
              {shownArches.map((arch) => {
                const planned = sheet.planned[arch];
                const done = sheet.counters[arch][ACT_COUNTER[act]];
                return (
                  <span key={arch} className="flex flex-col gap-1">
                    <span className="inline-flex items-baseline gap-1">
                      {shownArches.length > 1 && (
                        <span className="w-8 shrink-0 text-xs text-muted-foreground">
                          {t(`production.archesShort.${arch}`)}
                        </span>
                      )}
                      <span className="text-2xl font-semibold tabular-nums">
                        {planned ? counterText(done, planned) : done}
                      </span>
                    </span>
                    {planned && <ActProgressBar done={done} planned={planned} />}
                  </span>
                );
              })}
            </span>
            <span className="mt-auto text-xs text-muted-foreground">
              {allCovered ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <CircleCheck className="size-3.5" aria-hidden="true" />
                  {t('production.sheet.allCovered')}
                </span>
              ) : differ ? (
                t('production.sheet.nextPerArch', {
                  upper: next.upper ?? '—',
                  lower: next.lower ?? '—',
                })
              ) : (
                t('production.sheet.next', {
                  step: nextSteps.find((step) => step !== null) ?? '—',
                })
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function CaseSheetSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10 sm:px-5 lg:px-6 lg:py-5">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-5 w-48" />
        <Skeleton className="mt-1.5 h-4 w-56" />
        <div className="mt-4 space-y-2 border-t pt-3">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-7 w-72 rounded-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="min-h-32 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-3 h-7 w-24" />
            <Skeleton className="mt-6 h-3.5 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
