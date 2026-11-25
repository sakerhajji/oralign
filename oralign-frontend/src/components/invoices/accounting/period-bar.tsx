'use client';

import { useId, useState } from 'react';
import { CalendarDaysIcon, CalendarRangeIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useT } from '@/lib/i18n/lang-context';
import { monthStart } from '@/lib/utils/business-day';
import {
  EARLIEST_DAY,
  PERIOD_PRESETS,
  customRangeError,
  rangeSentence,
  type DayRange,
  type InvoicePeriod,
  type PeriodPreset,
} from './period';

/**
 * The period of the whole invoices page: the récapitulatif, the list and
 * every export read it. Presets as a segmented control (a Select on
 * phones), "Personnalisé" opens Du / Au, and the resolved days are always
 * spelled out underneath, so nobody wonders what "Ce trimestre" covers.
 */
export function PeriodBar({
  period,
  range,
  today,
  onChange,
}: {
  period: InvoicePeriod;
  /** The days `period` resolves to. */
  range: DayRange;
  /** Today's Tunis day. */
  today: string;
  onChange: (period: InvoicePeriod) => void;
}) {
  const { t, lang } = useT();

  const pick = (value: string) => {
    // A second click on the active segment leaves it on.
    if (!value) return;
    const key = value as PeriodPreset;
    if (key === 'custom') {
      if (period.key === 'custom') return;
      // Start from the days on screen, so the fields are never empty.
      onChange({
        key: 'custom',
        from: range.from ?? monthStart(today),
        to: range.to ?? today,
      });
      return;
    }
    onChange({ key, from: '', to: '' });
  };

  return (
    <section
      aria-label={t('invoiceDesk.accounting.period.aria')}
      className="flex flex-col gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        {/* Phones: one Select, 44 px tall. */}
        <Select value={period.key} onValueChange={pick}>
          <SelectTrigger
            className="w-full data-[size=default]:h-11 sm:hidden"
            aria-label={t('invoiceDesk.accounting.period.label')}
          >
            {/* Spelled out: Radix only learns an item's text once the list mounts. */}
            <SelectValue>{t(`invoiceDesk.accounting.period.${period.key}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PERIOD_PRESETS.map((key) => (
              <SelectItem key={key} value={key} className="min-h-11">
                {t(`invoiceDesk.accounting.period.${key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ToggleGroup
          type="single"
          variant="outline"
          spacing={1}
          value={period.key}
          onValueChange={pick}
          aria-label={t('invoiceDesk.accounting.period.label')}
          className="hidden flex-wrap sm:flex"
        >
          {PERIOD_PRESETS.map((key) => (
            <ToggleGroupItem
              key={key}
              value={key}
              className="h-9 px-3 text-[13px] data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
            >
              {key === 'custom' ? <CalendarRangeIcon aria-hidden="true" /> : null}
              {t(`invoiceDesk.accounting.period.${key}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {period.key === 'custom' ? (
          <CustomRange
            // Not keyed on the days: a valid range applies while typing,
            // and a remount would steal the focus from the field.
            from={period.from}
            to={period.to}
            onApply={(from, to) => onChange({ key: 'custom', from, to })}
          />
        ) : null}
      </div>

      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CalendarDaysIcon className="size-4 shrink-0" aria-hidden="true" />
        <span aria-live="polite">{rangeSentence(range, lang, t)}</span>
      </p>
    </section>
  );
}

const ERROR_KEYS = {
  invalid: 'invoiceDesk.accounting.period.errInvalid',
  tooEarly: 'invoiceDesk.accounting.period.errTooEarly',
  endBeforeStart: 'invoiceDesk.accounting.period.errOrder',
} as const;

/**
 * Du / Au, both days included. A complete, valid range applies at once
 * (no "Appliquer" step: an accountant types two dates and reads); a range
 * running backwards says so and keeps the last good one in use.
 */
function CustomRange({
  from: appliedFrom,
  to: appliedTo,
  onApply,
}: {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
}) {
  const { t } = useT();
  const messageId = useId();
  const [from, setFrom] = useState(appliedFrom);
  const [to, setTo] = useState(appliedTo);
  // A year being typed passes through 0002, 0020, 0202: those are only
  // called out once the field is left. A range running backwards is said at once.
  const [left, setLeft] = useState(false);
  const error = customRangeError(from, to);
  const shown =
    error === 'endBeforeStart' || (left && error !== null && error !== 'missing') ? error : null;

  const change = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    if (customRangeError(nextFrom, nextTo) === null) onApply(nextFrom, nextTo);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
        <DayField
          label={t('invoicesAdmin.from')}
          value={from}
          min={EARLIEST_DAY}
          max={to || undefined}
          invalid={shown !== null}
          describedBy={shown ? messageId : undefined}
          onChange={(value) => change(value, to)}
          onBlur={() => setLeft(true)}
        />
        <DayField
          label={t('invoicesAdmin.to')}
          value={to}
          min={from || EARLIEST_DAY}
          invalid={shown !== null}
          describedBy={shown ? messageId : undefined}
          onChange={(value) => change(from, value)}
          onBlur={() => setLeft(true)}
        />
      </div>
      {shown ? (
        <p id={messageId} role="alert" className="text-xs font-medium text-destructive">
          {t(ERROR_KEYS[shown])}
        </p>
      ) : null}
    </div>
  );
}

function DayField({
  label,
  value,
  min,
  max,
  invalid,
  describedBy,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  invalid: boolean;
  describedBy?: string;
  onChange: (day: string) => void;
  onBlur: () => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
      <span className="shrink-0">{label}</span>
      <Input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onClick={(event) => {
          try {
            event.currentTarget.showPicker();
          } catch {
            // Not every browser opens the picker on demand: typing works.
          }
        }}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="h-11 w-full min-w-0 text-sm text-foreground sm:h-9 sm:w-40"
      />
    </label>
  );
}
