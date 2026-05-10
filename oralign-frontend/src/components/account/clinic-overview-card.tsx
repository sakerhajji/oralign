'use client';

import { DentistProfile, WorkingHours } from '@/lib/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { WorkingHoursList } from '@/components/account/working-hours';

export function ClinicOverviewCard({
  profile,
  workingHours,
}: {
  profile: DentistProfile | null;
  workingHours: WorkingHours[];
}) {
  if (!profile) {
    return (
      <Card>
        <CardHeader>
          <h3 className="text-base font-semibold">Clinic</h3>
          <p className="text-sm text-muted-foreground">Complete your clinic profile in settings.</p>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold">Clinic</h3>
        <p className="text-sm text-muted-foreground">Your clinic information and availability.</p>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-6 py-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Clinic name</p>
            <p className="mt-2 text-sm font-medium">{profile.clinicName}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Phone</p>
            <p className="mt-2 text-sm">{profile.clinicPhone || 'Not provided'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Address</p>
            <p className="mt-2 text-sm">{profile.clinicAddress || 'Not provided'}</p>
          </div>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Working hours</p>
          <div className="mt-3">
            <WorkingHoursList hours={workingHours} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
