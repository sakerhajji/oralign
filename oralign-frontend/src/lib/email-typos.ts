/**
 * "Did you mean …?" for mistyped email domains (sakerdev13@gamil.com →
 * …@gmail.com). A typo'd domain still passes format validation, so the
 * account is created, the code goes nowhere and verification later fails
 * with "User not found" — catching it at the field is the fix.
 *
 * Suggests only when the domain is 1–2 edits (insert, delete, substitute or
 * swap two neighbours; one edit for short domains) away from a common
 * provider and is not itself one.
 */

const COMMON_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.fr',
  'hotmail.com',
  'hotmail.fr',
  'outlook.com',
  'outlook.fr',
  'live.com',
  'live.fr',
  'icloud.com',
  'me.com',
  'msn.com',
  'aol.com',
  'orange.fr',
  // Real providers close to the ones above: known, so never "corrected".
  'ymail.com',
  'gmx.com',
  'gmx.fr',
  'mail.com',
  'free.fr',
  'sfr.fr',
  'laposte.net',
  'proton.me',
  'protonmail.com',
  'topnet.tn',
  'planet.tn',
  'gnet.tn',
];

/** Optimal string alignment distance (Levenshtein + adjacent swaps). */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** The corrected address, or null when the domain looks right. */
export function suggestEmail(email: string): string | null {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (COMMON_DOMAINS.includes(domain)) return null;

  // Short domains get one edit only: two edits away from "me.com" or
  // "gnet.tn" covers too many real addresses.
  const maxDistance = domain.length <= 8 ? 1 : 2;
  let best: { domain: string; distance: number } | null = null;
  for (const candidate of COMMON_DOMAINS) {
    const distance = editDistance(domain, candidate);
    if (distance <= maxDistance && (!best || distance < best.distance)) {
      best = { domain: candidate, distance };
    }
  }
  return best ? `${local}@${best.domain}` : null;
}
