'use client';

import type { ComponentType, ReactNode } from 'react';
import { CircleCheck, Flame, Lock, Printer, Scissors, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n/lang-context';
import { useAuth } from '@/lib/providers/auth-provider';
import {
  PRODUCTION_EVENT_TYPES,
  type ProductionCaseSheet,
  type ProductionEventType,
  type ReleasedRange,
} from '@/lib/types/production';
import { cn } from '@/lib/utils';
import { ActProgressBar, archCounterText } from './act-progress';
import { SheetBatchUnlock } from './batch-delivery-button';
import { ACT_COUNTER, ARCHES, isTechnicianRole, rangeText } from './production-format';
import { ProductionKindBadge, ProductionStatusBadge } from './production-ui';
import { nothingReleased, plannedTotalLabel, spanLabel, workableStepCount } from './release-format';
import { ReleaseSummary } from './release-summary';

const ACT_ICON: Record<ProductionEventType, ComponentType<{ className?: string }>> = {
  model_printed: Printer,
  aligner_thermoformed: Flame,
  aligner_cut: Scissors,
  aligner_delivered: Truck,
};

/**
 * Who and what: reference, patient, practitioner, kind, planned totals,
 * steps. `actions` sits top right (the page's links); on a wide screen the
 * two facts share one row instead of stacking. The release (spec §3) is
 * read first: « Plan 1→7 · Débloquées 1→4 · Prochaine tranche 5→7 ».
 * An admin gets « Débloquer » on each locked chip (`canUnlock`).
 */
export function CaseSheetHeader({
  sheet,
  actions,
  canUnlock = false,
}: {
  sheet: ProductionCaseSheet;
  actions?: ReactNode;
  /** The caller is an admin: locked chips offer the manual unlock. */
  canUnlock?: boolean;
}) {
  const { t } = useT();
  return (
    <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-foreground/10 sm:px-5 lg:px-6 lg:py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Codes are patient-name slugs (« Mohamed_Ben_Salah_20261127 »)
                with no break opportunity: let them wrap on a phone. */}
            <h1 className="text-xl font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-2xl">
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

      <section aria-label={t('production.sheet.releaseTitle')} className="mt-4 border-t pt-3">
        <ReleaseSummary release={sheet.release} variant="block" />
      </section>

      <dl className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-6 lg:grid-cols-[auto_auto_auto_minmax(0,1fr)] lg:items-center lg:gap-x-8">
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
          <ReleasedRangesStrip
            ranges={sheet.releasedRanges}
            unlockable={canUnlock}
            orderId={sheet.orderId}
            unscheduled={sheet.release.state === 'unscheduled'}
          />
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
 * The case's step schedule: which tranches the lab may work on, trimmed
 * to the approved plan. A locked tranche reads "non débloquées", never
 * anything about money (owner D1, spec §3); an admin may unlock it there.
 */
export function ReleasedRangesStrip({
  ranges,
  unlockable = false,
  orderId,
  unscheduled = false,
}: {
  ranges: ReleasedRange[] | null;
  unlockable?: boolean;
  orderId?: string;
  /** No schedule and everything released (legacy): say so instead of nothing. */
  unscheduled?: boolean;
}) {
  const { t } = useT();
  if (!ranges || ranges.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {unscheduled ? t('production.sheet.stepsNoSchedule') : '—'}
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {ranges.map((range) => (
        <li
          key={`${range.from}-${range.to}`}
          className={cn(
            'inline-flex min-h-7 items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs ring-1',
            RANGE_TONE[range.state],
            !(unlockable && range.state === 'locked') && 'pr-2.5',
          )}
        >
          {range.state === 'locked' && <Lock className="size-3" aria-hidden="true" />}
          {range.state === 'delivered' && <CircleCheck className="size-3" aria-hidden="true" />}
          {/* One run of text: beside the 48 px « Débloquer » of a phone it
              wraps as a phrase, never as two squeezed columns. */}
          <span className="min-w-0">
            <span className="font-medium tabular-nums">{rangeText(t, range.from, range.to)}</span>{' '}
            {t(`production.sheet.ranges.${range.state}`)}
          </span>
          {unlockable && orderId && range.state === 'locked' && (
            <SheetBatchUnlock orderId={orderId} range={range} />
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The four acts as big buttons (2 × 2 on a phone, 4 across from lg):
 * the act, its counters per treated arch, and the next step to do.
 * One tap opens the declaration with that next step prefilled.
 *
 * Spec §3: while the plan is partly released a counter reads done over
 * the UNLOCKED steps (« 3/4 », « sur 7 prévus » under it) and the next
 * step never is a locked one. With nothing unlocked the technician's
 * buttons are disabled (every entry would be refused); an admin keeps
 * them (the confirmable, journaled override).
 */
export function ActButtons({
  sheet,
  onDeclare,
}: {
  sheet: ProductionCaseSheet;
  onDeclare: (act: ProductionEventType) => void;
}) {
  const { t } = useT();
  const { user } = useAuth();
  const none = nothingReleased(sheet.release);
  const blocked = isTechnicianRole(user?.role) && none;
  const partial = sheet.release.state === 'partial';
  const arches = ARCHES.filter((arch) => sheet.planned[arch] !== null);
  const shownArches = arches.length ? arches : ARCHES;
  const nextLocked = sheet.release.next;
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
            disabled={!sheet.canDeclare || blocked}
            aria-describedby={blocked ? 'release-blocked-hint' : undefined}
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
                const workable = workableStepCount(sheet.release, arch);
                const total = plannedTotalLabel(planned);
                return (
                  <span key={arch} className="flex flex-col gap-1">
                    <span className="inline-flex items-baseline gap-1">
                      {shownArches.length > 1 && (
                        <span className="w-8 shrink-0 text-xs text-muted-foreground">
                          {t(`production.archesShort.${arch}`)}
                        </span>
                      )}
                      <span className="text-2xl font-semibold tabular-nums">
                        {planned ? archCounterText(done, planned, workable) : done}
                      </span>
                      {planned && workable !== null && total && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {t('production.release.ofPlanned', { total })}
                        </span>
                      )}
                    </span>
                    {planned && <ActProgressBar done={done} planned={planned} workable={workable} />}
                  </span>
                );
              })}
            </span>
            <span className="mt-auto text-xs text-muted-foreground">
              {none ? (
                <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-200">
                  <Lock className="size-3.5" aria-hidden="true" />
                  {t('production.release.none')}
                </span>
              ) : allCovered && partial ? (
                <span className="flex flex-col gap-0.5">
                  <span>{t('production.sheet.unlockedDone')}</span>
                  {nextLocked && (
                    <span className="inline-flex items-center gap-1 text-amber-800 tabular-nums dark:text-amber-200">
                      <Lock className="size-3.5" aria-hidden="true" />
                      {t('production.sheet.lockedNext', { span: spanLabel(nextLocked) })}
                    </span>
                  )}
                </span>
              ) : allCovered ? (
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
      {blocked && (
        <p id="release-blocked-hint" className="sr-only">
          {t('production.sheet.nothingUnlocked')}
        </p>
      )}
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
