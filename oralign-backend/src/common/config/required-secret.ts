/**
 * Reads a required secret from `process.env`.
 *
 * - In production (`NODE_ENV === 'production'`) the value MUST be present,
 *   ≥ 32 characters, and not a known placeholder. We throw at startup so a
 *   misconfigured deploy fails loudly instead of silently signing tokens
 *   with a guessable key.
 * - In dev/test we warn instead of throw — convenient when running with
 *   the compose defaults, but the warning is hard to miss in logs.
 */
const PLACEHOLDER_PATTERN = /^(change[-_]?me|your[-_]?secret|secret|default|password|test|dev|placeholder)/i;
const MIN_LENGTH = 32;

export function requiredSecret(name: string): string {
  const raw = process.env[name]?.trim();
  const isProd = process.env.NODE_ENV === 'production';

  const fail = (reason: string): string => {
    const msg = `[security] ${name} ${reason}`;
    if (isProd) {
      // Loud, unambiguous failure — the container will refuse to start.
      throw new Error(msg);
    }
    // eslint-disable-next-line no-console
    console.warn(`${msg} (allowed in non-production)`);
    return raw ?? 'dev-only-insecure-fallback-please-set-env-vars';
  };

  if (!raw) return fail('is not set');
  if (raw.length < MIN_LENGTH)
    return fail(`is too short (${raw.length} chars; need ≥ ${MIN_LENGTH})`);
  if (PLACEHOLDER_PATTERN.test(raw))
    return fail('uses a known placeholder value');

  return raw;
}
