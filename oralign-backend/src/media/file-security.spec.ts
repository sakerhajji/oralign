import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { scanUploadContent, scanUploadFile } from './file-security';
import {
  objFile,
  plyFile,
  torusMesh,
} from './processors/mesh/mesh-fixtures.helper-spec';

function binaryStl(header = 'ORALIGN binary STL'): Buffer {
  const triangleCount = 1;
  const buffer = Buffer.alloc(84 + triangleCount * 50);

  buffer.write(header, 0, Math.min(80, Buffer.byteLength(header)), 'latin1');
  buffer.writeUInt32LE(triangleCount, 80);

  // One finite triangle. The security scanner only needs the STL envelope,
  // but realistic geometry keeps this fixture useful to downstream parsers.
  const vertices = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  vertices.forEach((value, index) => {
    buffer.writeFloatLE(value, 84 + 12 + index * 4);
  });

  return buffer;
}

const ASCII_STL = Buffer.from(`solid jaw
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 1 0 0
    vertex 0 1 0
  endloop
endfacet
endsolid jaw
`);

describe('STL upload content security', () => {
  it('accepts a valid binary STL whose arbitrary header contains a script-like marker', async () => {
    const verdict = await scanUploadContent({
      originalname: 'upper-jaw.stl',
      mimetype: 'model/stl',
      buffer: binaryStl('scanner metadata <%@ export'),
    });

    expect(verdict).toEqual({ safe: true });
  });

  it('applies the same binary STL rule to chunked uploads assembled on disk', async () => {
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'oralign-stl-'));
    const filePath = path.join(directory, 'lower-jaw.stl');

    try {
      await fs.writeFile(filePath, binaryStl('scanner metadata <%@ export'));
      await expect(scanUploadFile(filePath, 'lower-jaw.stl')).resolves.toEqual({
        safe: true,
      });
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it('accepts a valid ASCII STL', async () => {
    await expect(
      scanUploadContent({
        originalname: 'occlusion.stl',
        mimetype: 'model/stl',
        buffer: ASCII_STL,
      }),
    ).resolves.toEqual({ safe: true });
  });

  it('still rejects active script content renamed as an STL', async () => {
    const verdict = await scanUploadContent({
      originalname: 'payload.stl',
      mimetype: 'model/stl',
      buffer: Buffer.from('<script>alert("unsafe")</script>'),
    });

    expect(verdict.safe).toBe(false);
    expect(verdict.code).toBe('script');
  });

  it('rejects text that is neither binary nor ASCII STL geometry', async () => {
    const verdict = await scanUploadContent({
      originalname: 'not-a-model.stl',
      mimetype: 'model/stl',
      buffer: Buffer.from('This is not an STL model.'),
    });

    expect(verdict.safe).toBe(false);
    expect(verdict.code).toBe('type_mismatch');
  });
});

const scan = (originalname: string, buffer: Buffer) =>
  scanUploadContent({ originalname, buffer });

/** Runs the on-disk (chunked upload) scan on a temp copy of `buffer`. */
async function scanOnDisk(name: string, buffer: Buffer) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'oralign-scan-'));
  try {
    await fs.writeFile(path.join(directory, name), buffer);
    return await scanUploadFile(path.join(directory, name), name);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

const PLY_HEADER = [
  'ply',
  'format binary_little_endian 1.0',
  'element vertex 1',
  'property float x',
  'property float y',
  'property float z',
  'end_header',
  '',
].join('\n');

describe('PLY upload content security', () => {
  it.each([
    ['ascii', plyFile(torusMesh(), { format: 'ascii', colors: 'uchar' })],
    [
      'binary little-endian',
      plyFile(torusMesh(), { format: 'binary_little_endian', colors: 'float' }),
    ],
    [
      'binary big-endian (CRLF header)',
      plyFile(torusMesh(), { format: 'binary_big_endian', crlf: true }),
    ],
  ])('accepts a valid %s PLY', async (_label, buffer) => {
    await expect(scan('upper.ply', buffer)).resolves.toEqual({ safe: true });
    await expect(scanOnDisk('upper.ply', buffer)).resolves.toEqual({
      safe: true,
    });
  });

  it('does not text-scan a binary body, whose random bytes may spell a marker', async () => {
    const buffer = Buffer.concat([
      Buffer.from(PLY_HEADER, 'latin1'),
      Buffer.from('<%@ <script exec('),
    ]);
    await expect(scan('lower.ply', buffer)).resolves.toEqual({ safe: true });
  });

  it.each([
    [
      'a script marker in a header comment',
      PLY_HEADER.replace(
        'end_header',
        'comment <script>alert(1)</script>\nend_header',
      ),
    ],
    [
      'a script marker in an ascii body',
      PLY_HEADER.replace('binary_little_endian', 'ascii') +
        'os.system("rm") 0 0\n',
    ],
    ['a PHP script renamed .ply', '<?php system($_GET["c"]); ?>'],
  ])('rejects %s as a script', async (_label, text) => {
    const verdict = await scan('payload.ply', Buffer.from(text, 'latin1'));
    expect(verdict).toMatchObject({ safe: false, code: 'script' });
  });

  it.each([
    ['plain text', 'This is not a PLY model.'],
    ['a missing magic line', PLY_HEADER.slice(4)],
    [
      'an unsupported format line',
      PLY_HEADER.replace(
        'binary_little_endian 1.0',
        'binary_little_endian 2.0',
      ),
    ],
    ['no end_header', PLY_HEADER.replace('end_header\n', '')],
    [
      'an end_header beyond the bounded header',
      PLY_HEADER.replace(
        'end_header',
        `comment ${'x'.repeat(70 * 1024)}\nend_header`,
      ),
    ],
  ])('rejects %s as a type mismatch', async (_label, text) => {
    const verdict = await scan('upper.ply', Buffer.from(text, 'latin1'));
    expect(verdict).toMatchObject({ safe: false, code: 'type_mismatch' });
  });
});

describe('OBJ upload content security', () => {
  it('accepts a coloured OBJ with comments, materials, groups and all face syntaxes', async () => {
    const buffer = objFile(torusMesh(), {
      colors: 'byte',
      faceStyle: 'v/vt/vn',
      extras: true,
      crlf: true,
    });
    await expect(scan('upper.obj', buffer)).resolves.toEqual({ safe: true });
    await expect(scanOnDisk('upper.obj', buffer)).resolves.toEqual({
      safe: true,
    });
  });

  it('never judges the line the on-disk 64 KB prefix cuts in half', async () => {
    // "usemtl" straddles the prefix boundary: only "use" is in the prefix.
    const head = `v 0 0 0\n${'\n'.repeat(64 * 1024 - 8 - 3)}`;
    const buffer = Buffer.from(`${head}usemtl gum\nv 1 0 0\nf 1 2 1\n`);
    await expect(scanOnDisk('lower.obj', buffer)).resolves.toEqual({
      safe: true,
    });
  });

  it.each([
    ['a Python script renamed .obj', 'import socket\nprint("hi")\n'],
    ['a text file renamed .obj', 'Patient notes: upper arch scan\n'],
    ['an empty-looking file', '\n\n   \n'],
    [
      'a compiled COFF object',
      Buffer.from([0x64, 0x86, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2e, 0x74]),
    ],
  ])('rejects %s as a type mismatch', async (_label, content) => {
    const verdict = await scan('upper.obj', Buffer.from(content));
    expect(verdict).toMatchObject({ safe: false, code: 'type_mismatch' });
  });

  it.each([
    ['a script marker in a comment', '# <script>alert(1)</script>\nv 0 0 0\n'],
    ['code after OBJ-looking lines', 'v 0 0 0\nf 1 1 1\nos.system("id")\n'],
  ])('rejects %s as a script', async (_label, text) => {
    const verdict = await scan('upper.obj', Buffer.from(text));
    expect(verdict).toMatchObject({ safe: false, code: 'script' });
  });
});
