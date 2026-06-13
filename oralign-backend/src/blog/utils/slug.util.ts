/**
 * URL-slug generation for blog posts.
 *
 * Distinct from the media `slugifyForCode` helper used to build safe
 * on-disk filenames: this produces a human-readable URL segment
 * (`/blog/<slug>`), so it keeps lowercase ASCII words separated by
 * single hyphens and drops everything else.
 *
 * Steps:
 *   1. lowercase
 *   2. NFKD-normalise + strip combining diacritics (é → e, ñ → n)
 *   3. replace any run of non-alphanumeric chars with a single '-'
 *   4. collapse repeated '-' and trim leading/trailing '-'
 *
 * Returns '' for input that contains no alphanumerics — callers fall
 * back to a generated slug (e.g. the post id) in that case.
 */
export function slugify(input: string): string {
  if (!input) return '';
  return input
    .normalize('NFKD')
    // Strip combining marks left behind by NFKD (U+0300–U+036F).
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Anything that isn't a-z / 0-9 becomes a separator.
    .replace(/[^a-z0-9]+/g, '-')
    // Collapse + trim separators.
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}
