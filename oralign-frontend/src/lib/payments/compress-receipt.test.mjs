// Run: node --test src/lib/payments/compress-receipt.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
//
// The receipt rules of DECISIONS §1: JPEG / PNG / WebP / PDF up to 10 MB,
// photos brought to about 2000 px at JPEG 0.82 (never below 1600 px and
// 0.8), PDFs untouched, HEIC converted when the browser can decode it and
// refused otherwise. The browser codec is replaced by a fake one.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMPRESSION_STEPS,
  RECEIPT_MAX_BYTES,
  RECEIPT_MIN_JPEG_QUALITY,
  RECEIPT_MIN_LONG_EDGE,
  RECEIPT_TARGET_BYTES,
  declaredReceiptKind,
  prepareReceipt,
  receiptBaseName,
  resolveReceiptKind,
  scaledSize,
  sniffReceiptKind,
} from './compress-receipt.ts';

const MB = 1024 * 1024;

const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0];
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const bytesOf = (text) => [...text].map((c) => c.charCodeAt(0));
const WEBP_HEAD = [...bytesOf('RIFF'), 0, 0, 0, 0, ...bytesOf('WEBP')];
const PDF_HEAD = bytesOf('%PDF-1.7');
const HEIC_HEAD = [0, 0, 0, 0x18, ...bytesOf('ftypheic')];
const AVIF_HEAD = [0, 0, 0, 0x1c, ...bytesOf('ftypavif')];

/** A file of `size` bytes starting with `head`. */
function fileOf(head, size, name, type) {
  const bytes = new Uint8Array(Math.max(size, head.length));
  bytes.set(head);
  return new File([bytes], name, { type });
}

/**
 * A fake codec: `decode` reports `dims` (or throws), `encodeJpeg` returns
 * a blob sized by `sizeFor(width, height, quality)` and records the calls.
 */
function fakeCodec({ dims = { width: 4032, height: 3024 }, sizeFor, failDecode = false, failEncode = false } = {}) {
  const calls = { decode: 0, encode: [], closed: 0 };
  return {
    calls,
    codec: {
      async decode() {
        calls.decode += 1;
        if (failDecode) throw new Error('decode');
        return { ...dims, close: () => (calls.closed += 1) };
      },
      async encodeJpeg(_image, width, height, quality) {
        calls.encode.push({ width, height, quality });
        if (failEncode) throw new Error('encode');
        const size = sizeFor ? sizeFor(width, height, quality) : 600 * 1024;
        return new Blob([new Uint8Array(size)], { type: 'image/jpeg' });
      },
    },
  };
}

describe('sniffReceiptKind', () => {
  it('recognises the four kinds the server takes by their first bytes', () => {
    assert.equal(sniffReceiptKind(Uint8Array.from(JPEG_HEAD)), 'jpeg');
    assert.equal(sniffReceiptKind(Uint8Array.from(PNG_HEAD)), 'png');
    assert.equal(sniffReceiptKind(Uint8Array.from(WEBP_HEAD)), 'webp');
    assert.equal(sniffReceiptKind(Uint8Array.from(PDF_HEAD)), 'pdf');
  });

  it('tells HEIC apart from other pictures a browser may open', () => {
    assert.equal(sniffReceiptKind(Uint8Array.from(HEIC_HEAD)), 'heic');
    assert.equal(sniffReceiptKind(Uint8Array.from(AVIF_HEAD)), 'image');
    assert.equal(sniffReceiptKind(Uint8Array.from(bytesOf('GIF89a'))), 'image');
  });

  it('knows nothing of other bytes', () => {
    assert.equal(sniffReceiptKind(Uint8Array.from(bytesOf('<html>'))), null);
    assert.equal(sniffReceiptKind(Uint8Array.from([0x50, 0x4b, 0x03, 0x04])), null);
    assert.equal(sniffReceiptKind(new Uint8Array(0)), null);
  });
});

