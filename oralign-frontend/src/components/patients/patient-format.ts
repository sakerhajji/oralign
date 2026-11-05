import { Gender, type Patient } from '@/lib/types';
import type { Lang } from '@/lib/i18n/dict';
import { formatCalendarDate, parseCalendarDate } from '@/lib/utils/calendar-date';

/**
 * Display helpers shared by the patients list, the patient panel and the
 * patient form, so a patient reads the same everywhere (the list and the
 * form used to compute different initials).
 */

/** "Nour El Houda Mansouri" → "NE"; empty names give "". */
export function patientInitials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

/**
 * Dates of birth are calendar dates stored at UTC midnight. Reading only
 * their 'YYYY-MM-DD' part keeps the day the clinic typed, in any zone.
 */
function birthDay(dateOfBirth: string): string {
  return dateOfBirth.slice(0, 10);
}

/** Age in whole years on `today`, or null without a date of birth. */
export function patientAge(
  dateOfBirth: string | undefined,
  today: Date = new Date(),
): number | null {
  if (!dateOfBirth) return null;
  const birth = parseCalendarDate(birthDay(dateOfBirth));
  if (Number.isNaN(birth.getTime())) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

/** "17 mai 1993" / "May 17, 1993". */
export function formatDateOfBirth(dateOfBirth: string, lang: Lang): string {
  return formatCalendarDate(birthDay(dateOfBirth), lang);
}

/** Dictionary key of a gender's label, or null when none is recorded. */
export function genderLabelKey(gender: string | null | undefined): string | null {
  switch (gender) {
    case Gender.FEMALE:
      return 'patientDesk.gender.female';
    case Gender.MALE:
      return 'patientDesk.gender.male';
    case Gender.OTHER:
      return 'patientDesk.gender.other';
    default:
      return null;
  }
}

type Translate = (path: string, vars?: Record<string, string | number>) => string;

/** "17 ans · Homme", or null when neither age nor sex is recorded. */
export function patientFacts(
  patient: Pick<Patient, 'dateOfBirth' | 'gender'>,
  t: Translate,
): string | null {
  const age = patientAge(patient.dateOfBirth);
  const gender = genderLabelKey(patient.gender);
  const parts = [
    age === null ? null : t('patientDesk.list.age', { age }),
    gender ? t(gender) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
