/**
 * The practitioner's professional-order registration number
 * (DentistProfile.registrationNumber, spec §6). Optional and private like
 * the matricule fiscal: only the doctor and the admins read it, the public
 * directory never does, and no document prints it for now.
 *
 * Mirrors the backend DTO rule (dentist-profile.dto.ts): trimmed, at most
 * REGISTRATION_NUMBER_MAX_LENGTH characters, and a blank value is sent as
 * null so a field the doctor emptied is really cleared on the server
 * (an omitted field would leave the stored number untouched).
 *
 * Pure module (no imports): tested with `node --test`.
 */

export const REGISTRATION_NUMBER_MAX_LENGTH = 64;

/** The value to send: the trimmed number, or null to clear it. */
export function registrationNumberPayload(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Whether the typed value fits the server bound once trimmed. */
export function registrationNumberFits(value: unknown): boolean {
  const payload = registrationNumberPayload(value);
  return payload === null || payload.length <= REGISTRATION_NUMBER_MAX_LENGTH;
}

/** The stored value as a form input value (never null / undefined). */
export function registrationNumberInput(stored: string | null | undefined): string {
  return typeof stored === 'string' ? stored : '';
}
