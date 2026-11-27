import { z } from 'zod';

/**
 * The clinic fields the dashboard's onboarding gate requires
 * (lib/hooks/use-onboarding.ts, `clinicComplete`: name, address, practice
 * phone, city, country, map location), as zod fields for the settings
 * forms. The onboarding form asks for every one of them (spec default:
 * « onboarding still requires both phones »). A settings form that lets
 * the doctor empty one now really clears it (null, clinic-payload.ts), and
 * the next page load sends him back to /onboarding/clinic to type it
 * again: so the settings forms refuse a blank, with the onboarding copy.
 */

/** Same rule as the onboarding form's clinic phone (international format). */
const CLINIC_PHONE = /^\+[1-9]\d{6,14}$/;

/** A required text field of the clinic (address: min 2, city / country: min 1). */
export function gateRequiredText(message: string, min = 1) {
  return z.string({ message }).trim().min(min, message);
}

/** The required practice phone. */
export function gateRequiredPhone(message: string) {
  return z.string({ message }).trim().regex(CLINIC_PHONE, message);
}
