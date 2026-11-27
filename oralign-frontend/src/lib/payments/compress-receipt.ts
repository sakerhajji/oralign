/**
 * Bank-transfer receipts, prepared in the browser before they are sent
 * (DECISIONS §1, spec §1 + §9).
 *
 * The server takes JPEG, PNG, WebP or PDF, up to 10 MB, checked by their
 * first bytes (RECEIPT_TYPE / RECEIPT_TOO_LARGE otherwise). A phone photo
 * is 4-12 MB, so it is re-encoded here before the upload:
 *
 *   - photos: long edge about 2000 px, JPEG quality 0.82; a second pass at
 *     1600 px / 0.8 when the first stays heavy. Never below 0.8 and 1600 px:
 *     the lab must read the amount and the reference on the receipt;
 *   - a small photo that needs no resizing is sent as it is;
 *   - PDFs are never touched;
 *   - HEIC / HEIF (iPhone) and other pictures the browser can open are
 *     converted to JPEG; when the browser cannot decode them, the receipt
 *     is refused here, with words, instead of failing on the server;
 *   - every file leaves with the type and extension of what its bytes are,
 *     so a camera file named "image" is not refused for its name.
 *
 * The decode / encode steps go through an `ImageCodec`, so the rules are
 * tested in Node with a fake one (compress-receipt.test.mjs); the browser
 * codec uses createImageBitmap (EXIF orientation applied) or an <img>,
 * and a canvas.
 */

/** The server's limit, on the raw file (both flows). */
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
/** The long edge a photo is brought down to. */
export const RECEIPT_LONG_EDGE = 2000;
/** The floor of the second pass: never smaller. */
export const RECEIPT_MIN_LONG_EDGE = 1600;
export const RECEIPT_JPEG_QUALITY = 0.82;
/** The floor of the second pass: never lower. */
export const RECEIPT_MIN_JPEG_QUALITY = 0.8;
/** What a compressed photo aims for; also the size a photo may keep untouched. */
export const RECEIPT_TARGET_BYTES = 1.5 * 1024 * 1024;

/** The passes, lightest first; the first under RECEIPT_TARGET_BYTES wins. */
export const COMPRESSION_STEPS: ReadonlyArray<{ longEdge: number; quality: number }> = [
  { longEdge: RECEIPT_LONG_EDGE, quality: RECEIPT_JPEG_QUALITY },
  { longEdge: RECEIPT_MIN_LONG_EDGE, quality: RECEIPT_MIN_JPEG_QUALITY },
];

/**
 * `accept` of the "Choose a file" input: what the server takes, plus HEIC
 * (converted here). `capture` is never set on it, so phones offer the
 * gallery and the files app.
 */
export const RECEIPT_FILE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf';
/** `accept` of the "Take a photo" input, opened with capture="environment". */
export const RECEIPT_CAMERA_ACCEPT = 'image/*';

/**
 * What a file is: one of the four the server takes, a HEIC / HEIF photo,
 * another picture a browser may open (AVIF, GIF, BMP, TIFF), or nothing usable.
 */
export type ReceiptKind = 'jpeg' | 'png' | 'webp' | 'pdf' | 'heic' | 'image' | 'unsupported';

/** The four kinds that leave for the server. */
export type SentReceiptKind = 'jpeg' | 'png' | 'webp' | 'pdf';

/** Why a file is refused before any upload. */
export type ReceiptRefusal = 'empty' | 'type' | 'too_large' | 'heic_unsupported';

export interface PreparedReceipt {
  /** The file to send (re-encoded or the original, typed and named after its bytes). */
  file: File;
  kind: SentReceiptKind;
  /** Size of what the doctor picked. */
  originalBytes: number;
  /** Whether the picture was re-encoded here. */
  compressed: boolean;
}

export type PrepareResult =
  | { ok: true; receipt: PreparedReceipt }
  | { ok: false; reason: ReceiptRefusal };

/** A decoded picture. `source` is what a canvas draws (browser codec only). */
export interface DecodedImage {
  width: number;
  height: number;
  close(): void;
  source?: CanvasImageSource;
}

