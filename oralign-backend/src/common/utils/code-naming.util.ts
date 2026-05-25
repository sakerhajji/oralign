/**
 * Shared helpers for building human-readable codes (order codes and
 * quotation numbers) out of a patient name + date.
 *
 * Output is ASCII-only, URL-safe, and ≤ 40 chars on the slug so the
 * resulting codes survive being pasted into shell scripts, file
 * names, and PDF Title metadata without further escaping.
 *
 * Examples
 * --------
 *   slugifyForCode('  Foulen   Ben Foulen ') => 'Foulen_Ben_Foulen'
 *   slugifyForCode('Élise  D’Étoile')        => 'Elise_DEtoile'
 *   slugifyForCode('محمد')                    => ''      // non-Latin → caller falls back
 *   formatDateStamp(new Date(2026, 4, 23))    => '20260523'
 */

/**
 * Build a filename-safe slug from a free-text name. Falls back to an
 * empty string when nothing survives — callers should `if (!slug)`
 * and use a date-only stem so we never emit a bare `_YYYYMMDD`.
 */
export function slugifyForCode(input: string | null | undefined): string {
  if (!input) return '';
  // 1. Normalize accents away (é → e, ñ → n, etc.) so the slug stays
  //    ASCII without forcing the doctor to drop diacritics.
  const stripped = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
  // 2. Drop anything that isn't ASCII letters / digits / underscore /
  //    space / hyphen, then collapse remaining whitespace + hyphens
  //    into underscores so words stay separable but the slug carries
  //    no special punctuation.
  const cleaned = stripped
    .replace(/[^A-Za-z0-9 _-]+/g, '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  // Cap at 40 chars so the eventual code stays within sensible
  // filename + URL limits without truncating mid-character.
  return cleaned.slice(0, 40);
}

/** YYYYMMDD in UTC — matches the date the audit trail records. */
export function formatDateStamp(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}
