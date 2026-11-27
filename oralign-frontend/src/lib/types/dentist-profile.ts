// Dentist profile DTOs
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

import { DayOfWeek } from './enums';

// ==========================================
// DENTIST PROFILE DTOs
// ==========================================
//
// Write rule of the optional text fields (backend dentist-profile.dto.ts):
// a string sets the value, null (or an empty string) CLEARS it, and an
// omitted field (undefined) leaves the stored value untouched. The clinic
// forms build these bodies with lib/doctor/clinic-payload.ts (a field the
// user emptied is sent as null) and lib/doctor/registration-number.ts.

export interface CreateDentistProfileDto {
  clinicName: string;
  clinicAddress?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number;
  longitude?: number;
  clinicPhone?: string | null;
  clinicEmail?: string | null;
  description?: string | null;
  logoUrl?: string;
  /** Clinic "Matricule fiscal" (doctor tax registration number). */
  taxId?: string | null;
  /**
   * Professional-order registration number (spec §6): private like taxId
   * (owner and admins only, never the public directory), not printed.
   * Trimmed by the server, at most 64 characters.
   */
  registrationNumber?: string | null;
  specialty?: string | null;
  isListedPublicly?: boolean;
}

export interface UpdateDentistProfileDto {
  clinicName?: string;
  clinicAddress?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number;
  longitude?: number;
  clinicPhone?: string | null;
  clinicEmail?: string | null;
  description?: string | null;
  logoUrl?: string;
  /** Clinic "Matricule fiscal" (doctor tax registration number). */
  taxId?: string | null;
  /** See CreateDentistProfileDto.registrationNumber. */
  registrationNumber?: string | null;
  specialty?: string | null;
  isListedPublicly?: boolean;
}

/** Single-shot weekly schedule entry — used by SetupClinicDto. */
export interface WeeklyHoursEntryDto {
  dayOfWeek: DayOfWeek;
  openTime: string; // HH:mm
  closeTime: string; // HH:mm
  isClosed: boolean;
}

/** Combined clinic + working-hours payload for the onboarding wizard. */
export interface SetupClinicDto extends CreateDentistProfileDto {
  workingHours: WeeklyHoursEntryDto[];
}

export interface SearchByCityDto {
  city: string;
  page?: number;
  limit?: number;
}

export interface SearchNearbyDto {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  page?: number;
  limit?: number;
}
