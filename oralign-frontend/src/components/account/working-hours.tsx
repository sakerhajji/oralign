'use client';

import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { DayOfWeek, WorkingHours } from '@/lib/types';
import { Switch } from '@/components/ui/switch';

export const DAY_META: Array<{
  key: DayOfWeek;
  label: string;
  short: string;
  isWeekend?: boolean;
}> = [
  { key: DayOfWeek.MONDAY, label: 'Monday', short: 'Mon' },
  { key: DayOfWeek.TUESDAY, label: 'Tuesday', short: 'Tue' },
  { key: DayOfWeek.WEDNESDAY, label: 'Wednesday', short: 'Wed' },
  { key: DayOfWeek.THURSDAY, label: 'Thursday', short: 'Thu' },
  { key: DayOfWeek.FRIDAY, label: 'Friday', short: 'Fri' },
  { key: DayOfWeek.SATURDAY, label: 'Saturday', short: 'Sat', isWeekend: true },
  { key: DayOfWeek.SUNDAY, label: 'Sunday', short: 'Sun', isWeekend: true },
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
  emptyLabel = 'Not set',
}: {
  hours?: WorkingHours[] | null;
  className?: string;
  emptyLabel?: string;
}) {
  const schedule = buildScheduleFromHours(hours);

  return (
    <div className={cn('space-y-2', className)}>
      {schedule.map((day) => {
        const meta = DAY_META.find((item) => item.key === day.dayOfWeek);
        const label = meta?.label ?? day.dayOfWeek;
        return (
          <div
            key={day.dayOfWeek}
            className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
          >
            <span className="font-medium">{label}</span>
            <span className="text-muted-foreground">
              {day.isClosed ? emptyLabel : `${day.openTime} - ${day.closeTime}`}
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Day label + status pill */}
              <div className="flex items-center justify-between gap-3 sm:justify-start">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'inline-flex h-9 w-9 items-center justify-center rounded-lg text-[11px] font-bold uppercase tracking-wide',
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
                    {meta?.short ?? '??'}
                  </span>
                  <label
                    htmlFor={toggleId}
                    className={cn(
                      'cursor-pointer text-sm font-semibold sm:text-base',
                      isOpen ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {meta?.label ?? day.dayOfWeek}
                  </label>
                </div>

                {/* Status pill + switch */}
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                      isOpen
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {isOpen ? 'Open' : 'Closed'}
                  </span>
                  <Switch
                    id={toggleId}
                    checked={isOpen}
                    onCheckedChange={(value) =>
                      updateDay(day.dayOfWeek, { isClosed: !value })
                    }
                    disabled={disabled}
                    aria-label={`${meta?.label ?? day.dayOfWeek} is ${isOpen ? 'open' : 'closed'}`}
                  />
                </div>
              </div>

              {/* Time inputs — only rendered when the day is ON.
                  Hiding (not just disabling) removes them from the tab
                  order, which matches what the user expects. */}
              {isOpen && (
                <div className="grid grid-cols-2 gap-2 sm:max-w-xs sm:flex-1">
                  <div className="space-y-1">
                    <label
                      htmlFor={`${toggleId}-open`}
                      className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      Opens
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
                  <div className="space-y-1">
                    <label
                      htmlFor={`${toggleId}-close`}
                      className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      Closes
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
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
