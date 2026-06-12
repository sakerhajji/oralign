'use client';

import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { DayOfWeek, WorkingHours } from '@/lib/types';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/lib/i18n/lang-context';

// Internal day-key used to look up labels via the i18n dictionary.
// The static `label`/`short` properties are kept for back-compat with
// callers that still read DAY_META directly without a translator.
type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export const DAY_META: Array<{
  key: DayOfWeek;
  label: string;
  short: string;
  isWeekend?: boolean;
  i18nKey: DayKey;
}> = [
  { key: DayOfWeek.MONDAY, label: 'Monday', short: 'Mon', i18nKey: 'monday' },
  { key: DayOfWeek.TUESDAY, label: 'Tuesday', short: 'Tue', i18nKey: 'tuesday' },
  { key: DayOfWeek.WEDNESDAY, label: 'Wednesday', short: 'Wed', i18nKey: 'wednesday' },
  { key: DayOfWeek.THURSDAY, label: 'Thursday', short: 'Thu', i18nKey: 'thursday' },
  { key: DayOfWeek.FRIDAY, label: 'Friday', short: 'Fri', i18nKey: 'friday' },
  { key: DayOfWeek.SATURDAY, label: 'Saturday', short: 'Sat', isWeekend: true, i18nKey: 'saturday' },
  { key: DayOfWeek.SUNDAY, label: 'Sunday', short: 'Sun', isWeekend: true, i18nKey: 'sunday' },
];

export type DaySchedule = {
  dayOfWeek: DayOfWeek;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
  existingId?: string;
};

export function buildScheduleFromHours(hours?: WorkingHours[] | null): DaySchedule[] {
  return DAY_META.map((meta) => {
    const match = hours?.find((item) => item.dayOfWeek === meta.key);
    return {
      dayOfWeek: meta.key,
      openTime: match?.openTime ?? '09:00',
      closeTime: match?.closeTime ?? '17:00',
      isClosed: match?.isClosed ?? true,
      existingId: match?.id,
    };
  });
}

export function WorkingHoursList({
  hours,
  className,
  emptyLabel,
}: {
  hours?: WorkingHours[] | null;
  className?: string;
  emptyLabel?: string;
}) {
  const { t } = useT();
  const schedule = buildScheduleFromHours(hours);
  const fallbackEmpty = emptyLabel ?? t('accountHome.workingHoursNotSet');

  return (
    <div className={cn('space-y-2', className)}>
      {schedule.map((day) => {
        const meta = DAY_META.find((item) => item.key === day.dayOfWeek);
        const label = meta ? t(`accountHome.days.${meta.i18nKey}`) : day.dayOfWeek;
        return (
          <div
            key={day.dayOfWeek}
            className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
          >
            <span className="font-medium">{label}</span>
            <span className="text-muted-foreground">
              {day.isClosed ? fallbackEmpty : `${day.openTime} - ${day.closeTime}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Editable weekly schedule. Each row has:
 *   - Day label (with weekend tint)
 *   - Explicit OPEN/CLOSED toggle pill with status text
 *   - Open / close time inputs that are visually hidden when the day is OFF
 *
 * Layout adapts: single column on phones, day + toggle row → times row.
 */
export function WorkingHoursEditor({
  schedule,
  onChange,
  disabled,
}: {
  schedule: DaySchedule[];
  onChange: (next: DaySchedule[]) => void;
  disabled?: boolean;
}) {
  const { t } = useT();
  const updateDay = useCallback(
    (dayOfWeek: DayOfWeek, update: Partial<DaySchedule>) => {
      onChange(
        schedule.map((day) =>
          day.dayOfWeek === dayOfWeek ? { ...day, ...update } : day,
        ),
      );
    },
    [schedule, onChange],
  );

  return (
    <div className="space-y-2">
      {schedule.map((day) => {
        const meta = DAY_META.find((item) => item.key === day.dayOfWeek);
        const isOpen = !day.isClosed;
        const toggleId = `day-toggle-${day.dayOfWeek}`;
        const dayLabel = meta ? t(`accountHome.days.${meta.i18nKey}`) : day.dayOfWeek;
        const dayShort = meta ? t(`accountHome.daysShort.${meta.i18nKey}`) : '??';

        return (
          <div
            key={day.dayOfWeek}
            className={cn(
              'rounded-xl border p-3 transition-colors sm:p-4',
              isOpen
                ? 'border-primary/40 bg-background shadow-sm'
                : 'border-border bg-muted/30',
            )}
          >
            {/* Three-column grid on tablets+ pinned to FIXED widths so
                the time inputs land at the same x-position on every row
                regardless of whether the day name is "Monday" or
                "Wednesday". Closed rows still occupy the Opens/Closes
                slots (rendered empty) so vertical rhythm is preserved.
                Phones fall back to a single-column stack. */}
            <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_140px_140px] sm:items-center sm:gap-4">
              {/* ─── Column 1: day badge + label + status pill + switch ── */}
              <div className="flex items-center justify-between gap-3 sm:justify-start">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold uppercase tracking-wide',
                      meta?.isWeekend
                        ? isOpen
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground/60'
                        : isOpen
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground/60',
                    )}
                    aria-hidden
                  >
                    {dayShort}
                  </span>
                  <label
                    htmlFor={toggleId}
                    className={cn(
                      'cursor-pointer truncate text-sm font-semibold sm:text-base',
                      isOpen ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {dayLabel}
                  </label>
                </div>

                <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                      isOpen
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {isOpen ? t('accountHome.dayOpen') : t('accountHome.dayClosed')}
                  </span>
                  <Switch
                    id={toggleId}
                    checked={isOpen}
                    onCheckedChange={(value) =>
                      updateDay(day.dayOfWeek, { isClosed: !value })
                    }
                    disabled={disabled}
                    aria-label={t(
                      isOpen ? 'accountHome.dayIsOpenAria' : 'accountHome.dayIsClosedAria',
                      { day: dayLabel },
                    )}
                  />
                </div>
              </div>

              {/* ─── Column 2: Opens — fixed 140px on tablets+ ── */}
              {isOpen ? (
                <div className="space-y-1">
                  <label
                    htmlFor={`${toggleId}-open`}
                    className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {t('accountHome.dayOpens')}
                  </label>
                  <input
                    id={`${toggleId}-open`}
                    type="time"
                    value={day.openTime}
                    onChange={(event) =>
                      updateDay(day.dayOfWeek, { openTime: event.target.value })
                    }
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    disabled={disabled}
                  />
                </div>
              ) : (
                // Empty slot — keeps grid alignment on closed rows so the
                // Opens column on every other row still lines up.
                <div className="hidden sm:block" aria-hidden="true" />
              )}

              {/* ─── Column 3: Closes — fixed 140px on tablets+ ── */}
              {isOpen ? (
                <div className="space-y-1">
                  <label
                    htmlFor={`${toggleId}-close`}
                    className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {t('accountHome.dayCloses')}
                  </label>
                  <input
                    id={`${toggleId}-close`}
                    type="time"
                    value={day.closeTime}
                    onChange={(event) =>
                      updateDay(day.dayOfWeek, { closeTime: event.target.value })
                    }
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    disabled={disabled}
                  />
                </div>
              ) : (
                <div className="hidden sm:block" aria-hidden="true" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
