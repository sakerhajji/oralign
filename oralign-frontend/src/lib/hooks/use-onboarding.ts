'use client';

import { useMemo } from 'react';
import {
  DentistProfile,
  User,
  VerificationStatus,
  WorkingHours,
  UserRole,
} from '@/lib/types';
import { PASSWORD_CHANGE_PATH } from '@/lib/api/client';

export interface OnboardingStatus {
  /**
   * Still on the temporary password an admin handed over. First of all:
   * the API refuses everything else (403 PASSWORD_CHANGE_REQUIRED).
   */
  mustChangePassword: boolean;
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
    const mustChangePassword = user?.mustChangePassword === true;
    const emailVerified = Boolean(user?.isEmailVerified);

    // Profile completeness is role-aware. Dentists need phone + country
    // because we contact them for case follow-ups; admin / super_admin /
    // designer are internal accounts created via the create-super-admin
    // script or admin UI and shouldn't be funnelled into the dentist
    // onboarding wizard just because their seed row has null phone.
    const profileComplete = isDentist
      ? Boolean(user?.fullName && user?.phone && user?.country)
      : Boolean(user?.fullName);

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
      mustChangePassword,
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
  if (status.mustChangePassword) return PASSWORD_CHANGE_PATH;
  if (!status.emailVerified) return '/auth/verify-email';
  if (!status.profileComplete) return '/onboarding/profile';
  if (status.isDentist && (!status.clinicComplete || !status.scheduleComplete))
    return '/onboarding/clinic';
  if (!status.adminApproved) return '/onboarding/pending';
  return null;
}

// ─── Where each role lands ──────────────────────────────────────────────────

/** The lab technician's home: the production queue. */
export const TECHNICIAN_HOME = '/dashboard/production';

/** The admin production desk: admins only (the API refuses her with a 403). */
const PRODUCTION_PILOTAGE = '/dashboard/production/pilotage';

/** First screen after sign-in or after the password step, by role. */
export function landingPathFor(role: UserRole | undefined): string {
  return role === UserRole.TECHNICIAN ? TECHNICIAN_HOME : '/dashboard';
}

/**
 * The dashboard routes a technician may open: the production screens
 * (queue, case sheet, dossier, Ma journée), not the admin pilotage. Any
 * other dashboard route would only meet 403s, so the dashboard guard sends
 * her back to the queue. Segment-boundary matching, like src/proxy.ts.
 */
export function isTechnicianRoute(pathname: string): boolean {
  const under = (prefix: string) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`);
  return under(TECHNICIAN_HOME) && !under(PRODUCTION_PILOTAGE);
}
