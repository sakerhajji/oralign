'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useT } from '@/lib/i18n/lang-context';
import type { ProductionEventType } from '@/lib/types/production';
import { formatCalendarDay } from '@/lib/utils/business-day';
import { ACTS, formatCount, longDay, type RecapDay } from './format';
import { Panel } from './parts';

/**
 * One act per day as columns (one series at a time, switched by the
 * segmented control above it, never four overlaid): the rhythm of the
 * month at a glance. The day-by-day table under it carries the same
 * figures for reading and for screen readers; the chart's summary
 * sentence names the total and the busiest day.
 */
export function DailyChart({ days, busy }: { days: RecapDay[]; busy: boolean }) {
  const { t, lang } = useT();
  // Thermoforming drives the plates used: the month's main production figure.
  const [act, setAct] = useState<ProductionEventType>('aligner_thermoformed');

  const data = useMemo(
    () => days.map((entry) => ({ day: entry.day, value: entry.acts[act].quantity })),
    [days, act],
  );
  const config = useMemo<ChartConfig>(
    () => ({ value: { label: t(`production.acts.${act}`), color: 'var(--primary)' } }),
    [act, t],
  );

  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  const peak = data.reduce<{ day: string; value: number } | null>(
    (best, entry) => (best === null || entry.value > best.value ? entry : best),
    null,
  );
  const first = data[0]?.day;
  const last = data[data.length - 1]?.day;
  const summary =
    !first || !last || total === 0 || !peak
      ? t('productionAdmin.recap.chartEmpty', { act: t(`production.acts.${act}`) })
      : t('productionAdmin.recap.chartSummary', {
          act: t(`production.acts.${act}`),
          from: formatCalendarDay(first, lang, 'full'),
          to: formatCalendarDay(last, lang, 'full'),
          total: formatCount(total, lang),
          max: formatCount(peak.value, lang),
          maxDay: formatCalendarDay(peak.day, lang, 'dayMonth'),
        });

  return (
    <Panel
      title={t('productionAdmin.recap.chartTitle')}
      busy={busy}
      action={
        <div className="no-scrollbar -my-1 max-w-full overflow-x-auto py-1">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={1}
            value={act}
            onValueChange={(value) => {
              if (value) setAct(value as ProductionEventType);
            }}
            aria-label={t('productionAdmin.recap.chartActAria')}
            className="w-max"
          >
            {ACTS.map((key) => (
              <ToggleGroupItem
                key={key}
                value={key}
                className="h-11 px-2.5 text-xs sm:h-7 data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
              >
                {t(`production.actsShort.${key}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      }
    >
      <figure className="px-2 pt-4 pb-2 sm:px-4">
        <figcaption className="sr-only">{summary}</figcaption>
        <ChartContainer config={config} className="aspect-auto h-[200px] w-full" aria-hidden="true">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={16}
              tickFormatter={(day: string) => formatCalendarDay(day, lang, 'day')}
            />
            <YAxis
              width={32}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tickCount={5}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(_label, payload) => {
                    const day = payload?.[0]?.payload?.day as string | undefined;
                    return day ? longDay(day, lang) : '';
                  }}
                />
              }
            />
            <Bar dataKey="value" fill="var(--color-value)" radius={[3, 3, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ChartContainer>
      </figure>
    </Panel>
  );
}
