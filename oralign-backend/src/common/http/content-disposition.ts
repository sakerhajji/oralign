/**
 * `Content-Disposition` of a file download: an ASCII `filename` every
 * client reads, and the RFC 5987 `filename*` that keeps accents for the
 * clients that understand it.
 */
export function attachmentDisposition(
  fileName: string,
  fallback = 'download',
): string {
  const asciiName =
    fileName
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .replace(/[^ -~]+/g, '_')
      .replace(/["\\]/g, '_')
      .slice(0, 120) || fallback;

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
