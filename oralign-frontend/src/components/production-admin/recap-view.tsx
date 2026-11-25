'use client';

import { useProductionSummary } from '@/lib/hooks/use-production-admin';
import { useT } from '@/lib/i18n/lang-context';
import type { ProductionPeriodParams, ProductionSummary } from '@/lib/types/production';
import { formatCalendarDay } from '@/lib/utils/business-day';
import { ActsTable } from './acts-table';
import { DailyChart } from './daily-chart';
import { ExportCsvMenu } from './export-csv';
import { recapDays, totalQuantity } from './format';
import {
  ActFigures,
  ActFiguresSkeleton,
  AuthorLabel,
  BlockError,
  BlockMessage,
  CaseCell,
  Panel,
  PanelSkeleton,
} from './parts';
import { PeriodPicker } from './period-picker';
import type { RecapPeriod } from './pilotage-state';

/**
 * "Récap mensuel": a period (a month by default). Its totals and the
 * plates and models used, the rhythm per day (chart + day-by-day table
 * with the cancelled entries counted apart), who made what, which cases,
 * and the two CSV exports for accounting and stock.
 */
export function RecapView({
  period,
  range,
  today,
  onPeriodChange,
}: {
  period: RecapPeriod;
  range: ProductionPeriodParams;
  today: string;
  onPeriodChange: (period: RecapPeriod) => void;
}) {
  const { t, lang } = useT();
  const live = range.from <= today && today <= range.to;
  const summary = useProductionSummary(range, { live });
  const data = summary.data;
  const rangeLabel =
    range.from === range.to
      ? formatCalendarDay(range.from, lang, 'full')
      : `${formatCalendarDay(range.from, lang, 'full')} – ${formatCalendarDay(range.to, lang, 'full')}`;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Stacked on a phone, so the presets' sideways scroller never runs under the export. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <PeriodPicker period={period} range={range} today={today} onChange={onPeriodChange} />
        </div>
        <ExportCsvMenu period={range} rangeLabel={rangeLabel} />
      </div>

      {data ? (
        <RecapBody summary={data} today={today} busy={summary.isPlaceholderData} />
      ) : summary.isError ? (
        <BlockError
          title={t('productionAdmin.recap.loadFailed')}
          error={summary.error}
          onRetry={() => void summary.refetch()}
          retrying={summary.isFetching}
        />
      ) : (
        <RecapSkeleton />
      )}
      {data && summary.isError && !summary.isFetching ? (
        <BlockError
          title={t('productionAdmin.recap.loadFailed')}
          error={summary.error}
          onRetry={() => void summary.refetch()}
        />
      ) : null}
    </div>
  );
}

function RecapBody({
  summary,
  today,
  busy,
}: {
  summary: ProductionSummary;
  today: string;
  busy: boolean;
}) {
  const { t, lang } = useT();
  const days = recapDays(summary, today);
  const cancelledTotal = days.reduce((sum, entry) => sum + entry.cancelled, 0);
  const nothing = summary.byDay.length === 0 && summary.cancelled.length === 0;

  if (nothing) {
    return (
      <>
        <ActFigures totals={summary.totals} consumption={summary.consumption} busy={busy} />
        <BlockMessage
          title={t('productionAdmin.recap.emptyTitle')}
          detail={t('productionAdmin.recap.emptyBody', {
            from: formatCalendarDay(summary.from, lang, 'full'),
            to: formatCalendarDay(summary.to, lang, 'full'),
          })}
        />
      </>
    );
  }

  return (
    <>
      <ActFigures totals={summary.totals} consumption={summary.consumption} busy={busy} />

      {days.length > 1 ? <DailyChart days={days} busy={busy} /> : null}

      {/* Side by side only where both tables fit without scrolling. */}
      <div className="grid min-w-0 gap-4 @5xl/main:grid-cols-2 @5xl/main:items-start">
        <Panel
          title={t('productionAdmin.recap.byDay')}
          hint={t('productionAdmin.recap.byDayHint')}
          busy={busy}
          footer={summary.to > today ? t('productionAdmin.recap.futureNote') : undefined}
        >
          <ActsTable
            labelHeader={t('productionAdmin.cols.day')}
            extraHeader={t('productionAdmin.cols.cancelled')}
            extraHeaderTiny={t('productionAdmin.cols.cancelledTiny')}
            rows={days.map((entry) => ({
              key: entry.day,
              label: (
                <time dateTime={entry.day} className="tabular-nums">
                  {formatCalendarDay(entry.day, lang, 'weekday')}
                </time>
              ),
              acts: entry.acts,
              extra: entry.cancelled,
              muted: totalQuantity(entry.acts) === 0 && entry.cancelled === 0,
            }))}
            totals={summary.totals}
            extraTotal={cancelledTotal}
          />
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title={t('productionAdmin.recap.byAuthor')} busy={busy}>
            <ActsTable
              labelHeader={t('productionAdmin.cols.author')}
              rows={summary.byAuthor.map((entry) => ({
                key: entry.userId ?? `deleted:${entry.name ?? ''}`,
                label: <AuthorLabel name={entry.name} role={entry.role} stacked />,
                acts: entry.acts,
              }))}
            />
          </Panel>
          <Panel
            title={t('productionAdmin.recap.byCase')}
            hint={t('productionAdmin.recap.byCaseHint')}
            busy={busy}
          >
            <ActsTable
              labelHeader={t('productionAdmin.cols.case')}
              rows={summary.byCase.map((entry) => ({
                key: entry.orderId,
                label: <CaseCell order={entry} />,
                acts: entry.acts,
              }))}
              cap={8}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}

function RecapSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <ActFiguresSkeleton />
      <PanelSkeleton rows={4} />
      <div className="grid gap-4 @5xl/main:grid-cols-2">
        <PanelSkeleton rows={6} />
        <PanelSkeleton rows={3} />
      </div>
    </div>
  );
}
