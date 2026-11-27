/**
 * Idempotency keys of the transfer declarations (CONTRACT §0): the
 * `Idempotency-Key` header of the installment declaration and of the
 * treatment-fee receipt upload, 8-128 characters of [A-Za-z0-9_-]. One
 * key per declaration INTENT (this receipt, for this payment): its retries
 * reuse it, so a request that reached the server before the connection
 * dropped is answered with the row it created, never declared twice. A
 * new receipt, or a key the server refused, takes a new key.
 */

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function isValidIdempotencyKey(key: unknown): key is string {
  return typeof key === 'string' && KEY_PATTERN.test(key);
}

/** A fresh random key (a UUID where the browser has one). */
export function newIdempotencyKey(): string {
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The key of one installment within a multi-installment declaration ("all
 * remaining"): each installment is its own target, so each gets its own
 * key, derived from the intent's base key so a retry of the batch reuses
 * them all.
 */
export function installmentIdempotencyKey(baseKey: string, installmentNumber: number): string {
  const key = `${baseKey}-i${installmentNumber}`;
  return key.length <= 128 ? key : key.slice(key.length - 128);
}
