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
          day.dayOfWeek === dayOfWeek
            ? { ...day, ...update }
            : day,
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

        return (
          <div
            key={day.dayOfWeek}
            className={cn(
              'grid grid-cols-[140px_1fr_1fr_56px] items-center gap-3 rounded-xl border px-4 py-3',
              isOpen ? 'bg-background' : 'bg-muted/20',
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-semibold',
                  meta?.isWeekend
                    ? isOpen
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-muted text-muted-foreground/60'
                    : isOpen
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground/60',
                )}
              >
                {meta?.short ?? '??'}
              </span>
              <span
                className={cn(
                  'text-sm font-medium',
                  isOpen ? 'text-foreground' : 'text-muted-foreground/70',
                )}
              >
                {meta?.label ?? day.dayOfWeek}
              </span>
            </div>

            {isOpen ? (
              <>
                <input
                  type="time"
                  value={day.openTime}
                  onChange={(event) => updateDay(day.dayOfWeek, { openTime: event.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
                  disabled={disabled}
                />
                <input
                  type="time"
                  value={day.closeTime}
                  onChange={(event) => updateDay(day.dayOfWeek, { closeTime: event.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
                  disabled={disabled}
                />
              </>
            ) : (
              <div className="col-span-2 text-sm text-muted-foreground italic">Closed</div>
            )}

            <div className="flex items-center justify-center">
              <Switch
                checked={isOpen}
                onCheckedChange={(value) => updateDay(day.dayOfWeek, { isClosed: !value })}
                disabled={disabled}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
