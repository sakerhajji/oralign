'use client';

import { useState } from 'react';
import { CalendarDays, CalendarRange } from 'lucide-react';
import { DayRangeForm } from '@/components/shared/day-range-form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useT } from '@/lib/i18n/lang-context';
import type { ProductionPeriodParams } from '@/lib/types/production';
import { cn } from '@/lib/utils';
import { formatCalendarDay } from '@/lib/utils/business-day';
import { monthLabel } from './format';
import {
  DEFAULT_PERIOD,
  daySpan,
  olderMonths,
  periodError,
  type RecapPeriod,
} from './pilotage-state';

const PRESETS = ['thisMonth', 'lastMonth', 'custom'] as const;

const SEGMENT =
  'h-11 px-3 text-[13px] sm:h-8 data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background';

/**
 * The period of the recap and of the discrepancies (one period for both,
 * so the month's figures and its anomalies always match): this month,
 * last month, any of the twelve before from a list, or a custom Du / Au
 * of at most 366 days. The resolved days are always spelled out.
 */
export function PeriodPicker({
  period,
  range,
  today,
  onChange,
}: {
  period: RecapPeriod;
  /** The days `period` resolves to. */
  range: ProductionPeriodParams;
  today: string;
  onChange: (period: RecapPeriod) => void;
}) {
  const { t, lang } = useT();
  const [editing, setEditing] = useState(period.key === 'custom');
  const [tooLong, setTooLong] = useState(false);
  // A period set from elsewhere (a link, a reset) closes the form.
  const [seenKey, setSeenKey] = useState(period.key);
  if (seenKey !== period.key) {
    setSeenKey(period.key);
    if (period.key !== 'custom') setEditing(false);
  }

  const months = olderMonths(today);
  const toggleValue = editing ? 'custom' : period.key === 'month' ? '' : period.key;

  const pick = (value: string) => {
    // A second click on the active segment leaves it on.
    if (!value) return;
    setTooLong(false);
    if (value === 'custom') {
      setEditing(true);
      return;
    }
    setEditing(false);
    onChange({ ...DEFAULT_PERIOD, key: value as RecapPeriod['key'] });
  };

  const span = daySpan(range.from, range.to);
  const sentence =
    range.from === range.to
      ? t('productionAdmin.period.oneDay', { day: formatCalendarDay(range.from, lang, 'full') })
      : t('productionAdmin.period.span', {
          from: formatCalendarDay(range.from, lang, 'full'),
          to: formatCalendarDay(range.to, lang, 'full'),
          days: span,
        });

  return (
    <section aria-label={t('productionAdmin.period.aria')} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {/* The padding keeps the focus rings inside the phone scroller. */}
        <div className="no-scrollbar -mx-4 -my-1 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={1}
            value={toggleValue}
            onValueChange={pick}
            aria-label={t('productionAdmin.period.label')}
            className="w-max"
          >
            {PRESETS.map((key) => (
              <ToggleGroupItem key={key} value={key} className={SEGMENT}>
                {key === 'custom' ? <CalendarRange aria-hidden="true" /> : null}
                {t(`productionAdmin.period.${key}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <Select
          value={period.key === 'month' && !editing ? period.month : ''}
          onValueChange={(month) => {
            setEditing(false);
            setTooLong(false);
            onChange({ ...DEFAULT_PERIOD, key: 'month', month });
          }}
        >
          <SelectTrigger
            aria-label={t('productionAdmin.period.monthAria')}
            className={cn(
              'w-full data-[size=default]:h-11 sm:w-48 sm:data-[size=default]:h-8',
              period.key === 'month' && !editing
                ? 'border-foreground bg-foreground font-medium text-background [&_svg]:text-background'
                : 'text-muted-foreground',
            )}
          >
            <SelectValue placeholder={t('productionAdmin.period.month')}>
              {period.key === 'month' && !editing ? monthLabel(period.month, lang) : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {months.map((month) => (
              <SelectItem key={month} value={month} className="min-h-11 sm:min-h-8">
                {monthLabel(month, lang)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {editing ? (
        <div className="flex flex-col gap-1.5">
          <DayRangeForm
            // A new applied range (or a reset) starts the fields again from it.
            key={`${period.key}:${period.from}:${period.to}`}
            initial={{
              from: period.key === 'custom' ? period.from : range.from,
              to: period.key === 'custom' ? period.to : range.to > today ? today : range.to,
            }}
            applied={period.key === 'custom'}
            max={today}
            onApply={(from, to) => {
              // DayRangeForm checks the days; the span limit is the report's own.
              const tooBig = periodError(from, to) === 'tooLong';
              setTooLong(tooBig);
              if (!tooBig) onChange({ key: 'custom', month: '', from, to });
            }}
            onReset={() => {
              setEditing(false);
              setTooLong(false);
              onChange(DEFAULT_PERIOD);
            }}
          />
          {tooLong ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {t('productionAdmin.period.tooLong')}
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
        <span aria-live="polite" className="tabular-nums">
          {sentence}
        </span>
      </p>
    </section>
  );
}
