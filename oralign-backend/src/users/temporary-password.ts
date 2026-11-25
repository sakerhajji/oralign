import { randomInt } from 'crypto';

/**
 * Temporary passwords an admin hands over by hand (POST users with
 * generateTemporaryPassword, POST users/:id/temporary-password, the demo
 * technician script). Read off a screen and typed on a lab tablet, so the
 * alphabet drops every look-alike: 0 O o, 1 I i l.
 *
 * Crypto RNG only (randomInt), never Math.random. 14 characters over 55
 * symbols ≈ 80 bits; one of each class is guaranteed so any future
 * composition rule holds. The value is returned ONCE to the caller: never
 * log it, store it in clear, or e-mail it.
 */
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const ALPHABET = UPPER + LOWER + DIGITS;

export const TEMPORARY_PASSWORD_LENGTH = 14;

const pick = (set: string) => set[randomInt(set.length)];

export function generateTemporaryPassword(
  length: number = TEMPORARY_PASSWORD_LENGTH,
): string {
  const size = Math.max(length, TEMPORARY_PASSWORD_LENGTH);
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (chars.length < size) chars.push(pick(ALPHABET));
  // Fisher-Yates, so the guaranteed classes do not sit at fixed positions.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