describe('declaredReceiptKind / resolveReceiptKind', () => {
  it('reads the type first, then the extension', () => {
    assert.equal(declaredReceiptKind({ name: 'a.bin', type: 'image/jpeg' }), 'jpeg');
    assert.equal(declaredReceiptKind({ name: 'IMG_1.HEIC', type: '' }), 'heic');
    assert.equal(declaredReceiptKind({ name: 'scan.pdf', type: '' }), 'pdf');
    assert.equal(declaredReceiptKind({ name: 'x', type: 'image/avif' }), 'image');
    assert.equal(declaredReceiptKind({ name: 'run.exe', type: 'application/x-msdownload' }), 'unsupported');
  });

  it('lets the bytes decide, and never trusts a name for the server kinds', () => {
    assert.equal(resolveReceiptKind('png', 'jpeg'), 'png');
    assert.equal(resolveReceiptKind(null, 'jpeg'), 'unsupported');
    assert.equal(resolveReceiptKind(null, 'heic'), 'heic');
  });
});

describe('scaledSize', () => {
  it('brings the long edge down, keeping the ratio', () => {
    assert.deepEqual(scaledSize(4032, 3024, 2000), { width: 2000, height: 1500 });
    assert.deepEqual(scaledSize(3024, 4032, 2000), { width: 1500, height: 2000 });
  });

  it('never enlarges', () => {
    assert.deepEqual(scaledSize(1200, 900, 2000), { width: 1200, height: 900 });
  });
});

describe('receiptBaseName', () => {
  it('drops the extension and falls back to a neutral name', () => {
    assert.equal(receiptBaseName('IMG_4521.HEIC'), 'IMG_4521');
    assert.equal(receiptBaseName('recu.virement.pdf'), 'recu.virement');
    assert.equal(receiptBaseName('.jpg'), 'recu-virement');
    assert.equal(receiptBaseName(''), 'recu-virement');
  });
});

describe('the compression steps', () => {
  it('never go below 1600 px and quality 0.8', () => {
    for (const step of COMPRESSION_STEPS) {
      assert.ok(step.longEdge >= RECEIPT_MIN_LONG_EDGE);
      assert.ok(step.quality >= RECEIPT_MIN_JPEG_QUALITY);
    }
    assert.deepEqual(COMPRESSION_STEPS[0], { longEdge: 2000, quality: 0.82 });
  });
});

