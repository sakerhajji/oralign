'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import type { DashboardRange } from '@/lib/types';

type Preset = 'today' | '7d' | '30d' | '90d' | 'month' | 'year' | 'custom';

// Labels resolve through t() at render time (labelKey pattern) so the
// list reacts to language switches without re-creating the constant.
const PRESETS: { value: Preset; labelKey: string }[] = [
  { value: 'today', labelKey: 'widgets.rangePicker.presetToday' },
  { value: '7d', labelKey: 'widgets.rangePicker.preset7d' },
  { value: '30d', labelKey: 'widgets.rangePicker.preset30d' },
  { value: '90d', labelKey: 'widgets.rangePicker.preset90d' },
  { value: 'month', labelKey: 'widgets.rangePicker.presetMonth' },
  { value: 'year', labelKey: 'widgets.rangePicker.presetYear' },
  { value: 'custom', labelKey: 'widgets.rangePicker.presetCustom' },
];

function computeRangeFromPreset(preset: Preset): DashboardRange {
  const now = new Date();
  const to = new Date(now);
  if (preset === 'today') {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (preset === '7d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (preset === '30d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (preset === '90d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 90);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (preset === 'month') {
    const from = new Date(now);
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (preset === 'year') {
    const from = new Date(now.getFullYear(), 0, 1);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  return {};
}

function dateToInput(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Compact date-range picker — preset select + two native date inputs
 * for custom mode. No new deps; sufficient for a dashboard filter
 * where the user just needs to bracket "last 30 days" vs "Q1 2026".
 *
 * Emits an ISO-string `{ from, to }` on change so the API hooks can
 * key + cache on a stable string identity.
 */
export function DashboardRangePicker({
  value,
  onChange,
  defaultPreset = '30d',
}: {
  value: DashboardRange;
  onChange: (next: DashboardRange) => void;
  defaultPreset?: Preset;
}) {
  const { t } = useT();
  const [preset, setPreset] = useState<Preset>(defaultPreset);

  const inputFrom = useMemo(() => dateToInput(value.from), [value.from]);
  const inputTo = useMemo(() => dateToInput(value.to), [value.to]);

  const onPresetChange = (next: Preset) => {
    setPreset(next);
    if (next === 'custom') return; // wait for the user to type dates
    onChange(computeRangeFromPreset(next));
  };

  const onFromChange = (raw: string) => {
    if (!raw) {
      onChange({ ...value, from: undefined });
      return;
    }
    onChange({ ...value, from: new Date(raw).toISOString() });
  };

  const onToChange = (raw: string) => {
    if (!raw) {
      onChange({ ...value, to: undefined });
      return;
    }
    // Push to end-of-day so the upper bound is inclusive.
    const d = new Date(raw);
    d.setHours(23, 59, 59, 999);
    onChange({ ...value, to: d.toISOString() });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CalendarIcon className="size-4" />
        <span className="hidden sm:inline">{t('widgets.rangePicker.range')}</span>
      </div>
      <Select value={preset} onValueChange={(v) => onPresetChange(v as Preset)}>
        <SelectTrigger className="h-9 w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {t(p.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {preset === 'custom' ? (
        <>
          <Input
            type="date"
            className="h-9 w-[150px]"
            value={inputFrom}
            onChange={(e) => onFromChange(e.target.value)}
            aria-label={t('widgets.rangePicker.fromDate')}
          />
          <span className="text-muted-foreground">→</span>
          <Input
            type="date"
            className="h-9 w-[150px]"
            value={inputTo}
            onChange={(e) => onToChange(e.target.value)}
            aria-label={t('widgets.rangePicker.toDate')}
          />
        </>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-9 text-xs text-muted-foreground hover:text-foreground',
          !value.from && !value.to && 'hidden',
        )}
        onClick={() => {
          setPreset('30d');
          onChange(computeRangeFromPreset('30d'));
        }}
      >
        {t('widgets.rangePicker.reset')}
      </Button>
    </div>
  );
}
