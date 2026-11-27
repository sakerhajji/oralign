import { PayloadTooLargeException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import type { Response } from 'express';
import type * as ReceiptFileModule from './receipt-file';
import {
  assertReceiptFile,
  detectReceiptKind,
  RECEIPT_MAX_BYTES,
  receiptContentType,
  resolveReceiptPath,
  RECEIPT_UPLOAD_ROOT,
  toReceiptUploadError,
} from './receipt-file';

const pad = (head: Buffer, size = 64) =>
  Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length), 0x20)]);

const JPEG = pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]));
const PNG = pad(
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]),
);
const WEBP = pad(
  Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x24, 0, 0, 0]),
    Buffer.from('WEBPVP8 '),
  ]),
);
const PDF = pad(Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n'));
const HEIC = pad(
  Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic')]),
);

const upload = (
  buffer: Buffer,
  originalname?: string,
  mimetype?: string,
): ReceiptFileModule.ReceiptUpload => ({
  buffer,
  size: buffer.length,
  originalname,
  mimetype,
});

const refusedType = { statusCode: 400, errorCode: 'RECEIPT_TYPE' };

describe('detectReceiptKind (magic bytes)', () => {
  it.each([
    ['JPEG', JPEG, 'jpeg'],
    ['PNG', PNG, 'png'],
    ['WebP', WEBP, 'webp'],
    ['PDF', PDF, 'pdf'],
  ])('%s is recognised', (_l, buffer, kind) => {
    expect(detectReceiptKind(buffer)?.kind).toBe(kind);
  });

  it.each([
    ['HEIC', HEIC],
    ['GIF', pad(Buffer.from('GIF89a'))],
    ['SVG', pad(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))],
    ['HTML', pad(Buffer.from('<!doctype html><script>x</script>'))],
    ['a Windows executable', pad(Buffer.from('MZ\x90\x00'))],
    [
      'RIFF that is not WebP (AVI)',
      pad(Buffer.from('RIFF\x00\x00\x00\x00AVI ')),
    ],
    ['nothing', Buffer.alloc(0)],
  ])('%s is not a receipt kind', (_l, buffer) => {
    expect(detectReceiptKind(buffer)).toBeNull();
  });
});

describe('assertReceiptFile (stable 400 codes, never a 500)', () => {
  it.each([
    ['a JPEG photo', upload(JPEG, 'IMG_0001.JPG', 'image/jpeg'), 'jpg'],
    ['a PNG screenshot', upload(PNG, 'capture.png', 'image/png'), 'png'],
    ['a WebP image', upload(WEBP, 'recu.webp', 'image/webp'), 'webp'],
    ['a bank PDF', upload(PDF, 'releve.pdf', 'application/pdf'), 'pdf'],
    ['a compressed blob without a name', upload(JPEG), 'jpg'],
    [
      'a type the browser could not tell',
      upload(PDF, 'recu', 'application/octet-stream'),
      'pdf',
    ],
  ])('accepts %s, stored as .%s', async (_l, file, ext) => {
    await expect(assertReceiptFile(file)).resolves.toMatchObject({ ext });
  });

  it('stores a PNG named .jpg as the PNG it is (allow-listed names may differ from the bytes)', async () => {
    await expect(
      assertReceiptFile(upload(PNG, 'photo.jpg', 'image/jpeg')),
    ).resolves.toMatchObject({ kind: 'png', ext: 'png', mime: 'image/png' });
  });

  it.each([
    [
      'HEIC (the browser converts it, or refuses inline)',
      upload(HEIC, 'IMG.HEIC', 'image/heic'),
    ],
    ['JPEG bytes declared as HEIC', upload(JPEG, 'IMG.jpg', 'image/heic')],
    ['PNG bytes named .svg', upload(PNG, 'logo.svg', 'image/png')],
    ['PDF bytes declared as HTML', upload(PDF, 'recu.pdf', 'text/html')],
    ['a GIF', upload(pad(Buffer.from('GIF89a')), 'a.gif', 'image/gif')],
    [
      'an executable renamed .pdf',
      upload(pad(Buffer.from('MZ\x90\x00')), 'recu.pdf'),
    ],
    [
      'a script renamed .jpg',
      upload(pad(Buffer.from('#!/bin/sh\nrm -rf /')), 'a.jpg'),
    ],
    ['an empty file', upload(Buffer.alloc(0), 'a.pdf', 'application/pdf')],
  ])('refuses %s with RECEIPT_TYPE', async (_l, file) => {
    await expect(assertReceiptFile(file)).rejects.toMatchObject(refusedType);
  });

  it('refuses more than 10 MB with RECEIPT_TOO_LARGE', async () => {
    const big = Buffer.alloc(RECEIPT_MAX_BYTES + 1, 0x20);
    JPEG.copy(big);
    await expect(
      assertReceiptFile(upload(big, 'big.jpg', 'image/jpeg')),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'RECEIPT_TOO_LARGE',
    });
  });

  it('accepts exactly 10 MB', async () => {
    const max = Buffer.alloc(RECEIPT_MAX_BYTES, 0x20);
    PDF.copy(max);
    await expect(
      assertReceiptFile(upload(max, 'max.pdf')),
    ).resolves.toMatchObject({ kind: 'pdf' });
  });
});

