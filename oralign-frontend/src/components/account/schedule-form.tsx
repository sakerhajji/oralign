'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkingHoursEditor, buildScheduleFromHours, type DaySchedule } from '@/components/account/working-hours';
import { useCreateWorkingHours, useUpdateWorkingHours, useWorkingHoursByProfile } from '@/lib/hooks';

const TIME_REGEX = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

export function ScheduleForm({ profileId }: { profileId?: string | null }) {
  const { data: workingHours, isLoading } = useWorkingHoursByProfile(profileId ?? '');
  const { mutateAsync: createWorkingHours } = useCreateWorkingHours();
  const { mutateAsync: updateWorkingHours } = useUpdateWorkingHours();

  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [baselineSchedule, setBaselineSchedule] = useState<DaySchedule[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const nextSchedule = buildScheduleFromHours(workingHours);
    setSchedule(nextSchedule);
    setBaselineSchedule(nextSchedule);
  }, [workingHours]);

  const scheduleDirty = useMemo(() => {
    if (schedule.length !== baselineSchedule.length) return true;
    return schedule.some((day, index) => {
      const baseline = baselineSchedule[index];
      return (
        day.dayOfWeek !== baseline?.dayOfWeek ||
        day.openTime !== baseline.openTime ||
        day.closeTime !== baseline.closeTime ||
        day.isClosed !== baseline.isClosed
      );
    });
  }, [schedule, baselineSchedule]);

  const validateSchedule = useCallback(() => {
    for (const day of schedule) {
      if (!day.isClosed) {
        if (!TIME_REGEX.test(day.openTime) || !TIME_REGEX.test(day.closeTime)) {
          toast.error('Please provide valid working hours (HH:mm).');
          return false;
        }
        if (day.openTime >= day.closeTime) {
          toast.error('Opening time must be before closing time.');
          return false;
        }
      }
    }
    return true;
  }, [schedule]);

  const handleSave = async () => {
    if (!profileId) return;
    if (!validateSchedule()) return;
    setIsSaving(true);
    try {
      await Promise.all(
        schedule.map((day) =>
          day.existingId
            ? updateWorkingHours({
                id: day.existingId,
                data: {
                  openTime: day.openTime,
                  closeTime: day.closeTime,
                  isClosed: day.isClosed,
                },
              })
            : createWorkingHours({
                dentistProfileId: profileId,
                dayOfWeek: day.dayOfWeek,
                openTime: day.openTime,
                closeTime: day.closeTime,
                isClosed: day.isClosed,
              }),
        ),
      );
      toast.success('Working hours saved.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold">Working hours</h3>
        <p className="text-sm text-muted-foreground">Set your weekly availability.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!profileId && (
          <p className="text-sm text-muted-foreground">
            Save your clinic details first to enable scheduling.
          </p>
        )}

        {profileId && isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {profileId && !isLoading && (
          <>
            <WorkingHoursEditor
              schedule={schedule}
              onChange={setSchedule}
              disabled={isSaving}
            />
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={!scheduleDirty || isSaving}>
                {isSaving ? 'Saving...' : 'Save schedule'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
