'use client';

import { useMemo } from 'react';
import { DentistProfile, User, WorkingHours, UserRole } from '@/lib/types';

export interface OnboardingStatus {
  profileComplete: boolean;
  clinicComplete: boolean;
  scheduleComplete: boolean;
  isDentist: boolean;
}

export function useOnboardingStatus(
  user: User | null | undefined,
  dentistProfile: DentistProfile | null | undefined,
  workingHours: WorkingHours[] | undefined,
): OnboardingStatus {
  return useMemo(() => {
    const isDentist = user?.role === UserRole.DENTIST;
    const profileComplete = Boolean(user?.fullName && user?.phone && user?.country);

    const hasLocation =
      dentistProfile?.latitude != null &&
      dentistProfile?.longitude != null &&
      !(dentistProfile.latitude === 0 && dentistProfile.longitude === 0);

    const clinicComplete = Boolean(
      dentistProfile?.clinicName &&
        dentistProfile?.clinicAddress &&
        dentistProfile?.clinicPhone &&
        dentistProfile?.city &&
        dentistProfile?.country &&
        hasLocation,
    );

    const scheduleComplete = Array.isArray(workingHours)
      ? workingHours.some((day) => !day.isClosed)
      : false;

    return {
      profileComplete,
      clinicComplete,
      scheduleComplete,
      isDentist,
    };
  }, [user, dentistProfile, workingHours]);
}