describe('resolveReceiptPath (traversal-safe, receipt shapes only)', () => {
  const root = path.resolve(RECEIPT_UPLOAD_ROOT);

  it.each([
    ['/uploads/payments/0f1e2d3c-4b5a.png', ['payments', '0f1e2d3c-4b5a.png']],
    ['payments/0f1e2d3c-4b5a.heic', ['payments', '0f1e2d3c-4b5a.heic']],
    [
      '/uploads/treatment-fee-proofs/1764235800000-Recu_virement.pdf',
      ['treatment-fee-proofs', '1764235800000-Recu_virement.pdf'],
    ],
    [
      '/uploads/orders/o-1/payment-proofs/6f5e.jpg',
      ['orders', 'o-1', 'payment-proofs', '6f5e.jpg'],
    ],
  ])('%s resolves inside the uploads root', (stored, parts) => {
    expect(resolveReceiptPath(stored)).toBe(path.join(root, ...parts));
  });

  it.each([
    '/uploads/orders/o-1/front_photo/Dr_X_Patient_front_001.jpg',
    '/uploads/avatars/a.png',
    '/uploads/payments/../orders/o-1/plan.pdf',
    '/uploads/../../etc/passwd',
    '/uploads/payments/./a.png',
    '/etc/passwd',
    '/uploads/payments/a\\..\\b.png',
    '/uploads/payments/a.png\0.jpg',
    '/uploads/payments/',
    '/uploads/orders/o 1/payment-proofs/a.jpg',
    'https://evil.example/payments/a.png',
    '',
  ])('%p is refused (null)', (stored) => {
    expect(resolveReceiptPath(stored)).toBeNull();
  });

  it.each([null, undefined, 42, {}])('a non-string (%p) is refused', (v) => {
    expect(resolveReceiptPath(v)).toBeNull();
  });
});

describe('receiptContentType', () => {
  it.each([
    ['a.jpg', 'image/jpeg'],
    ['a.JPEG', 'image/jpeg'],
    ['a.png', 'image/png'],
    ['a.webp', 'image/webp'],
    ['a.pdf', 'application/pdf'],
    ['legacy.heic', 'image/heic'],
    ['legacy.bin', 'application/octet-stream'],
    ['noext', 'application/octet-stream'],
  ])('%s → %s', (name, type) => {
    expect(receiptContentType(`/x/${name}`)).toBe(type);
  });
});

describe('toReceiptUploadError (multer limits)', () => {
  it("turns multer's 413 into 400 RECEIPT_TOO_LARGE", () => {
    expect(
      toReceiptUploadError(new PayloadTooLargeException('File too large')),
    ).toMatchObject({ statusCode: 400, errorCode: 'RECEIPT_TOO_LARGE' });
  });

  it('leaves any other error as it is', () => {
    const other = new Error('Unexpected field');
    expect(toReceiptUploadError(other)).toBe(other);
  });
});

