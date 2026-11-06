'use client';

import { useId, useState, type FormEvent } from 'react';
import { CalendarDays, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';
import { EARLIEST_DAY, dayRangeError, type DayRangeError } from '@/lib/utils/day-range';

const ERROR_KEYS: Record<DayRangeError, string> = {
  missingFrom: 'listUi.range.errors.missingFrom',
  missingTo: 'listUi.range.errors.missingTo',
  invalid: 'listUi.range.errors.invalid',
  tooEarly: 'listUi.range.errors.tooEarly',
  endBeforeStart: 'listUi.range.errors.endBeforeStart',
};

/**
 * A custom range of days for a list filter: "Du" / "Au", both days
 * included, applied only with "Appliquer" (or Enter) so a half-typed day
 * never reloads the list. The end cannot precede the start: the pickers
 * keep each other in bounds, and a typed range that breaks a rule says so
 * in words instead of applying. "Réinitialiser" drops the range.
 *
 * Mount it with a `key` built from the applied range: a range applied (or
 * reset) from elsewhere then starts the fields again from it.
 */
export function DayRangeForm({
  initial,
  applied,
  max,
  onApply,
  onReset,
  className,
}: {
  initial: { from: string; to: string };
  /** The fields show the range in use (not a new one being typed). */
  applied: boolean;
  /** The last day the pickers offer (e.g. today for a "date added"). */
  max?: string;
  onApply: (from: string, to: string) => void;
  onReset: () => void;
  className?: string;
}) {
  const { t } = useT();
  const messageId = useId();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [tried, setTried] = useState(false);

  const error = dayRangeError(from, to);
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
      className={cn(
        'flex flex-col gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:flex-row sm:flex-wrap sm:items-end',
        className,
      )}
    >
      <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
        <DayField
          label={t('listUi.range.from')}
          ariaLabel={t('listUi.range.fromAria')}
          value={from}
          onChange={setFrom}
          min={EARLIEST_DAY}
          max={to || max}
          invalid={shown === 'missingFrom' || shown === 'endBeforeStart' || shown === 'tooEarly'}
          describedBy={messageId}
        />
        <DayField
          label={t('listUi.range.to')}
          ariaLabel={t('listUi.range.toAria')}
          value={to}
          onChange={setTo}
          min={from || EARLIEST_DAY}
          max={max}
          invalid={shown === 'missingTo' || shown === 'endBeforeStart'}
          describedBy={messageId}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="h-9 px-4" disabled={unchanged}>
          {t('listUi.range.apply')}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-9" onClick={onReset}>
          <RotateCcw aria-hidden="true" />
          {t('listUi.range.reset')}
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
        {shown ? t(ERROR_KEYS[shown]) : t('listUi.range.hint')}
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
