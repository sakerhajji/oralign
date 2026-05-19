'use client';

import { useMemo } from 'react';
import {
  DentistProfile,
  User,
  VerificationStatus,
  WorkingHours,
  UserRole,
} from '@/lib/types';

export interface OnboardingStatus {
  /** Email verified — handled by the OTP flow. */
  emailVerified: boolean;
  /** User profile (phone, country) filled in. */
  profileComplete: boolean;
  /** Clinic record exists with the mandatory address + location. */
  clinicComplete: boolean;
  /** At least one open day of the week is configured. */
  scheduleComplete: boolean;
  /** Admin has flipped the account to "approved". */
  adminApproved: boolean;
  /** True once everything above is true and the user can enter the app. */
  isFullyOnboarded: boolean;
  /** Role-aware helper — non-dentists skip clinic/schedule. */
  isDentist: boolean;
}

export function useOnboardingStatus(
  user: User | null | undefined,
  dentistProfile: DentistProfile | null | undefined,
  workingHours: WorkingHours[] | undefined,
): OnboardingStatus {
  return useMemo(() => {
    const isDentist = user?.role === UserRole.DENTIST;
    const emailVerified = Boolean(user?.isEmailVerified);
    const profileComplete = Boolean(
      user?.fullName && user?.phone && user?.country,
    );

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

    const adminApproved =
      user?.verificationStatus === VerificationStatus.APPROVED;

    // Non-dentist roles bypass the clinic/schedule gates — they're admin /
    // designer accounts and shouldn't be asked for clinic data.
    const isFullyOnboarded = isDentist
      ? emailVerified &&
        profileComplete &&
        clinicComplete &&
        scheduleComplete &&
        adminApproved
      : emailVerified && profileComplete && adminApproved;

    return {
      emailVerified,
      profileComplete,
      clinicComplete,
      scheduleComplete,
      adminApproved,
      isFullyOnboarded,
      isDentist,
    };
  }, [user, dentistProfile, workingHours]);
}

/** Compute the URL where a user with the given onboarding state should go. */
export function nextOnboardingPath(status: OnboardingStatus): string | null {
  if (!status.emailVerified) return '/auth/verify-email';
  if (!status.profileComplete) return '/onboarding/profile';
  if (status.isDentist && (!status.clinicComplete || !status.scheduleComplete))
    return '/onboarding/clinic';
  if (!status.adminApproved) return '/onboarding/pending';
  return null;
}
