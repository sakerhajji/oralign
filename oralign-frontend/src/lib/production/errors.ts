import { classifyApiError } from '@/lib/api/error';
import { readProductionError } from '@/lib/api/production.service';
import { PRODUCTION_ERROR } from '@/lib/types/production';

export type Translate = (path: string, vars?: Record<string, string | number>) => string;

const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set(Object.values(PRODUCTION_ERROR));

/**
 * The line of a production refusal that carries a known `errorCode`
 * (`production.errors.<CODE>`: every value of PRODUCTION_ERROR, the shared
 * date codes included), or null when the error has none. The one mapping
 * of the technician screens and the admin desk; each adds its own fallback.
 */
export function productionErrorCodeText(t: Translate, error: unknown): string | null {
  const { errorCode } = readProductionError(error);
  return errorCode && KNOWN_ERROR_CODES.has(errorCode) ? t(`production.errors.${errorCode}`) : null;
}

/**
 * The sentence a production refusal shows on the technician screens. The
 * connection cases keep the shared classifier's copy (offline,
 * upstream…); a timeout on a write says it may have gone through, since
 * the retry with the same Idempotency-Key cannot double it. Only a write
 * falls back to "the entry could not be saved": a failed load saying so
 * would make her declare again what was already recorded.
 */
export function productionErrorText(
  t: Translate,
  error: unknown,
  { write = false }: { write?: boolean } = {},
): string {
  const known = productionErrorCodeText(t, error);
  if (known) return known;
  const classified = classifyApiError(error);
  switch (classified.kind) {
    case 'timeout':
      return write ? t('production.errors.maybeSaved') : classified.message;
    case 'offline':
    case 'network':
    case 'upstream':
    case 'throttled':
    case 'auth':
    case 'forbidden':
    case 'not_found':
      return classified.message;
    default:
      return write ? t('production.errors.generic') : classified.message;
  }
}
