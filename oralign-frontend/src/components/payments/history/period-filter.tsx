'use client';

import { useId, useState, type FormEvent } from 'react';
import { CalendarDays, CalendarRange, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';
import {
  DEFAULT_PERIOD,
  EARLIEST_DAY,
  PERIOD_VALUES,
  customRangeError,
  type CustomRangeError,
  type DayRange,
  type Period,
  type PeriodKey,
} from './history-filters';
import { rangeText } from './period-text';

/**
 * The global date filter: it drives the takings cards and both tabs. One
 * row of quick periods (it scrolls sideways on a phone); "Période
 * personnalisée" opens two date fields, applied only with "Appliquer" so
 * a half-typed day never reloads the page. The active period is always
 * spelled out underneath, in Tunis days.
 */
export function PeriodFilter({
  period,
  range,
  today,
  onChange,
}: {
  period: Period;
  /** The days the active period covers. */
  range: DayRange;
  /** Today's business day (Africa/Tunis). */
  today: string;
  onChange: (period: Period) => void;
}) {
  const { t, lang } = useT();
  const [editing, setEditing] = useState(period.key === 'custom');
  // A period set from elsewhere (an empty list's "All dates") closes the form.
  const [seenKey, setSeenKey] = useState(period.key);
  if (seenKey !== period.key) {
    setSeenKey(period.key);
    if (period.key !== 'custom') setEditing(false);
  }

  const pick = (value: string) => {
    // A second click on the active period leaves it on.
    if (!value) return;
    if (value === 'custom') {
      setEditing(true);
      return;
    }
    setEditing(false);
    onChange({ key: value as PeriodKey, from: '', to: '' });
  };

  return (
    <section aria-label={t('paymentsDesk.period.aria')} className="flex flex-col gap-2">
      {/* The padding keeps the focus rings inside the phone scroller. */}
      <div className="no-scrollbar -mx-4 -my-1 overflow-x-auto px-4 py-1 lg:mx-0 lg:px-0">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={1}
          value={editing ? 'custom' : period.key}
          onValueChange={pick}
          aria-label={t('paymentsDesk.period.label')}
          className="w-max"
        >
          {PERIOD_VALUES.map((key) => (
            <ToggleGroupItem
              key={key}
              value={key}
              className="h-8 px-3 text-[13px] data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
            >
              {key === 'custom' && <CalendarRange aria-hidden="true" />}
              {t(`paymentsDesk.period.${key}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {editing && (
        <CustomRangeForm
          // A new applied range (or a reset) starts the fields again from it.
          key={`${period.key}:${period.from}:${period.to}`}
          initial={{
            from: period.key === 'custom' ? period.from : (range.from ?? today),
            to: period.key === 'custom' ? period.to : (range.to ?? today),
          }}
          applied={period.key === 'custom'}
          onApply={(from, to) => onChange({ key: 'custom', from, to })}
          onReset={() => {
            setEditing(false);
            onChange(DEFAULT_PERIOD);
          }}
        />
      )}

      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
        <span>{t('paymentsDesk.period.active', { range: rangeText(range, today, lang, t) })}</span>
      </p>
    </section>
  );
}

const ERROR_KEYS: Record<CustomRangeError, string> = {
  missingFrom: 'paymentsDesk.period.errors.missingFrom',
  missingTo: 'paymentsDesk.period.errors.missingTo',
  invalid: 'paymentsDesk.period.errors.invalid',
  tooEarly: 'paymentsDesk.period.errors.tooEarly',
  endBeforeStart: 'paymentsDesk.period.errors.endBeforeStart',
};

/**
 * "Du" / "Au", both days included. The end may not precede the start: the
 * pickers keep each other in bounds, and a typed range that breaks the
 * rule says so instead of applying. Enter applies, like the button.
 */
function CustomRangeForm({
  initial,
  applied,
  onApply,
  onReset,
}: {
  initial: { from: string; to: string };
  /** The fields show the range in use (not a new one being typed). */
  applied: boolean;
  onApply: (from: string, to: string) => void;
  onReset: () => void;
}) {
  const { t } = useT();
  const messageId = useId();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [tried, setTried] = useState(false);

  const error = customRangeError(from, to);
  // An empty field is only an error once "Appliquer" was pressed; a range
  // running backwards is said at once.
  const shown =
    error && (tried || (error !== 'missingFrom' && error !== 'missingTo')) ? error : null;
  const unchanged = applied && from === initial.from && to === initial.to;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (error === null) onApply(from, to);
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
        <DayField
          label={t('paymentsDesk.period.from')}
          ariaLabel={t('paymentsDesk.period.fromAria')}
          value={from}
          onChange={setFrom}
          min={EARLIEST_DAY}
          max={to || undefined}
          invalid={shown === 'missingFrom' || shown === 'endBeforeStart' || shown === 'tooEarly'}
          describedBy={messageId}
        />
        <DayField
          label={t('paymentsDesk.period.to')}
          ariaLabel={t('paymentsDesk.period.toAria')}
          value={to}
          onChange={setTo}
          min={from || EARLIEST_DAY}
          invalid={shown === 'missingTo' || shown === 'endBeforeStart'}
          describedBy={messageId}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="h-9 px-4" disabled={unchanged}>
          {t('paymentsDesk.period.apply')}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-9" onClick={onReset}>
          <RotateCcw aria-hidden="true" />
          {t('paymentsDesk.period.reset')}
        </Button>
      </div>
      <p
        id={messageId}
        role={shown ? 'alert' : undefined}
        className={cn(
          'text-xs sm:basis-full',
          shown ? 'font-medium text-destructive' : 'text-muted-foreground',
        )}
      >
        {shown ? t(ERROR_KEYS[shown]) : t('paymentsDesk.period.customHint')}
      </p>
    </form>
  );
}

/** A date field with its calendar: a click anywhere on it opens the picker. */
function DayField({
  label,
  ariaLabel,
  value,
  onChange,
  min,
  max,
  invalid,
  describedBy,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  onChange: (day: string) => void;
  min?: string;
  max?: string;
  invalid: boolean;
  describedBy: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <span className="relative">
        <CalendarDays
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(event) => onChange(event.target.value)}
          onClick={(event) => {
            try {
              event.currentTarget.showPicker();
            } catch {
              // Not every browser opens the picker on demand: typing works.
            }
          }}
          // The visible label stays the start of the name ("Du (Date de
          // début)"): a voice command says what it sees.
          aria-label={`${label} (${ariaLabel})`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          // One calendar icon (ours, on the left): the browser's own is
          // hidden, a click anywhere on the field opens the picker.
          className="h-9 w-full pl-8 text-sm text-foreground sm:w-44 [&::-webkit-calendar-picker-indicator]:opacity-0"
        />
      </span>
    </label>
  );
}
