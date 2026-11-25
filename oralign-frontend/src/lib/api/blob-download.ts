/**
 * Files the API sends behind the JWT (PDFs, exports). `<a href>` cannot
 * fetch them: the request would reach the API without the Authorization
 * header and bounce on the JwtAuthGuard. The client fetches the bytes
 * (`responseType: 'blob'`) and these helpers name, save or surface them.
 */

/**
 * The file name the server gave in `Content-Disposition`: the RFC 5987
 * `filename*=UTF-8''…` wins over the ASCII fallback, so an accented
 * name survives the round trip.
 */
export function fileNameFromHeaders(
  headers: Record<string, unknown>,
  fallbackName: string,
): string {
  const disposition = String(
    headers['content-disposition'] ?? headers['Content-Disposition'] ?? '',
  );
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  let name = fallbackName;
  if (utf8) {
    try {
      name = decodeURIComponent(utf8[1]);
    } catch {
      name = plain?.[1] ?? fallbackName;
    }
  } else if (plain) {
    name = plain[1];
  }
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

// ─── Blob URLs for display ──────────────────────────────────────────

/**
 * A blob URL lives on the app's origin, and the type the server sends with
 * an uploaded file is the uploader's word (a file named `photo` can claim
 * image/svg+xml or text/html). Opened in a tab ("Open image in new tab", a
 * chat attachment), an SVG, HTML or XML blob would run its own script with
 * the session in reach. So a blob shown or opened from a server response
 * keeps its type only when that type cannot do that.
 */
const RASTER_IMAGE_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

/**
 * `image`: pictures only (an `<img>`, or a tab opened on a picture).
 * `viewer`: the order file viewer, which also frames PDFs and plays videos;
 * the browser's PDF viewer and a `<video>` never run the file's script on
 * the app's origin.
 */
export type DisplayBlobKind = 'image' | 'viewer';

/** A MIME type's essence: lower case, without parameters. */
function mimeEssence(type: string | null | undefined): string {
  return (type ?? '').split(';', 1)[0].trim().toLowerCase();
}

/** Whether a blob of this type may keep it for `kind`. */
export function keepsDisplayType(
  type: string | null | undefined,
  kind: DisplayBlobKind = 'image',
): boolean {
  const essence = mimeEssence(type);
  if (RASTER_IMAGE_TYPES.has(essence)) return true;
  return (
    kind === 'viewer' &&
    (essence === 'application/pdf' || /^video\/[a-z0-9.+-]+$/.test(essence))
  );
}

/**
 * The blob to hand `URL.createObjectURL` for a server response that will be
 * shown or opened: any type `kind` does not allow becomes an opaque
 * octet-stream. An `<img>` or `<video>` still decodes it by sniffing the
 * bytes; a tab only downloads it.
 */
export function inertBlob(blob: Blob, kind: DisplayBlobKind = 'image'): Blob {
  return keepsDisplayType(blob.type, kind)
    ? blob
    : new Blob([blob], { type: 'application/octet-stream' });
}

/** Trigger the browser's download of `blob` under `fileName`. */
export function saveBlobAs(blob: Blob, fileName: string): void {
  const url = window.URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    // Some browsers only honour a programmatic click on a mounted node.
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoked on the next tick: Safari reads the URL after click() returns.
    window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  }
}

/** Download an authenticated response under the name the server gave it. */
export function saveBlob(
  blob: Blob,
  fallbackName: string,
  headers: Record<string, unknown>,
): void {
  saveBlobAs(blob, fileNameFromHeaders(headers, fallbackName));
}

export function asBlob(data: unknown, type: string): Blob {
  return data instanceof Blob ? data : new Blob([data as BlobPart], { type });
}

/**
 * An error thrown on a `responseType: 'blob'` request carries its JSON
 * body as a Blob, so the usual message extraction reads empty. Unwrap it
 * so the server's explanation (and its errorCode) still reach the UI.
 */
export async function blobError(error: unknown, fallback: string): Promise<Error> {
  const response = (error as { response?: { data?: unknown } })?.response;
  if (response?.data instanceof Blob) {
    try {
      const text = await response.data.text();
      const parsed = JSON.parse(text) as {
        message?: string | string[];
        errorCode?: string;
      };
      const message = Array.isArray(parsed.message) ? parsed.message[0] : parsed.message;
      if (message) {
        return Object.assign(new Error(message), { errorCode: parsed.errorCode });
      }
    } catch {
      // Not JSON — fall through to the generic message.
    }
  }
  return error instanceof Error ? error : new Error(fallback);
}
