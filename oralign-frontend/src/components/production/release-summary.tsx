'use client';

import { CircleCheck, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n/lang-context';
import type { ProductionReleaseSummary } from '@/lib/types/production';
import { cn } from '@/lib/utils';
import type { Translate } from './production-format';
import {
  everythingReleased,
  nothingReleased,
  releaseLines,
  spanLabel,
  type ReleaseLine,
  type StepSpan,
} from './release-format';

/**
 * Which steps the lab may work on (spec §3), read first on every case:
 * « Plan 1→7 · Débloquées 1→4 · Prochaine tranche 5→7 », or « Aucune
 * tranche débloquée ». One line when both arches read the same, one per
 * arch otherwise. Payment-free wording: a locked tranche is « pas encore
 * débloquée », never why in money terms.
 *
 *   • inline: the queue's table cell and phone card (small, wraps);
 *   • block: the case sheet header (one row per line, larger).
 */
export function ReleaseSummary({
  release,
  variant = 'inline',
  className,
}: {
  release: ProductionReleaseSummary;
  variant?: 'inline' | 'block';
  className?: string;
}) {
  const { t } = useT();
  const lines = releaseLines(release);
  const multi = lines.length > 1;
  const block = variant === 'block';

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col',
        block ? 'gap-1.5 text-sm' : 'gap-0.5 text-xs',
        className,
      )}
    >
      <p className="sr-only">{t('production.release.aria', { summary: releaseSentence(t, release) })}</p>
      <div aria-hidden="true" className={cn('flex min-w-0 flex-col', block ? 'gap-1' : 'gap-0.5')}>
        {lines.map((line) => (
          <LineView key={line.arches.join('-')} line={line} release={release} multi={multi} block={block} />
        ))}
        {release.next && (
          <span
            className={cn(
              'inline-flex w-fit max-w-full items-center gap-1 rounded-full font-medium text-amber-800 ring-1 ring-amber-200 dark:text-amber-200 dark:ring-amber-900',
              block ? 'bg-amber-50 px-2.5 py-0.5 dark:bg-amber-950/40' : 'bg-amber-50/70 px-2 py-px dark:bg-amber-950/30',
            )}
            title={t('production.release.nextHint')}
          >
            <Lock className={cn('shrink-0', block ? 'size-3.5' : 'size-3')} aria-hidden="true" />
            <span className="truncate tabular-nums">
              {t('production.release.next', { span: spanLabel(release.next) })}
            </span>
          </span>
        )}
      </div>
      {block && release.next && (
        <p className="text-xs text-muted-foreground">{t('production.release.nextHint')}</p>
      )}
    </div>
  );
}

function LineView({
  line,
  release,
  multi,
  block,
}: {
  line: ReleaseLine;
  release: ProductionReleaseSummary;
  multi: boolean;
  block: boolean;
}) {
  const { t } = useT();
  const none = nothingReleased(release);
  const everything = everythingReleased(release);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {multi && (
        <span className="w-8 shrink-0 text-muted-foreground">
          {t(`production.archesShort.${line.arches[0]}`)}
        </span>
      )}
      <span className={cn('tabular-nums', block ? 'font-medium' : 'text-muted-foreground')}>
        {line.total ? t('production.release.plan', { span: spanLabel(line.total) }) : t('production.release.planUnknown')}
      </span>
      {line.provisional && line.total && (
        <Badge
          variant="outline"
          className="h-4 px-1.5 text-[10px] text-muted-foreground"
          title={t('production.planned.provisionalHint')}
        >
          {t('production.planned.provisional')}
        </Badge>
      )}
      <span className="text-muted-foreground" aria-hidden="true">
        ·
      </span>
      {none ? (
        <span className="inline-flex items-center gap-1 font-medium text-amber-800 dark:text-amber-200">
          <Lock className="size-3 shrink-0" aria-hidden="true" />
          {t('production.release.none')}
        </span>
      ) : everything ? (
        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
          <CircleCheck className="size-3 shrink-0" aria-hidden="true" />
          {t(release.state === 'unscheduled' ? 'production.release.unscheduled' : 'production.release.all')}
        </span>
      ) : (
        <span className="font-medium tabular-nums text-foreground">
          {t('production.release.unlocked', { spans: line.unlocked.map(spanLabel).join(', ') || '—' })}
        </span>
      )}
    </span>
  );
}

function spanWords(t: Translate, span: StepSpan): string {
  return span.from === span.to ? String(span.from) : t('production.release.spanWords', { from: span.from, to: span.to });
}

/** The whole summary as one sentence, for screen readers. */
export function releaseSentence(t: Translate, release: ProductionReleaseSummary): string {
  const lines = releaseLines(release);
  const parts = lines.map((line) => {
    const head = lines.length > 1 ? `${t(`production.arches.${line.arches[0]}`)} — ` : '';
    const plan = line.total
      ? t('production.release.plan', { span: spanWords(t, line.total) })
      : t('production.release.planUnknown');
    const provisional = line.provisional && line.total ? ` (${t('production.planned.provisional')})` : '';
    const state = nothingReleased(release)
      ? t('production.release.none')
      : everythingReleased(release)
        ? t(release.state === 'unscheduled' ? 'production.release.unscheduled' : 'production.release.all')
        : t('production.release.unlocked', {
            spans: line.unlocked.map((span) => spanWords(t, span)).join(', '),
          });
    return `${head}${plan}${provisional}, ${state}`;
  });
  if (release.next) {
    parts.push(
      `${t('production.release.next', { span: spanWords(t, release.next) })} (${t('production.release.nextHint')})`,
    );
  }
  return parts.join('. ');
}
