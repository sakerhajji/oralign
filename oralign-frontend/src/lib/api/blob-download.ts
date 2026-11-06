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
