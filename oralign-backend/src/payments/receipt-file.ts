import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  mixin,
  type NestInterceptor,
  PayloadTooLargeException,
  type Type,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import * as path from 'path';
import { pipeline } from 'stream';
import type { Response } from 'express';
import type { Observable } from 'rxjs';
import { BadRequestException } from '../common/exceptions/app.exception';
import { TRANSFER_ERROR } from '../common/exceptions/domain-error-codes';
import { scanUploadContent } from '../media/file-security';

/**
 * Bank-transfer receipts (spec §1, DECISIONS §1 "Files"), for BOTH flows:
 * pack installments (Payment.proofUrl) and treatment fees
 * (DentalOrder.treatmentFeeProofPath). One module so the two flows accept,
 * store and serve a receipt exactly alike:
 *
 *   1. multer keeps the upload in memory (ReceiptFileInterceptor), capped
 *      at 10 MB raw, an oversize answering 400 RECEIPT_TOO_LARGE;
 *   2. the service authorises the caller and checks the state FIRST;
 *   3. assertReceiptFile: JPEG / PNG / WebP / PDF by magic bytes, the
 *      declared type and extension within that allow-list, then the shared
 *      content scanner (scanUploadContent), else 400 RECEIPT_TYPE (HEIC
 *      included: the browser converts it, or refuses it inline);
 *   4. writeReceiptFile under uploads/orders/<orderId>/payment-proofs/
 *      <uuid>.<ext>, named after the REAL type, never the client's name;
 *   5. the caller unlinks it (removeReceiptFile) when its DB write fails.
 *
 * Receipts are private: uploads/orders/** is never served by the static
 * mount (common/http/private-uploads.ts, which also covers the legacy
 * payments/ and treatment-fee-proofs/ folders). They are read only through
 * the authenticated streams (openReceipt + sendReceipt). Paths never reach
 * logs or audit metadata.
 */

/** 10 MB raw, on both flows (the client compresses photos well below). */
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

/** The uploads root every stored path is relative to. */
export const RECEIPT_UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

/** The folder of an order's receipts, below the uploads root. */
export const RECEIPT_ORDER_SUBDIR = 'payment-proofs';

/** The four accepted kinds. */
export type ReceiptKindName = 'jpeg' | 'png' | 'webp' | 'pdf';

export interface ReceiptKind {
  kind: ReceiptKindName;
  /** Extension the file is stored with (no dot). */
  ext: string;
  mime: string;
}

const KINDS: Record<ReceiptKindName, ReceiptKind> = {
  jpeg: { kind: 'jpeg', ext: 'jpg', mime: 'image/jpeg' },
  png: { kind: 'png', ext: 'png', mime: 'image/png' },
  webp: { kind: 'webp', ext: 'webp', mime: 'image/webp' },
  pdf: { kind: 'pdf', ext: 'pdf', mime: 'application/pdf' },
};

/** Client extensions accepted (lower case, with the dot). */
const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.jpg',
  '.jpeg',
  '.jfif',
  '.pjpeg',
  '.png',
  '.webp',
  '.pdf',
]);

/** Client content types accepted; octet-stream / empty = not declared. */
const ALLOWED_MIMES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const UNDECLARED_MIMES: ReadonlySet<string> = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
]);

/** What multer hands over with memoryStorage (the fields this module reads). */
export interface ReceiptUpload {
  buffer: Buffer;
  size: number;
  originalname?: string;
  mimetype?: string;
}

function startsWithBytes(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((byte, i) => buf[offset + i] === byte);
}