describe('the receipt store (write, open, stream, unlink) on a temporary root', () => {
  let tmp: string;
  let store: typeof ReceiptFileModule;

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oralign-receipts-'));
    const cwd = jest.spyOn(process, 'cwd').mockReturnValue(tmp);
    jest.isolateModules(() => {
      store = jest.requireActual<typeof ReceiptFileModule>('./receipt-file');
    });
    cwd.mockRestore();
  });

  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('writes under uploads/orders/<orderId>/payment-proofs/<uuid>.<ext>, named after the real type', async () => {
    const stored = await store.writeReceiptFile('o-1', PDF, {
      kind: 'pdf',
      ext: 'pdf',
      mime: 'application/pdf',
    });
    expect(stored).toMatch(
      /^\/uploads\/orders\/o-1\/payment-proofs\/[0-9a-f-]{36}\.pdf$/,
    );
    const absolute = store.resolveReceiptPath(stored);
    expect(absolute?.startsWith(path.join(tmp, 'uploads'))).toBe(true);
    expect(fs.readFileSync(absolute!)).toEqual(PDF);
  });

  it('refuses an order id that is not an id (no path in a path)', async () => {
    await expect(
      store.writeReceiptFile('../avatars', JPEG, {
        kind: 'jpeg',
        ext: 'jpg',
        mime: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('opens a stored receipt with its type and size, null when it is missing', async () => {
    const stored = await store.writeReceiptFile('o-2', PNG, {
      kind: 'png',
      ext: 'png',
      mime: 'image/png',
    });
    await expect(store.openReceipt(stored)).resolves.toMatchObject({
      contentType: 'image/png',
      size: PNG.length,
      extension: 'png',
    });
    await expect(
      store.openReceipt('/uploads/orders/o-2/payment-proofs/missing.png'),
    ).resolves.toBeNull();
    await expect(
      store.openReceipt('/uploads/avatars/a.png'),
    ).resolves.toBeNull();
  });

  it('removes a receipt this request wrote, and never throws', async () => {
    const stored = await store.writeReceiptFile('o-3', JPEG, {
      kind: 'jpeg',
      ext: 'jpg',
      mime: 'image/jpeg',
    });
    await store.removeReceiptFile(stored);
    expect(fs.existsSync(store.resolveReceiptPath(stored)!)).toBe(false);
    await expect(store.removeReceiptFile(stored)).resolves.toBeUndefined();
    await expect(store.removeReceiptFile(null)).resolves.toBeUndefined();
    await expect(
      store.removeReceiptFile('/uploads/../package.json'),
    ).resolves.toBeUndefined();
  });

  class FakeResponse extends PassThrough {
    readonly headers: Record<string, string> = {};
    statusCode = 0;
    setHeader(name: string, value: string): this {
      this.headers[name.toLowerCase()] = value;
      return this;
    }
    status(code: number): this {
      this.statusCode = code;
      return this;
    }
  }

  const sent = async (stored: string, baseName: string) => {
    const receipt = await store.openReceipt(stored);
    const res = new FakeResponse();
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<void>((resolve) => res.on('end', resolve));
    store.sendReceipt(res as unknown as Response, receipt!, baseName);
    await done;
    return { res, body: Buffer.concat(chunks) };
  };

  it('streams an image with the private headers and the sandbox CSP', async () => {
    const stored = await store.writeReceiptFile('o-4', JPEG, {
      kind: 'jpeg',
      ext: 'jpg',
      mime: 'image/jpeg',
    });
    const { res, body } = await sent(stored, 'recu-ORD-1-echeance-2');
    expect(body).toEqual(JPEG);
    expect(res.statusCode).toBe(200);
    expect(res.headers).toMatchObject({
      'content-type': 'image/jpeg',
      'content-length': String(JPEG.length),
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
      'content-disposition': 'inline; filename="recu-ORD-1-echeance-2.jpg"',
      'content-security-policy': "default-src 'none'; sandbox",
    });
  });

  it('streams a PDF without the sandbox (the PDF viewer refuses it), framing refused', async () => {
    const stored = await store.writeReceiptFile('o-5', PDF, {
      kind: 'pdf',
      ext: 'pdf',
      mime: 'application/pdf',
    });
    const { res } = await sent(stored, 'recu frais/ORD 2');
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-security-policy']).toBe(
      "frame-ancestors 'none'",
    );
    // A download name of safe ASCII only.
    expect(res.headers['content-disposition']).toBe(
      'inline; filename="recu-frais-ORD-2.pdf"',
    );
  });
});
