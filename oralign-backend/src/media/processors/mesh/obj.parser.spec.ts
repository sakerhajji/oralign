import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { ByteSource } from './byte-source';
import {
  type FixtureMesh,
  GUM_RGB,
  type ObjOptions,
  TOOTH_RGB,
  objFile,
  torusMesh,
} from './mesh-fixtures.helper-spec';
import {
  NEUTRAL_RGB,
  type ParsedMesh,
  type TriangleGeometry,
} from './mesh.types';
import { cornerIndex, readObj } from './obj.parser';

const QUAD: FixtureMesh = {
  vertices: [
    [0, 0, 0],
    [2, 0, 0],
    [2, 2, 0],
    [0, 2, 0],
    [3, 1, 1],
  ],
  faces: [
    [0, 1, 2, 3],
    [1, 4, 2],
  ],
  colors: [GUM_RGB, GUM_RGB, TOOTH_RGB, TOOTH_RGB, GUM_RGB],
};
const QUAD_INDICES = [0, 1, 2, 0, 2, 3, 1, 4, 2];
const QUAD_POSITIONS = QUAD.vertices.flat();
const QUAD_COLORS = QUAD.colors.flat();

const parse = (buf: Buffer | string, collect = true) =>
  readObj(ByteSource.fromBuffer(Buffer.from(buf)), collect);

function triangles(mesh: ParsedMesh): TriangleGeometry {
  if (mesh.geometry?.kind !== 'triangles') throw new Error('not a mesh');
  return mesh.geometry;
}

describe('cornerIndex', () => {
  it.each([
    ['7', 10, 6],
    ['7/2', 10, 6],
    ['7//3', 10, 6],
    ['7/2/3', 10, 6],
    ['-1', 10, 9],
    ['-10/1/1', 10, 0],
  ])('%s with %i vertices → %i', (token, count, expected) => {
    expect(cornerIndex(token, count)).toBe(expected);
  });

  it.each(['0', 'x', '/1', '1.5', ''])('rejects %p', (token) => {
    expect(cornerIndex(token, 10)).toBeNaN();
  });
});

describe('readObj', () => {
  it.each<ObjOptions['faceStyle']>(['v', 'v/vt', 'v//vn', 'v/vt/vn'])(
    'reads %s faces, fan-triangulated',
    async (faceStyle) => {
      const mesh = await parse(objFile(QUAD, { faceStyle, extras: true }));
      const geometry = triangles(mesh);
      expect(mesh).toMatchObject({
        format: 'ascii',
        triangleCount: 3,
        vertexCount: 5,
        hasColors: false,
        pointCloud: false,
      });
      expect(Array.from(geometry.positions)).toEqual(QUAD_POSITIONS);
      expect(Array.from(geometry.indices ?? [])).toEqual(QUAD_INDICES);
      expect(geometry.colors).toBeNull();
    },
  );

  it.each<ObjOptions['colors']>(['unit', 'byte'])(
    'reads %s vertex colours',
    async (colors) => {
      const mesh = await parse(objFile(QUAD, { colors }));
      expect(mesh.hasColors).toBe(true);
      expect(Array.from(triangles(mesh).colors ?? [])).toEqual(QUAD_COLORS);
    },
  );

  it('reads a 0..255 file as such even where a vertex is near-black', async () => {
    const mesh = await parse(
      'v 0 0 0 0 0 1\nv 1 0 0 200 10 10\nv 0 1 0 0 0 0\nf 1 2 3\n',
    );
    expect(Array.from(triangles(mesh).colors ?? [])).toEqual([
      0, 0, 1, 200, 10, 10, 0, 0, 0,
    ]);
  });

  it('gives uncoloured vertices of a coloured file the neutral colour', async () => {
    const mesh = await parse(
      'v 0 0 0\nv 1 0 0 1 0 0\nv 0 1 0 1 1 1\nf 1 2 3\n',
    );
    expect(Array.from(triangles(mesh).colors ?? [])).toEqual([
      ...NEUTRAL_RGB,
      255,
      0,
      0,
      255,
      255,
      255,
    ]);
  });

  it('ignores the w weight of a 4-value vertex', async () => {
    const mesh = await parse('v 1 2 3 0.5\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
    expect(mesh.hasColors).toBe(false);
    expect(Array.from(triangles(mesh).positions.subarray(0, 3))).toEqual([
      1, 2, 3,
    ]);
  });

  it('resolves negative indices against the vertices defined so far', async () => {
    const mesh = await parse(
      [
        'v 0 0 0',
        'v 1 0 0',
        'v 0 1 0',
        'f -3 -2 -1',
        'v 5 0 0',
        'v 6 0 0',
        'v 5 1 0',
        'f -3/1 -2/1 -1/1',
      ].join('\n'),
    );
    expect(Array.from(triangles(mesh).indices ?? [])).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it('reads negative indices written after every vertex', async () => {
    const mesh = await parse(
      objFile(QUAD, { negative: true, faceStyle: 'v//vn' }),
    );
    expect(Array.from(triangles(mesh).indices ?? [])).toEqual(QUAD_INDICES);
  });

  it('drops polygons with an unusable or missing corner', async () => {
    const mesh = await parse(
      'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nf 1 2 x\nf 1 2 0\nf 1 2 9\nf 1 2\n',
    );
    expect(Array.from(triangles(mesh).indices ?? [])).toEqual([0, 1, 2]);
  });

  it('reads an OBJ without faces as a point cloud', async () => {
    const mesh = await parse(
      objFile(QUAD, { colors: 'unit', pointCloud: true }),
    );
    expect(mesh).toMatchObject({
      pointCloud: true,
      triangleCount: 0,
      vertexCount: 5,
    });
    expect(mesh.geometry?.kind).toBe('points');
    expect(Array.from(mesh.geometry?.colors ?? [])).toEqual(QUAD_COLORS);
  });

  it('handles CRLF, tabs, comments and a last line without newline', async () => {
    const mesh = await parse(
      '# scan\r\nv\t0 0 0\r\nv 1 0 0\r\n  v 0 1 0\r\nf 1 2 3',
    );
    expect(Array.from(triangles(mesh).indices ?? [])).toEqual([0, 1, 2]);
  });

  it('keeps counts, colours and bbox but no geometry when not collecting', async () => {
    const mesh = await parse(objFile(QUAD, { colors: 'byte' }), false);
    expect(mesh).toMatchObject({
      geometry: null,
      triangleCount: 3,
      vertexCount: 5,
      hasColors: true,
      bbox: { bbox: { min: [0, 0, 0], max: [3, 2, 1] } },
    });
  });

  it('rejects a file with no line breaks for megabytes', async () => {
    await expect(parse(Buffer.alloc(2 * 1024 * 1024, 0x20))).rejects.toThrow(
      /Line too long/,
    );
  });

  it('streams a file through a tiny window exactly like an in-memory parse', async () => {
    const buf = objFile(torusMesh(), {
      colors: 'unit',
      faceStyle: 'v/vt/vn',
      extras: true,
      crlf: true,
    });
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'oralign-obj-'));
    const file = path.join(dir, 'scan.obj');
    try {
      await fs.writeFile(file, buf);
      const src = await ByteSource.open(file, 64);
      try {
        expect(await readObj(src, true)).toEqual(await parse(buf));
      } finally {
        await src.close();
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
