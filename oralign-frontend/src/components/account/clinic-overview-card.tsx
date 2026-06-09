'use client';

import { DentistProfile, WorkingHours } from '@/lib/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { WorkingHoursList } from '@/components/account/working-hours';
import { useT } from '@/lib/i18n/lang-context';

export function ClinicOverviewCard({
  profile,
  workingHours,
}: {
  profile: DentistProfile | null;
  workingHours: WorkingHours[];
}) {
  const { t } = useT();

  if (!profile) {
    return (
      <Card>
        <CardHeader>
          <h3 className="text-base font-semibold">{t('accountHome.clinicTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('accountHome.clinicCompleteHint')}</p>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold">{t('accountHome.clinicTitle')}</h3>
        <p className="text-sm text-muted-foreground">{t('accountHome.clinicInfoHint')}</p>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-6 py-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">{t('accountHome.clinicNameLabel')}</p>
            <p className="mt-2 text-sm font-medium">{profile.clinicName}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('accountHome.phoneLabel')}</p>
            <p className="mt-2 text-sm">{profile.clinicPhone || t('accountHome.notProvided')}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('accountHome.addressLabel')}</p>
            <p className="mt-2 text-sm">{profile.clinicAddress || t('accountHome.notProvided')}</p>
          </div>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{t('accountHome.workingHoursLabel')}</p>
          <div className="mt-3">
            <WorkingHoursList hours={workingHours} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
