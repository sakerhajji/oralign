/**
 * A list query param as an array, however the client sent it: one
 * comma-separated value ("card,cash") or repeated params
 * (?methods=card&methods=cash). Blank items are dropped so a stray comma
 * is not a validation error; nothing at all means no filter. Anything
 * else is left as is for the validators to refuse.
 */
export function toQueryList(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== 'string') return value;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * A text query param, trimmed; blank means the filter is not set.
 * Anything else is left as is for the validators to refuse.
 */
export function toOptionalTrimmed(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}
