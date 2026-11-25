'use client';

import { useT } from '@/lib/i18n/lang-context';
import {
  PRODUCTION_EVENT_TYPES,
  type PlannedTotal,
  type ProductionArch,
  type ProductionEventType,
  type ProductionOrderSummary,
} from '@/lib/types/production';
import { cn } from '@/lib/utils';
import { ACT_COUNTER, ARCHES } from './production-format';

type ProgressItem = Pick<ProductionOrderSummary, 'planned' | 'counters'>;

/** "6/20", "6/≈20" (provisional total), "6/?" (unknown). */
export function counterText(done: number, planned: PlannedTotal): string {
  if (planned.total === null) return `${done}/?`;
  return `${done}/${planned.provisional ? '≈' : ''}${planned.total}`;
}

export function ratio(done: number, planned: PlannedTotal): number {
  if (!planned.total) return done > 0 ? 1 : 0;
  return Math.min(1, done / planned.total);
}

function toneOf(done: number, planned: PlannedTotal): string {
  if (planned.total !== null && done >= planned.total) return 'text-emerald-700 dark:text-emerald-400';
  return done > 0 ? 'text-foreground' : 'text-muted-foreground';
}

/**
 * The case sheet's progress bar for one act × arch: the true ratio, green
 * once the planned total is reached. Decorative: the counter beside it is
 * what is read.
 */
export function ActProgressBar({ done, planned }: { done: number; planned: PlannedTotal }) {
  const complete = planned.total !== null && done >= planned.total;
  return (
    <span aria-hidden="true" className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <span
        className={cn(
          'block h-full rounded-full transition-[width] duration-300',
          complete ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-primary/70',
        )}
        style={{ width: `${Math.round(ratio(done, planned) * 100)}%` }}
      />
    </span>
  );
}

/** Whether any treated arch's total is an estimate (shows the legend). */
export function hasProvisional(item: Pick<ProductionOrderSummary, 'planned'>): boolean {
  return ARCHES.some((arch) => item.planned[arch]?.provisional);
}

/** A thin bar at the true ratio; the number beside it is what is read. */
function MiniBar({ value }: { value: number }) {
  return (
    <span aria-hidden="true" className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-muted">
      <span
        className="block h-full rounded-full bg-primary/70"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </span>
  );
}

/**
 * The four acts × the two arches of one case, as a small real table
 * (screen readers read "Sup., Imp. : 6/20"). The phone card's progress.
 */
export function ActProgressTable({ item, className }: { item: ProgressItem; className?: string }) {
  const { t } = useT();
  return (
    <table className={cn('w-full table-fixed border-collapse text-sm', className)}>
      <thead>
        <tr className="text-[11px] text-muted-foreground">
          <th scope="col" className="w-11 pb-1 text-left font-normal">
            <span className="sr-only">{t('production.form.arch')}</span>
          </th>
          {PRODUCTION_EVENT_TYPES.map((act) => (
            <th key={act} scope="col" className="pb-1 text-right font-medium">
              <span aria-hidden="true">{t(`production.actsAbbr.${act}`)}</span>
              <span className="sr-only">{t(`production.acts.${act}`)}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ARCHES.map((arch) => (
          <ArchRow key={arch} item={item} arch={arch} />
        ))}
      </tbody>
    </table>
  );
}

function ArchRow({ item, arch }: { item: ProgressItem; arch: ProductionArch }) {
  const { t } = useT();
  const planned = item.planned[arch];
  return (
    <tr className="align-top">
      <th scope="row" className="py-1 text-left text-xs font-medium text-muted-foreground">
        <span aria-hidden="true">{t(`production.archesShort.${arch}`)}</span>
        <span className="sr-only">{t(`production.arches.${arch}`)}</span>
      </th>
      {planned === null ? (
        <td colSpan={4} className="py-1 text-right text-xs text-muted-foreground">
          {t('production.planned.notTreated')}
        </td>
      ) : (
        PRODUCTION_EVENT_TYPES.map((act) => {
          const done = item.counters[arch][ACT_COUNTER[act]];
          return (
            <td key={act} className="py-1 pl-2 text-right">
              <span className={cn('tabular-nums', toneOf(done, planned))}>
                {counterText(done, planned)}
              </span>
              <MiniBar value={ratio(done, planned)} />
            </td>
          );
        })
      )}
    </tr>
  );
}

/**
 * One act of one case for the desktop table: a line per arch ("Sup. 6/20",
 * "Inf. —"), right-aligned so the counters read down the column.
 */
export function ActCell({ item, act }: { item: ProgressItem; act: ProductionEventType }) {
  const { t } = useT();
  return (
    <div className="flex flex-col items-end gap-0.5">
      {ARCHES.map((arch) => {
        const planned = item.planned[arch];
        const archLabel = t(`production.arches.${arch}`);
        if (planned === null) {
          return (
            <span key={arch} className="text-xs text-muted-foreground">
              <span aria-hidden="true">
                {t(`production.archesShort.${arch}`)} —
              </span>
              <span className="sr-only">
                {t('production.progress.notTreatedAria', { arch: archLabel })}
              </span>
            </span>
          );
        }
        const done = item.counters[arch][ACT_COUNTER[act]];
        const aria =
          planned.total === null
            ? t('production.progress.cellAriaNoTotal', {
                act: t(`production.acts.${act}`),
                arch: archLabel,
                done,
              })
            : t('production.progress.cellAria', {
                act: t(`production.acts.${act}`),
                arch: archLabel,
                done,
                total: planned.total,
              });
        return (
          <span key={arch} className="text-xs whitespace-nowrap">
            <span aria-hidden="true">
              <span className="text-muted-foreground">{t(`production.archesShort.${arch}`)} </span>
              <span className={cn('text-sm tabular-nums', toneOf(done, planned))}>
                {counterText(done, planned)}
              </span>
            </span>
            <span className="sr-only">{aria}</span>
          </span>
        );
      })}
    </div>
  );
}

/** "≈ total provisoire", under a progress that shows an estimate. */
export function ProvisionalLegend({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <p className={cn('text-[11px] text-muted-foreground', className)} title={t('production.planned.provisionalHint')}>
      ≈ {t('production.planned.provisional')}
    </p>
  );
}
