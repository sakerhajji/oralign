/**
 * Phones are stored E.164 without separators ("+21698123456"). These
 * helpers only change how a stored number is shown or dialled.
 */

/** "+21698123456" → "+216 98 123 456" (TN / FR); other numbers as stored. */
export function formatPhone(phone: string): string {
  const tn = /^\+216(\d{2})(\d{3})(\d{3})$/.exec(phone);
  if (tn) return `+216 ${tn[1]} ${tn[2]} ${tn[3]}`;
  const fr = /^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(phone);
  if (fr) return `+33 ${fr.slice(1).join(' ')}`;
  return phone;
}

/** A `tel:` link for a stored number (spaces are not allowed in it). */
export function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
