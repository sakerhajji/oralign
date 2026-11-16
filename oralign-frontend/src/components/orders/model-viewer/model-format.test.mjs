// Run: node --test src/components/orders/model-viewer/model-format.test.mjs
// (Node >= 22.18 strips the TypeScript types of the imported module.)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  colorsLookLikeBytes,
  modelFactsOf,
  modelFormatOf,
  parsePlyHeader,
  pointSizeFor,
  readPlyHeader,
} from './model-format.ts';

const bytes = (text) => new TextEncoder().encode(text);

describe('modelFormatOf', () => {
  it('reads the format from the extension, case-insensitively', () => {
    assert.equal(modelFormatOf('upper-stl__Arch.STL'), 'stl');
    assert.equal(modelFormatOf('scan.final.ply'), 'ply');
    assert.equal(modelFormatOf('lower.Obj'), 'obj');
  });

  it('rejects other extensions and names without one', () => {
    assert.equal(modelFormatOf('photo.jpg'), null);
    assert.equal(modelFormatOf('stl'), null);
    assert.equal(modelFormatOf('archive.ply.zip'), null);
  });
});

describe('readPlyHeader', () => {
  it('returns the text before end_header, ignoring the binary body', () => {
    const file = new Uint8Array([
      ...bytes('ply\nformat binary_little_endian 1.0\nelement vertex 1\nend_header\n'),
      0xff, 0xfe, 0x00, 0x80,
    ]);
    assert.equal(
      readPlyHeader(file),
      'ply\nformat binary_little_endian 1.0\nelement vertex 1\n',
    );
  });

  it('returns null for non-PLY or truncated headers', () => {
    assert.equal(readPlyHeader(bytes('solid arch\nfacet normal 0 0 1')), null);
    assert.equal(readPlyHeader(bytes('ply\nformat ascii 1.0\nelement vertex 3')), null);
  });
});

describe('parsePlyHeader', () => {
  const header = (lines) => `ply\nformat ascii 1.0\n${lines.join('\n')}\n`;

  it('reports the declared face count', () => {
    const facts = parsePlyHeader(
      header([
        'element vertex 8',
        'property float x',
        'element face 12',
        'property list uchar int vertex_indices',
      ]),
    );
    assert.deepEqual(facts, { faceCount: 12, floatColors: false });
  });

  it('treats a header without faces as a point cloud', () => {
    const facts = parsePlyHeader(
      header(['element vertex 5000', 'property float x', 'property uchar red']),
    );
    assert.equal(facts.faceCount, 0);
    assert.equal(facts.floatColors, false);
  });

  it('flags float vertex colours, including diffuse_* names and aliases', () => {
    assert.equal(
      parsePlyHeader(header(['element vertex 3', 'property float32 red'])).floatColors,
      true,
    );
    assert.equal(
      parsePlyHeader(header(['element vertex 3', 'property double diffuse_red']))
        .floatColors,
      true,
    );
  });

  it('prefers face colours over vertex colours, as PLYLoader does', () => {
    const facts = parsePlyHeader(
      header([
        'element vertex 3',
        'property float red',
        'element face 1',
        'property list uchar int vertex_index',
        'property uchar red',
      ]),
    );
    assert.deepEqual(facts, { faceCount: 1, floatColors: false });
  });

  it('accepts CRLF headers', () => {
    const facts = parsePlyHeader(
      'ply\r\nformat ascii 1.0\r\nelement vertex 3\r\nproperty float r\r\nelement face 2\r\n',
    );
    assert.deepEqual(facts, { faceCount: 2, floatColors: true });
  });
});

describe('colorsLookLikeBytes', () => {
  it('is true as soon as one component exceeds 1', () => {
    assert.equal(colorsLookLikeBytes([0.2, 0.4, 0.9, 1, 230, 12]), true);
  });

  it('is false for unit-range colours', () => {
    assert.equal(colorsLookLikeBytes(new Float32Array([0, 0.5, 1, 1, 1, 1])), false);
  });
});

describe('pointSizeFor', () => {
  it('shrinks with density and stays within its bounds', () => {
    assert.ok(pointSizeFor(1_000) > pointSizeFor(100_000));
    assert.equal(pointSizeFor(10), 0.04);
    assert.equal(pointSizeFor(100_000_000), 0.002);
    assert.equal(pointSizeFor(0), 0.04);
  });
});

describe('modelFactsOf', () => {
  it('reads triangle and vertex counts of any 3D kind', () => {
    assert.deepEqual(
      modelFactsOf({ kind: 'ply', triangleCount: 0, vertexCount: 42_000 }),
      { triangleCount: 0, vertexCount: 42_000 },
    );
    assert.deepEqual(modelFactsOf({ kind: 'stl', triangleCount: 10 }), {
      triangleCount: 10,
      vertexCount: 0,
    });
  });

  it('ignores missing or non-3D metadata', () => {
    assert.equal(modelFactsOf(undefined), null);
    assert.equal(modelFactsOf({ kind: 'zip', entryCount: 3 }), null);
  });
});
