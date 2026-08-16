// Dentist profile DTOs
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

import { DayOfWeek } from './enums';

// ==========================================
// DENTIST PROFILE DTOs
// ==========================================

export interface CreateDentistProfileDto {
  clinicName: string;
  clinicAddress?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  clinicPhone?: string;
  clinicEmail?: string;
  description?: string;
  logoUrl?: string;
  /** Clinic "Matricule fiscal" (doctor tax registration number). */
  taxId?: string;
  specialty?: string;
  isListedPublicly?: boolean;
}

export interface UpdateDentistProfileDto {
  clinicName?: string;
  clinicAddress?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  clinicPhone?: string;
  clinicEmail?: string;
  description?: string;
  logoUrl?: string;
  /** Clinic "Matricule fiscal" (doctor tax registration number). */
  taxId?: string;
  specialty?: string;
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
