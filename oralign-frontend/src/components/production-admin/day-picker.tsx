'use client';

import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/lang-context';
import { addDays, isCalendarDate } from '@/lib/utils/business-day';
import { EARLIEST_DAY } from '@/lib/utils/day-range';
import { longDay } from './format';

/**
 * The journal's day: previous / next, a date field (its calendar opens on
 * a click anywhere on it), and "Aujourd’hui" when another day is shown.
 * The day is spelled out beside it ("Mercredi 25 novembre 2026"), in
 * Tunis days; no day after today can be picked.
 */
export function DayPicker({
  day,
  today,
  onChange,
}: {
  day: string;
  today: string;
  onChange: (day: string) => void;
}) {
  const { t, lang } = useT();
  const isToday = day === today;
  const canGoBack = day > EARLIEST_DAY;
  // The field owns what is being typed (a date input reports '' while a
  // segment is half filled); a day set from the arrows replaces it.
  const [draft, setDraft] = useState(day);
  const [seenDay, setSeenDay] = useState(day);
  if (seenDay !== day) {
    setSeenDay(day);
    setDraft(day);
  }

  return (
    <section
      aria-label={t('productionAdmin.journal.dayAria')}
      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
    >
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon"
          className="size-11 sm:size-9"
          onClick={() => onChange(addDays(day, -1))}
          disabled={!canGoBack}
          aria-label={t('productionAdmin.journal.previous')}
          title={t('productionAdmin.journal.previous')}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <label className="relative min-w-0 flex-1 sm:flex-none">
          <span className="sr-only">{t('productionAdmin.journal.dayLabel')}</span>
          <CalendarDays
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="date"
            value={draft}
            min={EARLIEST_DAY}
            max={today}
            // A half-typed year passes through 0002, 0020…: only a whole,
            // reachable day moves the journal.
            onChange={(event) => {
              const next = event.target.value;
              setDraft(next);
              if (isCalendarDate(next) && next >= EARLIEST_DAY && next <= today) onChange(next);
            }}
            onBlur={() => setDraft(day)}
            onClick={(event) => {
              try {
                event.currentTarget.showPicker();
              } catch {
                // Not every browser opens the picker on demand: typing works.
              }
            }}
            className="h-11 w-full pl-8 text-sm tabular-nums sm:h-9 sm:w-44 [&::-webkit-calendar-picker-indicator]:opacity-0"
          />
        </label>
        <Button
          variant="outline"
          size="icon"
          className="size-11 sm:size-9"
          onClick={() => onChange(addDays(day, 1))}
          disabled={isToday}
          aria-label={t('productionAdmin.journal.next')}
          title={t('productionAdmin.journal.next')}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
        {!isToday ? (
          <Button
            variant="ghost"
            className="h-11 px-3 sm:h-9"
            onClick={() => onChange(today)}
          >
            {t('productionAdmin.journal.today')}
          </Button>
        ) : null}
      </div>
      <p className="text-sm font-medium" aria-live="polite">
        {longDay(day, lang)}
      </p>
    </section>
  );
}
