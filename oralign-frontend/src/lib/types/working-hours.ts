// Working hours DTOs
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

import { DayOfWeek } from './enums';

// ==========================================
// WORKING HOURS DTOs
// ==========================================

export interface CreateWorkingHoursDto {
  dentistProfileId: string;
  dayOfWeek: DayOfWeek;
  openTime: string;
  closeTime: string;
  isClosed?: boolean;
}

export interface UpdateWorkingHoursDto {
  openTime?: string;
  closeTime?: string;
  isClosed?: boolean;
}
