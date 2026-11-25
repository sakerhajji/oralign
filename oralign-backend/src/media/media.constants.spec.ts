import {
  STORED_FILE_SECURITY_HEADERS,
  classifyMedia,
  inlineSafeMimeType,
  meshFormatOf,
  storedUploadMimeType,
} from './media.constants';

describe('meshFormatOf', () => {
  it.each([
    ['Dr-X_Patient_stl_001.stl', 'stl'],
    ['upper__SCAN.PLY', 'ply'],
    ['lower.Obj', 'obj'],
    ['archive.ply.zip', null],
    ['notes.txt', null],
    ['ply', null],
    ['', null],
  ])('%p → %p', (name, expected) => {
    expect(meshFormatOf(name)).toBe(expected);
  });
});

describe('classifyMedia', () => {
  it.each([
    // 3D scans: the extension decides, whatever the browser claimed.
    ['application/octet-stream', 'scan.stl', 'stl'],
    ['application/octet-stream', 'scan.ply', 'ply'],
    ['', 'scan.obj', 'obj'],
    ['model/stl', 'scan.ply', 'ply'],
    ['text/plain', 'scan.obj', 'obj'],
    // Mime only matters when the name has no known extension.
    ['model/stl', 'scan', 'stl'],
    ['application/sla', 'scan.bin', 'stl'],
    ['model/ply', 'scan', 'ply'],
    ['model/obj', 'scan', 'obj'],
    // Unchanged neighbours.
    ['image/png', 'photo.png', 'image'],
    ['image/png', 'scan.stl', 'image'],
    ['application/zip', 'cbct.bin', 'zip'],
    ['application/octet-stream', 'cbct.zip', 'zip'],
    ['image/heic', 'photo.heic', null],
    ['application/pdf', 'sheet.pdf', null],
    ['application/octet-stream', '__proto__', null],
  ])('%p + %p → %p', (mime, name, expected) => {
    expect(classifyMedia(mime, name)).toBe(expected);
  });
});

describe('inlineSafeMimeType', () => {
  it.each([
    ['image/jpeg', 'image/jpeg'],
    ['image/png', 'image/png'],
    ['image/webp', 'image/webp'],
    ['image/gif', 'image/gif'],
    ['image/avif', 'image/avif'],
    // Case, spaces and parameters do not matter; the essence is served.
    [' IMAGE/JPEG ; charset=binary', 'image/jpeg'],
    ['image/svg+xml', null],
    ['text/html', null],
    ['application/xhtml+xml', null],
    ['image/heic', null],
    ['application/pdf', null],
    ['video/mp4', null],
    ['application/octet-stream', null],
    ['', null],
    [null, null],
    [undefined, null],
  ])('%p → %p', (mime, expected) => {
    expect(inlineSafeMimeType(mime)).toBe(expected);
  });
});

describe('storedUploadMimeType', () => {
  it.each([
    'image/svg+xml',
    'IMAGE/SVG+XML; charset=utf-8',
    'text/html',
    'Text/HTML; charset=UTF-8',
    'application/xhtml+xml',
    'text/xml',
    'application/xml',
    'text/xsl',
    'application/rss+xml',
  ])(
    'an active document type %p is stored as application/octet-stream',
    (mime) => {
      expect(storedUploadMimeType(mime)).toBe('application/octet-stream');
    },
  );

  it.each([
    'image/jpeg',
    'application/pdf',
    'video/mp4',
    'model/stl',
    'application/zip',
  ])('any other declared type %p is kept as declared', (mime) => {
    expect(storedUploadMimeType(mime)).toBe(mime);
  });

  it.each([undefined, null, '', '   '])(
    'nothing declared (%p) is octet-stream',
    (mime) => {
      expect(storedUploadMimeType(mime)).toBe('application/octet-stream');
    },
  );
});

describe('STORED_FILE_SECURITY_HEADERS', () => {
  it('never sniff, and no script or subresource when opened as a document', () => {
    expect(STORED_FILE_SECURITY_HEADERS).toEqual({
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    expect(Object.isFrozen(STORED_FILE_SECURITY_HEADERS)).toBe(true);
  });
});
