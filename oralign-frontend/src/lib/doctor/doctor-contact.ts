/**
 * The contact a live screen shows for a doctor (spec §6): the shared
 * DoctorSummary carries `contactEmail` / `contactPhone`, the practice's
 * first and the account's as fallback, the rule the devis and invoices
 * print. A payload without the summary (a designer's reduced view, an
 * older response) falls back to the account e-mail, as before.
 *
 * Pure module (no imports): tested with `node --test`
 * (doctor-contact.test.mjs).
 */

function filled(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * A doctor's name with the « Dr. » title exactly once, or null. Sign-up
 * already stores « Dr. Saker Hajji » (normalizeDoctorName in
 * lib/schemas) and an admin may type the title or not, so a blind
 * `Dr. ${fullName}` reads « Dr. Dr. Saker Hajji ». A name merely starting
 * with the letters (« Driss ») still gets the title.
 */
export function doctorWithTitle(fullName: string | null | undefined): string | null {
  const name = filled(fullName);
  if (!name) return null;
  return /^(dr\.?|docteur)(\s|$)/i.test(name) ? name : `Dr. ${name}`;
}

/** The e-mail to show under a doctor's name, or null. */
export function doctorContactEmail(
  doctor: { email?: string | null; contactEmail?: string | null } | null | undefined,
): string | null {
  if (!doctor) return null;
  return filled(doctor.contactEmail) ?? filled(doctor.email);
}