describe('prepareReceipt', () => {
  it('refuses an empty file', async () => {
    const result = await prepareReceipt(new File([], 'x.jpg', { type: 'image/jpeg' }), null);
    assert.deepEqual(result, { ok: false, reason: 'empty' });
  });

  it('refuses what is not a receipt, whatever its name says', async () => {
    const fake = fileOf(bytesOf('MZ'), 2048, 'recu.jpg', 'image/jpeg');
    assert.deepEqual(await prepareReceipt(fake, fakeCodec().codec), { ok: false, reason: 'type' });
  });

  it('passes a PDF through untouched, typed and named as a PDF', async () => {
    const { codec, calls } = fakeCodec();
    const pdf = fileOf(PDF_HEAD, 3 * MB, 'releve', '');
    const result = await prepareReceipt(pdf, codec);
    assert.equal(result.ok, true);
    assert.equal(result.receipt.kind, 'pdf');
    assert.equal(result.receipt.compressed, false);
    assert.equal(result.receipt.file.type, 'application/pdf');
    assert.equal(result.receipt.file.name, 'releve.pdf');
    assert.equal(result.receipt.file.size, 3 * MB);
    assert.equal(calls.decode, 0);
  });

  it('refuses a PDF over 10 MB', async () => {
    const pdf = fileOf(PDF_HEAD, RECEIPT_MAX_BYTES + 1, 'big.pdf', 'application/pdf');
    assert.deepEqual(await prepareReceipt(pdf, null), { ok: false, reason: 'too_large' });
  });

  it('shrinks a phone photo to 2000 px at quality 0.82', async () => {
    const { codec, calls } = fakeCodec();
    const photo = fileOf(JPEG_HEAD, 6 * MB, 'IMG_1.jpg', 'image/jpeg');
    const result = await prepareReceipt(photo, codec);
    assert.equal(result.ok, true);
    assert.equal(result.receipt.compressed, true);
    assert.equal(result.receipt.kind, 'jpeg');
    assert.equal(result.receipt.originalBytes, 6 * MB);
    assert.equal(result.receipt.file.type, 'image/jpeg');
    assert.equal(result.receipt.file.name, 'IMG_1.jpg');
    assert.deepEqual(calls.encode, [{ width: 2000, height: 1500, quality: 0.82 }]);
    assert.equal(calls.closed, 1);
  });

  it('tries 1600 px / 0.8 when 2000 px stays heavy, and keeps the lighter result', async () => {
    const { codec, calls } = fakeCodec({
      sizeFor: (width) => (width === 2000 ? 3 * MB : 2 * MB),
    });
    const photo = fileOf(JPEG_HEAD, 9 * MB, 'p.jpg', 'image/jpeg');
    const result = await prepareReceipt(photo, codec);
    assert.equal(result.ok, true);
    assert.equal(result.receipt.file.size, 2 * MB);
    assert.deepEqual(
      calls.encode.map((c) => [c.width, c.quality]),
      [
        [2000, 0.82],
        [1600, 0.8],
      ],
    );
  });

  it('stops at the first pass under the target', async () => {
    const { codec, calls } = fakeCodec({ sizeFor: () => RECEIPT_TARGET_BYTES - 1 });
    await prepareReceipt(fileOf(JPEG_HEAD, 5 * MB, 'p.jpg', 'image/jpeg'), codec);
    assert.equal(calls.encode.length, 1);
  });

  it('sends a small photo that needs no resizing as it is', async () => {
    const { codec, calls } = fakeCodec({ dims: { width: 1200, height: 900 } });
    const small = fileOf(PNG_HEAD, 400 * 1024, 'capture', 'image/png');
    const result = await prepareReceipt(small, codec);
    assert.equal(result.ok, true);
    assert.equal(result.receipt.compressed, false);
    assert.equal(result.receipt.kind, 'png');
    assert.equal(result.receipt.file.name, 'capture.png');
    assert.equal(calls.encode.length, 0);
  });

  it('keeps the original when re-encoding would not make it lighter', async () => {
    const { codec } = fakeCodec({ dims: { width: 1800, height: 1200 }, sizeFor: () => 3 * MB });
    const png = fileOf(PNG_HEAD, 2 * MB, 'scan.png', 'image/png');
    const result = await prepareReceipt(png, codec);
    assert.equal(result.ok, true);
    assert.equal(result.receipt.compressed, false);
    assert.equal(result.receipt.file.size, 2 * MB);
  });

  it('converts a HEIC photo the browser can decode to JPEG', async () => {
    const { codec } = fakeCodec({ dims: { width: 1000, height: 800 }, sizeFor: () => 300 * 1024 });
    const heic = fileOf(HEIC_HEAD, 2 * MB, 'IMG_9.HEIC', 'image/heic');
    const result = await prepareReceipt(heic, codec);
    assert.equal(result.ok, true);
    assert.equal(result.receipt.kind, 'jpeg');
    assert.equal(result.receipt.compressed, true);
    assert.equal(result.receipt.file.name, 'IMG_9.jpg');
  });

  it('refuses a HEIC photo the browser cannot decode, before any upload', async () => {
    const heic = fileOf(HEIC_HEAD, 2 * MB, 'IMG_9.heic', '');
    assert.deepEqual(await prepareReceipt(heic, fakeCodec({ failDecode: true }).codec), {
      ok: false,
      reason: 'heic_unsupported',
    });
    assert.deepEqual(await prepareReceipt(heic, null), { ok: false, reason: 'heic_unsupported' });
  });

  it('falls back to the original JPEG when this browser cannot decode it', async () => {
    const photo = fileOf(JPEG_HEAD, 4 * MB, 'p.jpeg', 'image/jpeg');
    const result = await prepareReceipt(photo, fakeCodec({ failDecode: true }).codec);
    assert.equal(result.ok, true);
    assert.equal(result.receipt.compressed, false);
    assert.equal(result.receipt.file.name, 'p.jpg');
  });

  it('refuses a photo over 10 MB the browser cannot re-encode, instead of uploading it', async () => {
    const photo = fileOf(JPEG_HEAD, RECEIPT_MAX_BYTES + 1, 'p.jpg', 'image/jpeg');
    assert.deepEqual(await prepareReceipt(photo, fakeCodec({ failEncode: true }).codec), {
      ok: false,
      reason: 'too_large',
    });
  });

  it('brings a 12 MB photo under the limit', async () => {
    const { codec } = fakeCodec({ sizeFor: () => 900 * 1024 });
    const photo = fileOf(JPEG_HEAD, 12 * MB, 'p.jpg', 'image/jpeg');
    const result = await prepareReceipt(photo, codec);
    assert.equal(result.ok, true);
    assert.ok(result.receipt.file.size <= RECEIPT_MAX_BYTES);
  });
});