export interface ImageCodec {
  decode(blob: Blob): Promise<DecodedImage>;
  encodeJpeg(image: DecodedImage, width: number, height: number, quality: number): Promise<Blob>;
}

const MIME: Readonly<Record<SentReceiptKind, string>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

const EXTENSION: Readonly<Record<SentReceiptKind, string>> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  pdf: 'pdf',
};

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = '';
  for (let i = start; i < start + length && i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

/**
 * The kind a file's first bytes announce (the same signatures the server
 * checks), or null when they match none.
 */
export function sniffReceiptKind(head: Uint8Array): ReceiptKind | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (
    head.length >= 8 &&
    head[0] === 0x89 &&
    ascii(head, 1, 3) === 'PNG' &&
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a
  ) {
    return 'png';
  }
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP') return 'webp';
  if (ascii(head, 0, 5) === '%PDF-') return 'pdf';
  if (ascii(head, 4, 4) === 'ftyp') {
    const brand = ascii(head, 8, 4).toLowerCase();
    if (HEIC_BRANDS.has(brand)) return 'heic';
    if (AVIF_BRANDS.has(brand)) return 'image';
    return null;
  }
  const gif = ascii(head, 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image';
  if (ascii(head, 0, 2) === 'BM') return 'image';
  if (
    (head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a && head[3] === 0x00) ||
    (head[0] === 0x4d && head[1] === 0x4d && head[2] === 0x00 && head[3] === 0x2a)
  ) {
    return 'image';
  }
  return null;
}

/** The kind a file claims, by its type then its extension. */
export function declaredReceiptKind(file: { name: string; type: string }): ReceiptKind {
  const type = file.type.split(';', 1)[0].trim().toLowerCase();
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
  if (type === 'image/jpeg' || type === 'image/jpg' || ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (type === 'image/png' || ext === 'png') return 'png';
  if (type === 'image/webp' || ext === 'webp') return 'webp';
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (type === 'image/heic' || type === 'image/heif' || ext === 'heic' || ext === 'heif') return 'heic';
  if (type.startsWith('image/')) return 'image';
  return 'unsupported';
}

/**
 * The kind to treat a file as: its bytes decide. A file whose bytes are
 * unknown is usable only as a picture to convert (a browser may still open
 * it), never as one of the four the server checks.
 */
export function resolveReceiptKind(sniffed: ReceiptKind | null, declared: ReceiptKind): ReceiptKind {
  if (sniffed) return sniffed;
  return declared === 'heic' || declared === 'image' ? declared : 'unsupported';
}

/** The size that fits `longEdge` (never enlarged), rounded to whole pixels. */
export function scaledSize(
  width: number,
  height: number,
  longEdge: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (!(long > longEdge)) return { width, height };
  const ratio = longEdge / long;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** The file name without its extension, or a neutral one. */
export function receiptBaseName(name: string): string {
  const base = name.replace(/\.[^./\\]*$/, '').trim();
  return base.length > 0 ? base : 'recu-virement';
}

/** `file`'s bytes, typed and named as `kind`. */
function asKind(file: Blob & { name?: string; lastModified?: number }, kind: SentReceiptKind): File {
  const name = `${receiptBaseName(file.name ?? '')}.${EXTENSION[kind]}`;
  return new File([file], name, { type: MIME[kind], lastModified: file.lastModified ?? Date.now() });
}

async function readHead(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 32).arrayBuffer());
}

function refuse(reason: ReceiptRefusal): PrepareResult {
  return { ok: false, reason };
}

function accept(file: File, kind: SentReceiptKind, originalBytes: number, compressed: boolean): PrepareResult {
  return { ok: true, receipt: { file, kind, originalBytes, compressed } };
}

/**
 * Re-encode `image` along COMPRESSION_STEPS: the first result under
 * RECEIPT_TARGET_BYTES, else the smallest one.
 */
async function encodeAlongSteps(codec: ImageCodec, image: DecodedImage): Promise<Blob> {
  let best: Blob | null = null;
  for (const step of COMPRESSION_STEPS) {
    const size = scaledSize(image.width, image.height, step.longEdge);
    const blob = await codec.encodeJpeg(image, size.width, size.height, step.quality);
    if (!best || blob.size < best.size) best = blob;
    if (blob.size <= RECEIPT_TARGET_BYTES) break;
  }
  // COMPRESSION_STEPS is never empty.
  return best as Blob;
}

/**
 * Turn what the doctor picked into the file to upload, or say why it
 * cannot be sent. Never throws: a codec failure on a type the server
 * takes falls back to the original file (the server judges it).
 */
export async function prepareReceipt(
  file: File,
  codec: ImageCodec | null = browserImageCodec(),
): Promise<PrepareResult> {
  if (file.size === 0) return refuse('empty');
  let sniffed: ReceiptKind | null = null;
  try {
    sniffed = sniffReceiptKind(await readHead(file));
  } catch {
    sniffed = null;
  }
  const kind = resolveReceiptKind(sniffed, declaredReceiptKind(file));
  const original = file.size;

  if (kind === 'unsupported') return refuse('type');

  if (kind === 'pdf') {
    if (original > RECEIPT_MAX_BYTES) return refuse('too_large');
    return accept(asKind(file, 'pdf'), 'pdf', original, false);
  }

  const convertOnly = kind === 'heic' || kind === 'image';
  const passThrough = (): PrepareResult => {
    if (convertOnly) return refuse(kind === 'heic' ? 'heic_unsupported' : 'type');
    if (original > RECEIPT_MAX_BYTES) return refuse('too_large');
    return accept(asKind(file, kind), kind, original, false);
  };

  if (!codec) return passThrough();

  let image: DecodedImage;
  try {
    image = await codec.decode(file);
  } catch {
    return passThrough();
  }

  try {
    const needsResize = Math.max(image.width, image.height) > RECEIPT_LONG_EDGE;
    if (!convertOnly && !needsResize && original <= RECEIPT_TARGET_BYTES) {
      return accept(asKind(file, kind), kind, original, false);
    }
    let encoded: Blob;
    try {
      encoded = await encodeAlongSteps(codec, image);
    } catch {
      return passThrough();
    }
    // Re-encoding a picture that needed no resizing must earn its place.
    if (!convertOnly && !needsResize && encoded.size >= original) {
      return passThrough();
    }
    if (encoded.size > RECEIPT_MAX_BYTES) {
      return convertOnly || original > RECEIPT_MAX_BYTES ? refuse('too_large') : passThrough();
    }
    const out = new File([encoded], `${receiptBaseName(file.name)}.jpg`, {
      type: MIME.jpeg,
      lastModified: file.lastModified || Date.now(),
    });
    return accept(out, 'jpeg', original, true);
  } finally {
    image.close();
  }
}

// ─── Browser codec ──────────────────────────────────────────────────────

async function decodeWithBitmap(blob: Blob): Promise<DecodedImage> {
  let bitmap: ImageBitmap;
  try {
    // Turn the photo upright from its EXIF orientation, like an <img>.
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await createImageBitmap(blob);
  }
  return {
    width: bitmap.width,
    height: bitmap.height,
    source: bitmap,
    close: () => bitmap.close(),
  };
}

/** Safari opens HEIC in an <img> where createImageBitmap may refuse it. */
function decodeWithImageElement(blob: Blob): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        source: img,
        close: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    img.src = url;
  });
}

/** The codec of this browser, or null where there is none (server render, old engine). */
export function browserImageCodec(): ImageCodec | null {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return null;
  return {
    async decode(blob) {
      if (typeof createImageBitmap === 'function') {
        try {
          return await decodeWithBitmap(blob);
        } catch {
          // fall through to the <img> path
        }
      }
      return decodeWithImageElement(blob);
    },
    encodeJpeg(image, width, height, quality) {
      return new Promise((resolve, reject) => {
        if (!image.source) {
          reject(new Error('encode'));
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('encode'));
          return;
        }
        // A transparent PNG would turn black in a JPEG: paper white.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.imageSmoothingQuality = 'high';
        context.drawImage(image.source, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            // Free the canvas memory at once (iOS keeps it otherwise).
            canvas.width = 0;
            canvas.height = 0;
            if (blob) resolve(blob);
            else reject(new Error('encode'));
          },
          'image/jpeg',
          quality,
        );
      });
    },
  };
}
