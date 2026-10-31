import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { scanUploadContent, scanUploadFile } from './file-security';

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