function asciiAt(buf: Buffer, text: string, offset: number): boolean {
  if (buf.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (buf[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * The receipt kind its leading bytes prove, or null: JPEG `FF D8 FF`, PNG
 * `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF....WEBP`, PDF `%PDF-`. Anything
 * else (HEIC `....ftypheic`, GIF, SVG, HTML, an executable) is null.
 */
export function detectReceiptKind(buf: Buffer): ReceiptKind | null {
  if (startsWithBytes(buf, [0xff, 0xd8, 0xff])) return KINDS.jpeg;
  if (startsWithBytes(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return KINDS.png;
  }
  if (asciiAt(buf, 'RIFF', 0) && asciiAt(buf, 'WEBP', 8)) return KINDS.webp;
  if (asciiAt(buf, '%PDF-', 0)) return KINDS.pdf;
  return null;
}

function extensionOf(name: string | undefined): string {
  if (!name) return '';
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

export function receiptTypeRefused(): BadRequestException {
  return new BadRequestException(
    'Le reçu doit être une image JPEG, PNG ou WebP, ou un PDF.',
    TRANSFER_ERROR.RECEIPT_TYPE,
  );
}

export function receiptTooLarge(): BadRequestException {
  return new BadRequestException(
    'Le reçu dépasse 10 Mo.',
    TRANSFER_ERROR.RECEIPT_TOO_LARGE,
  );
}

/**
 * The receipt's real kind, or a 400 with a stable code (never a 500):
 * RECEIPT_TOO_LARGE over 10 MB; RECEIPT_TYPE when the bytes are not one of
 * the four kinds, when the declared type or extension names a type outside
 * the allow-list (a `.heic`, an `.svg`, `text/html`), or when the shared
 * content scanner refuses it. A declared type inside the allow-list that
 * differs from the bytes (a PNG named `.jpg`) is accepted: the file is
 * stored under its REAL type.
 */
export async function assertReceiptFile(
  file: ReceiptUpload,
): Promise<ReceiptKind> {
  const buffer = file.buffer;
  if (!buffer || buffer.length === 0) throw receiptTypeRefused();
  if (buffer.length > RECEIPT_MAX_BYTES || file.size > RECEIPT_MAX_BYTES) {
    throw receiptTooLarge();
  }
  const kind = detectReceiptKind(buffer);
  if (!kind) throw receiptTypeRefused();

  const ext = extensionOf(file.originalname);
  if (ext && !ALLOWED_EXTENSIONS.has(ext)) throw receiptTypeRefused();
  const mime = (file.mimetype ?? '').trim().toLowerCase();
  if (!UNDECLARED_MIMES.has(mime) && !ALLOWED_MIMES.has(mime)) {
    throw receiptTypeRefused();
  }

  // The shared scanner, under the canonical name of the real type: it
  // re-checks the magic for that extension and refuses an executable or a
  // script signature.
  const verdict = await scanUploadContent({
    originalname: `receipt.${kind.ext}`,
    buffer,
    mimetype: kind.mime,
  });
  if (!verdict.safe) throw receiptTypeRefused();
  return kind;
}

/** Ids stored in a path are uuids: no separator, no dot. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Write a checked receipt as uploads/orders/<orderId>/payment-proofs/
 * <uuid>.<ext> and return the stored path (`/uploads/...`, the shape the
 * columns already hold). Called only after authorisation, the state checks
 * and assertReceiptFile; never overwrites (flag wx).
 */
export async function writeReceiptFile(
  orderId: string,
  buffer: Buffer,
  kind: ReceiptKind,
): Promise<string> {
  if (!SAFE_ID.test(orderId)) {
    throw new BadRequestException('Invalid order id for a receipt.');
  }
  const relative = path.posix.join(
    'orders',
    orderId,
    RECEIPT_ORDER_SUBDIR,
    `${randomUUID()}.${kind.ext}`,
  );
  const absolute = path.join(RECEIPT_UPLOAD_ROOT, ...relative.split('/'));
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, buffer, { flag: 'wx' });
  return `/uploads/${relative}`;
}

/**
 * The stored shapes a receipt path may have, below the uploads root:
 *   payments/<uuid>.<ext>                       legacy installment receipts
 *   treatment-fee-proofs/<ms>-<sanitised name>  legacy treatment-fee receipts
 *   orders/<orderId>/payment-proofs/<uuid>.<ext> from 2026-11-27
 */
const STORED_SHAPES: readonly RegExp[] = [
  /^payments\/[A-Za-z0-9_-][\w.-]{0,199}$/,
  /^treatment-fee-proofs\/[A-Za-z0-9_-][\w.-]{0,254}$/,
  /^orders\/[A-Za-z0-9_-]{1,64}\/payment-proofs\/[A-Za-z0-9_-][\w.-]{0,199}$/,
];

/**
 * The absolute path of a stored receipt, or null when the value is not one
 * of the receipt shapes or would leave the uploads root (a corrupt or
 * hostile row never reads, nor deletes, anything else).
 */
export function resolveReceiptPath(stored: unknown): string | null {
  if (typeof stored !== 'string' || stored.length > 400) return null;
  if (stored.includes('\0') || stored.includes('\\')) return null;
  const relative = stored.replace(/^\/?uploads\//, '');
  if (relative === stored && stored.startsWith('/')) return null;
  if (
    relative.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    return null;
  }
  if (!STORED_SHAPES.some((shape) => shape.test(relative))) return null;
  const root = path.resolve(RECEIPT_UPLOAD_ROOT);
  const absolute = path.resolve(root, ...relative.split('/'));
  return absolute.startsWith(root + path.sep) ? absolute : null;
}

/** Best-effort unlink of a receipt this request wrote; never throws. */
export async function removeReceiptFile(stored: string | null): Promise<void> {
  const absolute = resolveReceiptPath(stored);
  if (!absolute) return;
  try {
    await fs.unlink(absolute);
  } catch {
    return;
  }
}

/** Content type of a stored receipt, from the extension it was stored with. */
export function receiptContentType(absolutePath: string): string {
  switch (path.extname(absolutePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
    case '.jfif':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.pdf':
      return 'application/pdf';
    // Legacy installment receipts (before 2026-11-27) accepted HEIC.
    case '.heic':
      return 'image/heic';
    default:
      return 'application/octet-stream';
  }
}

/** A receipt ready to stream. */
export interface OpenedReceipt {
  absolutePath: string;
  contentType: string;
  size: number;
  /** Extension, no dot ('' when none). */
  extension: string;
}

/** The stored receipt when it exists on disk as a regular file, else null. */
export async function openReceipt(
  stored: unknown,
): Promise<OpenedReceipt | null> {
  const absolutePath = resolveReceiptPath(stored);
  if (!absolutePath) return null;
  try {
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) return null;
    return {
      absolutePath,
      contentType: receiptContentType(absolutePath),
      size: stat.size,
      extension: path.extname(absolutePath).slice(1).toLowerCase(),
    };
  } catch {
    return null;
  }
}

/** A download name made of safe ASCII only (an order code, a number). */
function safeBaseName(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'recu'
  );
}

/**
 * Stream a receipt with the private headers of the contract: its stored
 * type, nosniff, `private, no-store` (a receipt never sits in a shared or
 * disk cache) and an inline disposition. Images also get the sandbox CSP
 * of stored files; PDFs only refuse framing, because the browser's PDF
 * viewer refuses a sandboxed document (the rule of the /uploads mount in
 * main.ts). Screens read the stream as an authenticated blob.
 */
export function sendReceipt(
  res: Response,
  receipt: OpenedReceipt,
  baseName: string,
): void {
  const fileName = receipt.extension
    ? `${safeBaseName(baseName)}.${receipt.extension}`
    : safeBaseName(baseName);
  res.setHeader('Content-Type', receipt.contentType);
  res.setHeader('Content-Length', String(receipt.size));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  res.setHeader(
    'Content-Security-Policy',
    receipt.contentType === 'application/pdf'
      ? "frame-ancestors 'none'"
      : "default-src 'none'; sandbox",
  );
  res.status(200);
  // pipeline, not pipe: a client that leaves mid-transfer destroys the
  // file stream instead of leaving its descriptor open.
  pipeline(createReadStream(receipt.absolutePath), res, () => undefined);
}

/** multer limits of a receipt upload: one file, a few short text fields. */
export const RECEIPT_MULTER_OPTIONS = {
  limits: {
    fileSize: RECEIPT_MAX_BYTES,
    files: 1,
    fields: 12,
    fieldSize: 8 * 1024,
    parts: 14,
  },
} as const;

/** multer's 413 (LIMIT_FILE_SIZE) as the contract's stable 400. */
export function toReceiptUploadError(error: unknown): unknown {
  return error instanceof PayloadTooLargeException ? receiptTooLarge() : error;
}

/**
 * FileInterceptor for a receipt field: memoryStorage (nothing touches the
 * disk before the service has authorised the caller and checked the
 * bytes), RECEIPT_MULTER_OPTIONS, and an oversize answered 400
 * RECEIPT_TOO_LARGE instead of multer's 413.
 */
export function ReceiptFileInterceptor(
  fieldName: string,
): Type<NestInterceptor> {
  const Inner = FileInterceptor(fieldName, RECEIPT_MULTER_OPTIONS);

  @Injectable()
  class ReceiptInterceptor implements NestInterceptor {
    private readonly inner: NestInterceptor = new Inner();

    async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<unknown>> {
      try {
        return (await this.inner.intercept(
          context,
          next,
        )) as Observable<unknown>;
      } catch (error) {
        throw toReceiptUploadError(error);
      }
    }
  }

  return mixin(ReceiptInterceptor);
}
