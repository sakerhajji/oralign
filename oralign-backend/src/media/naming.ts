/**
 * Clean, ordered, meaningful filenames for uploads.
 *
 * Target shape: `<Patient>_<Category>_<NNN>.<ext>` — e.g.
 * `Marie-Dupont_front-photo_003.jpg`. The original client filename is
 * always preserved in the DB (`originalName`); the generated name is
 * what lands on disk and what downloads are saved as, so the lab/admin
 * sees an ordered, self-describing set instead of `IMG_4821 (3).jpeg`.
 */

/**
 * Sanitize one name segment for filesystem + URL safety:
 * accents folded (é→e), anything outside [A-Za-z0-9-] collapsed to a
 * single hyphen, trimmed, length-capped. May return '' for inputs that
 * carry no usable characters (e.g. purely Arabic names) — callers must
 * provide a fallback segment.
 */
export function sanitizeNamePart(input: string | null | undefined, maxLen = 40): string {
  if (!input) return '';
  return (
    input
      .normalize('NFKD')
      // Strip combining diacritical marks left behind by NFKD.
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, maxLen)
      .replace(/-$/, '')
  );
}

/**
 * `Part_Part_007.ext` — parts joined by underscores (each part is
 * internally hyphenated by sanitizeNamePart, so `_` cleanly separates
 * the semantic fields), 3-digit zero-padded sequence, lowercased
 * extension. Empty parts are dropped.
 */
export function buildSequentialName(
  parts: Array<string | null | undefined>,
  seq: number,
  ext: string,
): string {
  const cleanParts = parts
    .map((p) => sanitizeNamePart(p))
    .filter((p) => p.length > 0);
  if (cleanParts.length === 0) cleanParts.push('file');
  const safeExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  const seqStr = String(Math.max(1, seq)).padStart(3, '0');
  return `${cleanParts.join('_')}_${seqStr}${safeExt}`;
}

/** Filename stem (no extension) — used as the variant-file base name. */
export function stemOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}
