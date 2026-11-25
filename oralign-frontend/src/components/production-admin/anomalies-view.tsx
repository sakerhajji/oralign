'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, BellRing, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useProductionAnomalies } from '@/lib/hooks/use-production-admin';
import { useT } from '@/lib/i18n/lang-context';
import type { Lang } from '@/lib/i18n/dict';
import {
  PRODUCTION_ANOMALY_KINDS,
  PRODUCTION_EVENT_TYPES,
  type ProductionAnomalies,
  type ProductionAnomaly,
  type ProductionAnomalyKind,
  type ProductionEventType,
  type ProductionNoticeStatus,
  type ProductionPeriodParams,
} from '@/lib/types/production';
import { cn } from '@/lib/utils';
import {
  formatBusinessDay,
  formatBusinessDayShort,
  formatBusinessTime,
  formatCalendarDay,
} from '@/lib/utils/business-day';
import { formatCount, stepListText } from './format';
import {
  BlockError,
  BlockMessage,
  caseSheetHref,
  orderHref,
  Panel,
  PanelSkeleton,
  WarningTags,
} from './parts';
import { PeriodPicker } from './period-picker';
import type { AnomalyFilter, RecapPeriod } from './pilotage-state';

/** The notices list a notice anomaly leads to. */
const NOTICE_STATUS_OF: Partial<Record<ProductionAnomalyKind, ProductionNoticeStatus>> = {
  notice_failed: 'failed',
  notice_skipped: 'skipped',
};

/** Kinds whose fix is in the quotation or the order, not on the production sheet. */
const ORDER_FIRST: ReadonlySet<ProductionAnomalyKind> = new Set([
  'unreleased_delivery',
  'coverage_started_by_cancelled_delivery',
  'batch_kept_after_cancel',
  'finished_incomplete',
]);

/**
 * "Écarts": what needs a look over the period, computed by the server at
 * read time. One chip per kind found (with its count) filters the list;
 * each kind is a block that says in plain words what it means and what to
 * check, then its findings, newest first, each with its case.
 */
