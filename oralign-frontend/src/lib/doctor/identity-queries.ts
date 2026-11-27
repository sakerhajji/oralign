/**
 * Which cached queries show a doctor's LIVE identity (spec §6: name,
 * photo, practice, contact), so a profile or clinic save can refresh them
 * all at once instead of leaving them stale for the 5-minute staleTime.
 *
 * The roots themselves are the query-key factories' `all` keys, listed by
 * `lib/hooks/use-dentist-profiles.ts` (DOCTOR_IDENTITY_QUERY_ROOTS); this
 * module only holds the matching rule, pure so `node --test` covers it.
 *
 * Documents are snapshots (a devis or a facture keeps the identity it was
 * issued with), so their rendered bytes are skipped: refetching a PDF can
 * never show a newer name and only costs a render.
 */

/** Key segments of rendered documents under the identity roots. */
export const DOCUMENT_QUERY_SEGMENTS: readonly string[] = [
  'invoice-pdf',
  'treatment-fee-invoice-pdf',
  'document',
];

/** Whether `root` is a prefix of `queryKey` (element-wise, like TanStack's partial match). */
export function startsWithRoot(
  queryKey: readonly unknown[],
  root: readonly unknown[],
): boolean {
  if (root.length === 0 || root.length > queryKey.length) return false;
  return root.every((part, index) => Object.is(part, queryKey[index]));
}

/**
 * True when the query sits under one of `roots` and is not a rendered
 * document (no segment of `skipSegments`).
 */
export function showsDoctorIdentity(
  queryKey: readonly unknown[],
  roots: readonly (readonly unknown[])[],
  skipSegments: readonly string[] = DOCUMENT_QUERY_SEGMENTS,
): boolean {
  if (!roots.some((root) => startsWithRoot(queryKey, root))) return false;
  return !queryKey.some(
    (part) => typeof part === 'string' && skipSegments.includes(part),
  );
}
