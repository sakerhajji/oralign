'use client';

import { useMemo } from 'react';
import { useProductionSummary } from '@/lib/hooks/use-production-admin';
import { useT } from '@/lib/i18n/lang-context';
import type { ProductionSummary } from '@/lib/types/production';
import { formatCalendarDay } from '@/lib/utils/business-day';
import { ActsTable } from './acts-table';
import { DayPicker } from './day-picker';
import { EventList } from './event-list';
import { ExportCsvMenu } from './export-csv';
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

/**
 * "Journal": one Tunis day. What was made (four acts and the plates and
 * models it used), by case and by person, every entry in the order it was
 * done, and apart, the entries of that day cancelled since. Today's
 * journal refreshes itself every minute.
 */
export function JournalView({
  day,
  today,
  onDayChange,
}: {
  day: string;
  today: string;
  onDayChange: (day: string) => void;
}) {
  const { t, lang } = useT();
  const period = useMemo(() => ({ from: day, to: day }), [day]);
  const summary = useProductionSummary(period, { live: day === today });
  const data = summary.data;
  // Another day's figures stay on screen, dimmed, until this day's land.
  const busy = summary.isPlaceholderData;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <DayPicker day={day} today={today} onChange={onDayChange} />
        <ExportCsvMenu period={period} rangeLabel={formatCalendarDay(day, lang, 'full')} />
      </div>

      {data ? (
        <JournalBody summary={data} busy={busy} />
      ) : summary.isError ? (
        <BlockError
          title={t('productionAdmin.journal.loadFailed')}
          error={summary.error}
          onRetry={() => void summary.refetch()}
          retrying={summary.isFetching}
        />
      ) : (
        <JournalSkeleton />
      )}
      {/* A failed refetch keeps the last figures and says so under them. */}
      {data && summary.isError && !summary.isFetching ? (
        <BlockError
          title={t('productionAdmin.journal.loadFailed')}
          error={summary.error}
          onRetry={() => void summary.refetch()}
        />
      ) : null}
    </div>
  );
}

function JournalBody({ summary, busy }: { summary: ProductionSummary; busy: boolean }) {
  const { t, lang } = useT();
  const events = summary.events ?? [];
  const nothing = events.length === 0 && summary.cancelled.length === 0;

  return (
    <>
      <ActFigures totals={summary.totals} consumption={summary.consumption} busy={busy} />

      {nothing ? (
        <BlockMessage
          title={t('productionAdmin.journal.emptyTitle')}
          detail={t('productionAdmin.journal.emptyBody', {
            day: formatCalendarDay(summary.from, lang, 'full'),
          })}
        />
      ) : (
        <>
          {events.length > 0 ? (
            <div className="grid min-w-0 gap-4 @5xl/main:grid-cols-2 @5xl/main:items-start">
              <Panel
                title={t('productionAdmin.journal.byCase')}
                hint={t('productionAdmin.journal.byCaseHint')}
                busy={busy}
              >
                <ActsTable
                  labelHeader={t('productionAdmin.cols.case')}
                  rows={summary.byCase.map((entry) => ({
                    key: entry.orderId,
                    label: <CaseCell order={entry} />,
                    acts: entry.acts,
                  }))}
                  totals={summary.byCase.length > 1 ? summary.totals : undefined}
                  cap={8}
                />
              </Panel>
              <Panel
                title={t('productionAdmin.journal.byAuthor')}
                hint={t('productionAdmin.journal.byAuthorHint')}
                busy={busy}
              >
                <ActsTable
                  labelHeader={t('productionAdmin.cols.author')}
                  rows={summary.byAuthor.map((entry) => ({
                    key: entry.userId ?? `deleted:${entry.name ?? ''}`,
                    label: <AuthorLabel name={entry.name} role={entry.role} stacked />,
                    acts: entry.acts,
                  }))}
                />
              </Panel>
            </div>
          ) : null}

          {events.length > 0 ? (
            <Panel
              title={t('productionAdmin.journal.events')}
              hint={t('productionAdmin.journal.eventsHint')}
              busy={busy}
            >
              <EventList events={events} />
            </Panel>
          ) : null}

          <Panel
            title={t('productionAdmin.journal.cancelled')}
            hint={t('productionAdmin.journal.cancelledHint')}
            busy={busy}
          >
            {summary.cancelled.length > 0 ? (
              <EventList events={summary.cancelled} cancelled />
            ) : (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                {t('productionAdmin.journal.cancelledNone')}
              </p>
            )}
          </Panel>
        </>
      )}
    </>
  );
}

function JournalSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <ActFiguresSkeleton />
      <div className="grid gap-4 @5xl/main:grid-cols-2">
        <PanelSkeleton rows={4} />
        <PanelSkeleton rows={3} />
      </div>
      <PanelSkeleton rows={5} />
    </div>
  );
}
