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

/**
 * A boolean query param or multipart field, read from the RAW value: with
 * the global pipe's enableImplicitConversion, `value` has already been
 * through Boolean(), which turns the string "false" into true. Use it as
 * `@IsOptional() @Transform(rawBoolean) @IsBoolean()`. Absent or blank
 * means not set; anything but true/false is left for @IsBoolean to refuse.
 */
export function rawBoolean({
  obj,
  key,
}: {
  obj: unknown;
  key: string;
}): unknown {
  const raw = (obj as Record<string, unknown> | null | undefined)?.[key];
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (raw === true || raw === 'true') return true;
  if (raw === false || raw === 'false') return false;
  return raw;
}
