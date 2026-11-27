import type { Prisma } from '@prisma/client';

/**
 * Doctor identity (spec §6): ONE live read of who a doctor is.
 *
 * Every value lives in exactly one row: the person in `User` (name, login
 * e-mail, account phone, photo) and the practice in `DentistProfile`
 * (clinic name, address, practice phone and e-mail, logo, professional
 * identifiers). Live screens join them through the selects below instead
 * of picking their own subset, and never copy them into operational
 * tables. Documents (devis, factures) keep their own snapshots: that is
 * `doctor-billing-snapshot.ts`, not this file.
 *
 * Which select to use:
 * - DOCTOR_SUMMARY_SELECT: owner and admin screens (patient desk, order
 *   detail, user sheets). No private identifier is read.
 * - DOCTOR_SUMMARY_PRIVATE_SELECT: the same plus taxId / registrationNumber,
 *   ONLY where the caller is the doctor himself or an admin.
 * - DOCTOR_NAME_SELECT: production screens (leak guard: no phone, e-mail
 *   or address may reach a technician) and high-volume lists.
 * - DOCTOR_PUBLIC_SELECT: anonymous surfaces (the patient's plan link):
 *   the name and the practice name, nothing that reaches the doctor.
 */

/** Practice columns of the summary (private identifiers excluded). */
const CLINIC_SUMMARY_SELECT = {
  clinicName: true,
  clinicAddress: true,
  city: true,
  country: true,
  clinicPhone: true,
  clinicEmail: true,
  logoUrl: true,
  specialty: true,
  deletedAt: true,
} satisfies Prisma.DentistProfileSelect;

export const DOCTOR_SUMMARY_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  avatarUrl: true,
  isActive: true,
  deletedAt: true,
  dentistProfile: { select: CLINIC_SUMMARY_SELECT },
} satisfies Prisma.UserSelect;

/** The summary plus the private identifiers: owner and admins only. */
export const DOCTOR_SUMMARY_PRIVATE_SELECT = {
  ...DOCTOR_SUMMARY_SELECT,
  dentistProfile: {
    select: {
      ...CLINIC_SUMMARY_SELECT,
      taxId: true,
      registrationNumber: true,
    },
  },
} satisfies Prisma.UserSelect;

/** Name only: production (leak guard) and high-volume lists. */
export const DOCTOR_NAME_SELECT = {
  id: true,
  fullName: true,
} satisfies Prisma.UserSelect;

/** Anonymous surfaces: who shared the link, nothing to reach him by. */
export const DOCTOR_PUBLIC_SELECT = {
  fullName: true,
  dentistProfile: { select: { clinicName: true, deletedAt: true } },
} satisfies Prisma.UserSelect;

export type DoctorSummaryRow = Prisma.UserGetPayload<{
  select: typeof DOCTOR_SUMMARY_SELECT;
}>;
export type DoctorSummaryPrivateRow = Prisma.UserGetPayload<{
  select: typeof DOCTOR_SUMMARY_PRIVATE_SELECT;
}>;
export type DoctorPublicRow = Prisma.UserGetPayload<{
  select: typeof DOCTOR_PUBLIC_SELECT;
}>;

/**
 * What the mapper reads. Both summary payloads satisfy it; the private
 * identifiers are present only on a row read with the private select.
 */
export interface DoctorIdentityRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  dentistProfile: {
    clinicName: string;
    clinicAddress: string | null;
    city: string | null;
    country: string | null;
    clinicPhone: string | null;
    clinicEmail: string | null;
    logoUrl: string | null;
    specialty: string | null;
    deletedAt: Date | null;
    taxId?: string | null;
    registrationNumber?: string | null;
  } | null;
}

export interface DoctorClinicSummary {
  clinicName: string;
  clinicAddress: string | null;
  city: string | null;
  country: string | null;
  clinicPhone: string | null;
  clinicEmail: string | null;
  logoUrl: string | null;
  specialty: string | null;
  /** Only on rows read with DOCTOR_SUMMARY_PRIVATE_SELECT. */
  taxId?: string | null;
  /** Only on rows read with DOCTOR_SUMMARY_PRIVATE_SELECT. */
  registrationNumber?: string | null;
}

/** Mirrors `DoctorSummary` in oralign-frontend/src/lib/types/entities.ts. */
export interface DoctorSummary {
  id: string;
  fullName: string;
  /** The login e-mail (where notifications and mail go). */
  email: string;
  /** The account phone (personal). */
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  /** null when the doctor has no practice profile, or deleted it. */
  clinic: DoctorClinicSummary | null;
  /** The contact to print or show: practice first, account fallback. */
  contactPhone: string | null;
  contactEmail: string | null;
}

export interface DoctorPublicIdentity {
  fullName: string | null;
  clinicName: string | null;
}

/** A trimmed, non-empty string, or null. */
function filled(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * THE contact rule (DECISIONS §6): the practice phone and e-mail first,
 * the account ones as fallback; a blank value counts as missing. Mail and
 * notifications keep going to `User.email` (the login), which is a
 * different job from the contact a screen or a document shows.
 */
export function doctorContact(
  account: { phone: string | null; email: string | null },
  clinic: { clinicPhone: string | null; clinicEmail: string | null } | null,
): { contactPhone: string | null; contactEmail: string | null } {
  return {
    contactPhone: filled(clinic?.clinicPhone) ?? filled(account.phone),
    contactEmail: filled(clinic?.clinicEmail) ?? filled(account.email),
  };
}

/** A soft-deleted practice profile is no practice at all. */
function liveClinic<T extends { deletedAt: Date | null }>(
  clinic: T | null | undefined,
): T | null {
  return clinic && !clinic.deletedAt ? clinic : null;
}

/**
 * Map a row read with DOCTOR_SUMMARY_SELECT (or its private variant) to
 * the summary every owner / admin screen shows. The private identifiers
 * are copied only when the row carries them, so a caller cannot leak a
 * column it did not select.
 */
export function toDoctorSummary(row: DoctorIdentityRow): DoctorSummary {
  const profile = liveClinic(row.dentistProfile);
  const clinic: DoctorClinicSummary | null = profile
    ? {
        clinicName: profile.clinicName,
        clinicAddress: profile.clinicAddress,
        city: profile.city,
        country: profile.country,
        clinicPhone: profile.clinicPhone,
        clinicEmail: profile.clinicEmail,
        logoUrl: profile.logoUrl,
        specialty: profile.specialty,
        ...('taxId' in profile ? { taxId: profile.taxId ?? null } : {}),
        ...('registrationNumber' in profile
          ? { registrationNumber: profile.registrationNumber ?? null }
          : {}),
      }
    : null;
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    avatarUrl: row.avatarUrl,
    isActive: row.isActive,
    deletedAt: row.deletedAt,
    clinic,
    ...doctorContact(row, clinic),
  };
}

/** The name and practice name of DOCTOR_PUBLIC_SELECT, for anonymous pages. */
export function toDoctorPublicIdentity(
  row: DoctorPublicRow | null | undefined,
): DoctorPublicIdentity | undefined {
  if (!row) return undefined;
  return {
    fullName: filled(row.fullName),
    clinicName: filled(liveClinic(row.dentistProfile)?.clinicName),
  };
}