export function AnomaliesView({
  period,
  range,
  today,
  kind,
  onPeriodChange,
  onKindChange,
  onShowNotices,
}: {
  period: RecapPeriod;
  range: ProductionPeriodParams;
  today: string;
  kind: AnomalyFilter;
  onPeriodChange: (period: RecapPeriod) => void;
  onKindChange: (kind: AnomalyFilter) => void;
  onShowNotices: (status: ProductionNoticeStatus) => void;
}) {
  const { t } = useT();
  const live = range.from <= today && today <= range.to;
  const query = useProductionAnomalies(range, { live });
  const data = query.data;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PeriodPicker period={period} range={range} today={today} onChange={onPeriodChange} />

      {data ? (
        <AnomaliesBody
          data={data}
          today={today}
          kind={kind}
          busy={query.isPlaceholderData}
          onKindChange={onKindChange}
          onShowNotices={onShowNotices}
        />
      ) : query.isError ? (
        <BlockError
          title={t('productionAdmin.anomalies.loadFailed')}
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <div className="flex flex-col gap-4" aria-busy="true">
          <PanelSkeleton rows={3} />
          <PanelSkeleton rows={2} />
        </div>
      )}
      {data && query.isError && !query.isFetching ? (
        <BlockError
          title={t('productionAdmin.anomalies.loadFailed')}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
    </div>
  );
}

function AnomaliesBody({
  data,
  today,
  kind,
  busy,
  onKindChange,
  onShowNotices,
}: {
  data: ProductionAnomalies;
  today: string;
  kind: AnomalyFilter;
  busy: boolean;
  onKindChange: (kind: AnomalyFilter) => void;
  onShowNotices: (status: ProductionNoticeStatus) => void;
}) {
  const { t, lang } = useT();
  const total = data.items.length;
  // Kinds with findings, plus the one a link asked for (so its chip shows "0").
  const chips = PRODUCTION_ANOMALY_KINDS.filter(
    (key) => (data.countsByKind[key] ?? 0) > 0 || key === kind,
  );
  const groups = PRODUCTION_ANOMALY_KINDS.filter((key) => kind === 'all' || key === kind)
    .map((key) => ({ kind: key, items: data.items.filter((item) => item.kind === key) }))
    .filter((group) => group.items.length > 0);

  if (total === 0) {
    return (
      <BlockMessage
        title={t('productionAdmin.anomalies.emptyTitle')}
        detail={t('productionAdmin.anomalies.emptyBody', {
          from: formatCalendarDay(data.from, lang, 'full'),
          to: formatCalendarDay(data.to, lang, 'full'),
        })}
      />
    );
  }

  return (
    <div
      className={cn('flex min-w-0 flex-col gap-4 transition-opacity duration-150', busy && 'opacity-60')}
      aria-busy={busy || undefined}
    >
      {/* The padding keeps the focus rings inside the phone scroller. */}
      <div className="no-scrollbar -mx-4 -my-1 overflow-x-auto px-4 py-1 lg:mx-0 lg:px-0">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={1}
          value={kind}
          onValueChange={(value) => {
            if (value) onKindChange(value as AnomalyFilter);
          }}
          aria-label={t('productionAdmin.anomalies.filterAria')}
          className="w-max flex-wrap lg:w-auto"
        >
          {(['all', ...chips] as const).map((key) => (
            <ToggleGroupItem
              key={key}
              value={key}
              className="h-11 gap-1.5 px-3 text-[13px] sm:h-8 data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
            >
              {key === 'all'
                ? t('productionAdmin.anomalies.all')
                : t(`productionAdmin.anomalies.kinds.${key}.title`)}
              <span className="tabular-nums opacity-70">
                {formatCount(key === 'all' ? total : (data.countsByKind[key] ?? 0), lang)}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {groups.length === 0 ? (
        <BlockMessage title={t('productionAdmin.anomalies.kindEmpty')} />
      ) : (
        groups.map((group) => (
          // A new period starts each block back at its first rows.
          <AnomalyGroup
            key={`${data.from}:${data.to}:${group.kind}`}
            kind={group.kind}
            items={group.items}
            today={today}
            onShowNotices={onShowNotices}
          />
        ))
      )}
    </div>
  );
}

/** Rows a block shows at first, and how many more each "Afficher plus" adds. */
const GROUP_STEP = 50;

/**
 * One kind's block. A long period can hold thousands of findings: the
 * newest GROUP_STEP are drawn, then "Afficher plus" adds as many again.
 * Focus stays on the button while it remains; when the last rows come in
 * and it goes away, focus moves to the first of them instead of the page.
 */
function AnomalyGroup({
  kind,
  items,
  today,
  onShowNotices,
}: {
  kind: ProductionAnomalyKind;
  items: ProductionAnomaly[];
  today: string;
  onShowNotices: (status: ProductionNoticeStatus) => void;
}) {
  const { t, lang } = useT();
  const [shown, setShown] = useState(GROUP_STEP);
  const listRef = useRef<HTMLOListElement>(null);
  const focusRow = useRef<number | null>(null);
  const visible = items.length > shown ? items.slice(0, shown) : items;
  const statusId = useId();

  useEffect(() => {
    const index = focusRow.current;
    if (index === null) return;
    focusRow.current = null;
    const row = listRef.current?.children[index];
    if (row instanceof HTMLElement) row.focus();
  }, [shown]);

  const showMore = () => {
    const next = shown + GROUP_STEP;
    if (next >= items.length) focusRow.current = shown;
    setShown(next);
  };

  return (
    <Panel
      title={t(`productionAdmin.anomalies.kinds.${kind}.title`)}
      hint={t(`productionAdmin.anomalies.kinds.${kind}.body`)}
      action={
        <span className="text-sm font-semibold tabular-nums">{formatCount(items.length, lang)}</span>
      }
      footer={
        items.length > GROUP_STEP ? (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p id={statusId} aria-live="polite" className="tabular-nums">
              {t('productionAdmin.anomalies.shownOf', {
                shown: formatCount(visible.length, lang),
                total: formatCount(items.length, lang),
              })}
            </p>
            {visible.length < items.length ? (
              <Button
                variant="outline"
                size="sm"
                className="h-11 sm:h-8"
                onClick={showMore}
                aria-describedby={statusId}
              >
                <ChevronDown aria-hidden="true" />
                {t('productionAdmin.anomalies.showMore')}
              </Button>
            ) : null}
          </div>
        ) : undefined
      }
    >
      <ol ref={listRef} className="divide-y">
        {visible.map((item) => (
          <AnomalyRow
            key={`${item.kind}:${item.orderId}:${item.arch ?? '-'}:${item.noticeId ?? item.eventIds[0] ?? item.at}`}
            item={item}
            today={today}
            onShowNotices={onShowNotices}
          />
        ))}
      </ol>
    </Panel>
  );
}

function AnomalyRow({
  item,
  today,
  onShowNotices,
}: {
  item: ProductionAnomaly;
  today: string;
  onShowNotices: (status: ProductionNoticeStatus) => void;
}) {
  const { t, lang } = useT();
  const noticeStatus = NOTICE_STATUS_OF[item.kind];
  const detail = item.detail ? detailText(item, item.detail, t, lang) : null;
  const facts = [
    item.arch ? t(`production.arches.${item.arch}`) : null,
    item.steps && item.steps.length > 0 ? stepListText(item.steps, t) : null,
  ].filter((fact): fact is string => fact !== null);
  const sheetFirst = !ORDER_FIRST.has(item.kind);

  return (
    // tabIndex -1: "Afficher plus" may move focus here (see AnomalyGroup).
    <li
      tabIndex={-1}
      className="flex flex-col gap-2 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:flex-row sm:items-start sm:justify-between sm:gap-4"
    >
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium tabular-nums">{item.orderCode}</span>
          <span className="min-w-0 truncate">{item.patientName}</span>
          {facts.length > 0 ? (
            <span className="text-muted-foreground tabular-nums">· {facts.join(' · ')}</span>
          ) : null}
        </p>
        <WarningTags warnings={item.warnings} />
        {detail ? <p className="text-xs break-words text-muted-foreground">{detail}</p> : null}
        <p className="text-xs text-muted-foreground tabular-nums">
          <time dateTime={item.at}>
            {formatBusinessDayShort(item.at, lang, today)} · {formatBusinessTime(item.at, lang)}
          </time>
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
        {noticeStatus ? (
          <Button
            variant="outline"
            size="sm"
            className="h-11 sm:h-8"
            onClick={() => onShowNotices(noticeStatus)}
          >
            <BellRing aria-hidden="true" />
            {t('productionAdmin.anomalies.seeNotices')}
          </Button>
        ) : null}
        <Button
          asChild
          variant={sheetFirst ? 'outline' : 'ghost'}
          size="sm"
          className="h-11 sm:h-8"
        >
          <Link
            href={caseSheetHref(item.orderId)}
            aria-label={t('productionAdmin.rows.openSheet', { code: item.orderCode })}
          >
            {t('productionAdmin.anomalies.openSheet')}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <Button
          asChild
          variant={sheetFirst ? 'ghost' : 'outline'}
          size="sm"
          className="h-11 sm:h-8"
        >
          <Link href={orderHref(item.orderId)}>
            {t('productionAdmin.anomalies.openOrder')}
          </Link>
        </Button>
      </div>
    </li>
  );
}

type Translate = (path: string, vars?: Record<string, string | number>) => string;

/** The act a later act needs first (mirrors the backend's PREVIOUS_ACT). */
const PREVIOUS_ACT: Partial<Record<ProductionEventType, ProductionEventType>> = {
  aligner_thermoformed: 'model_printed',
  aligner_cut: 'aligner_thermoformed',
  aligner_delivered: 'aligner_cut',
};

const isAct = (value: string): value is ProductionEventType =>
  (PRODUCTION_EVENT_TYPES as readonly string[]).includes(value);

/**
 * `detail` in words. Its meaning depends on the kind (BE-REPORTS
 * production-anomalies.rules.ts): the act of the rows for the event kinds
 * (the LATER act for stage_skipped), the skip reason or the provider's
 * error for the notices, the coverage start instant, a batch's "from-to".
 * Anything unknown is shown as the server wrote it.
 */
function detailText(item: ProductionAnomaly, detail: string, t: Translate, lang: Lang): string {
  switch (item.kind) {
    case 'stage_skipped': {
      const previous = isAct(detail) ? PREVIOUS_ACT[detail] : undefined;
      if (!isAct(detail) || !previous) return detail;
      return t('productionAdmin.anomalies.detail.stageSkipped', {
        act: t(`production.acts.${detail}`),
        previous: t(`production.acts.${previous}`),
      });
    }
    case 'duplicate_declaration':
    case 'unreleased_delivery':
    case 'confirmed_warning':
    case 'cancelled_event':
      return isAct(detail)
        ? t('productionAdmin.anomalies.detail.act', { act: t(`production.acts.${detail}`) })
        : detail;
    case 'coverage_started_by_cancelled_delivery': {
      if (Number.isNaN(Date.parse(detail))) return detail;
      return t('productionAdmin.anomalies.detail.coverageStarted', {
        date: formatBusinessDay(detail, lang),
        time: formatBusinessTime(detail, lang),
      });
    }
    case 'batch_kept_after_cancel': {
      const match = /^(\d+)-(\d+)$/.exec(detail);
      return match
        ? t('productionAdmin.anomalies.detail.batch', { from: match[1], to: match[2] })
        : detail;
    }
    default: {
      const key = `productionAdmin.notices.skipReasons.${detail}`;
      const text = t(key);
      return text === key ? detail : text;
    }
  }
}
