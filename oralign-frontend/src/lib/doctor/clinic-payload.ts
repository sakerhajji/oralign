/**
 * The optional free-text fields of the clinic forms (address, city,
 * country, phone, e-mail, description, matricule fiscal, specialty) and of
 * the account forms (phone, country): what to send for each one.
 *
 * Server rule (backend dentist-profile.dto.ts): a string sets the value,
 * null (or an empty string) clears it, and an omitted field (undefined)
 * leaves the stored value untouched. Before this helper the forms turned
 * every blank into undefined, so a field the doctor (or an admin) emptied
 * silently kept its old value.
 *
 * - typed text                      → the trimmed text;
 * - blank now, a value was stored   → null: the user emptied it, clear it;
 * - blank, nothing stored (a new
 *   profile, or a field left empty) → undefined: nothing to change.
 *
 * null rather than '' on purpose: `clinicEmail` is unique, and an empty
 * string would be a value two clinics could not share.
 *
 * Pure module (no imports): tested with `node --test`.
 */

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

/** The value to send for one optional text field (see the module note). */
export function optionalTextPayload(
  value: unknown,
  stored?: string | null,
): string | null | undefined {
  if (!isBlank(value)) return (value as string).trim();
  return isBlank(stored) ? undefined : null;
}

/**
 * Does one field's payload (from optionalTextPayload) change the stored
 * value? Undefined never does; null does (it clears a stored value); a
 * string does when it differs. Lets a form skip a request that would
 * change nothing, without missing a field the user emptied.
 */
export function optionalTextChanged(
  payload: string | null | undefined,
  stored?: string | null,
): boolean {
  if (payload === undefined) return false;
  if (payload === null) return !isBlank(stored);
  return payload !== stored;
}

/**
 * `optionalTextPayload` over several fields at once: `values` are the
 * form values, `stored` the record being edited (null / undefined for a
 * new one). Only the listed keys are read.
 */
export function optionalTextPayloads<K extends string>(
  keys: readonly K[],
  values: Partial<Record<K, unknown>>,
  stored: Partial<Record<K, string | null | undefined>> | null | undefined,
): Record<K, string | null | undefined> {
  const payload = {} as Record<K, string | null | undefined>;
  for (const key of keys) {
    payload[key] = optionalTextPayload(values[key], stored?.[key]);
  }
  return payload;
}
