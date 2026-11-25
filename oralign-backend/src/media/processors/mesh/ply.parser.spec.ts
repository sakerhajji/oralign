import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { ByteSource } from './byte-source';
import {
  type FixtureMesh,
  GUM_RGB,
  type PlyEncoding,
  type PlyOptions,
  TOOTH_RGB,
  plyFile,
  torusMesh,
} from './mesh-fixtures.helper-spec';
import type { ParsedMesh, TriangleGeometry } from './mesh.types';
import { parsePlyHeader, readPly } from './ply.parser';

// The streaming test parses every encoding through a 4 KB window: under the
// load of a parallel Docker build it can pass the default 5 s.
jest.setTimeout(30_000);

/** One quad and one triangle: 3 triangles once fan-triangulated. */
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

const parse = (buf: Buffer, collect = true) =>
  readPly(ByteSource.fromBuffer(buf), collect);

function triangles(mesh: ParsedMesh): TriangleGeometry {
  if (mesh.geometry?.kind !== 'triangles') throw new Error('not a mesh');
  return mesh.geometry;
}

const ENCODINGS: PlyEncoding[] = [
  'ascii',
  'binary_little_endian',
  'binary_big_endian',
];

describe('parsePlyHeader', () => {
  it('reads the encoding, the elements and where the body starts', () => {
    const buf = plyFile(QUAD, {
      format: 'binary_little_endian',
      colors: 'uchar',
    });
    const header = parsePlyHeader(buf);

    expect(header.encoding).toBe('binary_little_endian');
    expect(header.elements.map((e) => [e.name, e.count])).toEqual([
      ['vertex', 5],
      ['face', 2],
    ]);
    expect(header.elements[1].properties[0]).toEqual({
      name: 'vertex_indices',
      type: 'int32',
      countType: 'uint8',
    });
    expect(buf.toString('latin1', 0, header.byteLength)).toMatch(
      /end_header\n$/,
    );
  });

  it('accepts CRLF headers', () => {
    const buf = plyFile(QUAD, { format: 'ascii', crlf: true });
    expect(parsePlyHeader(buf).encoding).toBe('ascii');
  });

  it.each([
    ['no magic line', 'format ascii 1.0\nelement vertex 0\nend_header\n'],
    ['a wrong magic line', 'plyx\nformat ascii 1.0\nend_header\n'],
    [
      'an unknown encoding',
      'ply\nformat binary_middle_endian 1.0\nend_header\n',
    ],
    ['an unsupported version', 'ply\nformat ascii 2.0\nend_header\n'],
    ['no format line', 'ply\nelement vertex 1\nproperty float x\nend_header\n'],
    [
      'an element before the format',
      'ply\nelement vertex 1\nformat ascii 1.0\nend_header\n',
    ],
    [
      'an unknown property type',
      'ply\nformat ascii 1.0\nelement vertex 1\nproperty real x\nend_header\n',
    ],
    [
      'a float list count',
      'ply\nformat ascii 1.0\nelement face 1\nproperty list float int v\nend_header\n',
    ],
    [
      'a negative element count',
      'ply\nformat ascii 1.0\nelement vertex -1\nend_header\n',
    ],
    ['an unknown keyword', 'ply\nformat ascii 1.0\nimport os\nend_header\n'],
    ['no end_header', 'ply\nformat ascii 1.0\nelement vertex 1\n'],
  ])('rejects %s', (_label, text) => {
    expect(() => parsePlyHeader(Buffer.from(text, 'latin1'))).toThrow();
  });

  it('does not search past the bounded header for end_header', () => {
    const padding = `comment ${'x'.repeat(70 * 1024)}\n`;
    const text = `ply\nformat ascii 1.0\n${padding}end_header\n`;
    expect(() => parsePlyHeader(Buffer.from(text, 'latin1'))).toThrow(
      /end_header/,
    );
  });
});

describe('readPly', () => {
  describe.each(ENCODINGS)('%s', (format) => {
    it('reads positions, fan-triangulated quads and uchar colours', async () => {
      const mesh = await parse(plyFile(QUAD, { format, colors: 'uchar' }));
      const geometry = triangles(mesh);

      expect(mesh).toMatchObject({
        format,
        triangleCount: 3,
        vertexCount: 5,
        hasColors: true,
        pointCloud: false,
      });
      expect(Array.from(geometry.positions)).toEqual(QUAD_POSITIONS);
      expect(Array.from(geometry.indices ?? [])).toEqual(QUAD_INDICES);
      expect(Array.from(geometry.colors ?? [])).toEqual(QUAD_COLORS);
      expect(mesh.bbox.bbox).toEqual({ min: [0, 0, 0], max: [3, 2, 1] });
    });

    it('reads float 0..1 colours, alpha ignored', async () => {
      const mesh = await parse(
        plyFile(QUAD, { format, colors: 'float', alpha: true }),
      );
      expect(Array.from(triangles(mesh).colors ?? [])).toEqual(QUAD_COLORS);
    });

    it('skips extra vertex/face properties and unrelated elements by size', async () => {
      const mesh = await parse(
        plyFile(QUAD, {
          format,
          colors: 'uchar',
          alpha: true,
          extraVertexProps: true,
          extraFaceProps: true,
          extraElement: true,
        }),
      );
      const geometry = triangles(mesh);
      expect(Array.from(geometry.positions)).toEqual(QUAD_POSITIONS);
      expect(Array.from(geometry.indices ?? [])).toEqual(QUAD_INDICES);
      expect(Array.from(geometry.colors ?? [])).toEqual(QUAD_COLORS);
    });

    it('reads an uncoloured mesh', async () => {
      const mesh = await parse(plyFile(QUAD, { format }));
      expect(mesh.hasColors).toBe(false);
      expect(triangles(mesh).colors).toBeNull();
      expect(mesh.triangleCount).toBe(3);
    });

    it('reads a PLY without faces as a coloured point cloud', async () => {
      const mesh = await parse(
        plyFile(QUAD, { format, colors: 'uchar', pointCloud: true }),
      );
      expect(mesh).toMatchObject({
        triangleCount: 0,
        vertexCount: 5,
        pointCloud: true,
        hasColors: true,
      });
      expect(mesh.geometry?.kind).toBe('points');
      expect(Array.from(mesh.geometry?.colors ?? [])).toEqual(QUAD_COLORS);
    });

    it('reads faces declared before their vertices', async () => {
      const mesh = await parse(plyFile(QUAD, { format, facesFirst: true }));
      expect(Array.from(triangles(mesh).indices ?? [])).toEqual(QUAD_INDICES);
    });

    it('fails on a truncated body', async () => {
      const whole = plyFile(QUAD, { format });
      const cut = format === 'ascii' ? whole.length - 8 : whole.length - 3;
      await expect(parse(whole.subarray(0, cut))).rejects.toThrow(/Truncated/);
    });
  });

  it('reads diffuse_red/green/blue colours', async () => {
    const mesh = await parse(
      plyFile(QUAD, { format: 'binary_little_endian', colors: 'diffuse' }),
    );
    expect(Array.from(triangles(mesh).colors ?? [])).toEqual(QUAD_COLORS);
  });

  it.each([
    'char',
    'int8',
    'uchar',
    'uint8',
    'short',
    'int16',
    'ushort',
    'uint16',
    'int',
    'int32',
    'uint',
    'uint32',
    'float',
    'float32',
    'double',
    'float64',
  ])('reads %s coordinates', async (positionType) => {
    for (const format of ENCODINGS) {
      const mesh = await parse(plyFile(QUAD, { format, positionType }));
      expect(Array.from(triangles(mesh).positions)).toEqual(QUAD_POSITIONS);
    }
  });

  it.each<[string, string, PlyOptions['indexName']]>([
    ['uchar', 'int', 'vertex_indices'],
    ['int', 'uint', 'vertex_indices'],
    ['ushort', 'short', 'vertex_index'],
    ['uint8', 'uint32', 'vertex_index'],
  ])(
    'reads %s/%s face lists named %s',
    async (countType, indexType, indexName) => {
      const mesh = await parse(
        plyFile(QUAD, {
          format: 'binary_big_endian',
          countType,
          indexType,
          indexName,
        }),
      );
      expect(Array.from(triangles(mesh).indices ?? [])).toEqual(QUAD_INDICES);
    },
  );

  it('drops only the triangles that reference a missing vertex', async () => {
    const broken: FixtureMesh = {
      ...QUAD,
      faces: [
        [0, 1, 2],
        [0, 2, 9],
      ],
    };
    const mesh = await parse(plyFile(broken, { format: 'ascii' }));
    expect(Array.from(triangles(mesh).indices ?? [])).toEqual([0, 1, 2]);
    expect(mesh.triangleCount).toBe(1);
  });

  it('rejects a file without a vertex element', async () => {
    const text =
      'ply\nformat ascii 1.0\nelement face 0\nproperty list uchar int vertex_indices\nend_header\n';
    await expect(parse(Buffer.from(text))).rejects.toThrow(/vertex/);
  });

  it('rejects an absurd list length instead of allocating it', async () => {
    const text =
      'ply\nformat ascii 1.0\nelement vertex 0\nproperty float x\nproperty float y\nproperty float z\n' +
      'element face 1\nproperty list int int vertex_indices\nend_header\n99999999 0 1 2\n';
    await expect(parse(Buffer.from(text))).rejects.toThrow(/list length/);
  });

  it('keeps counts, colours and bbox but no geometry when not collecting', async () => {
    const mesh = await parse(
      plyFile(QUAD, { format: 'binary_little_endian', colors: 'uchar' }),
      false,
    );
    expect(mesh).toMatchObject({
      geometry: null,
      triangleCount: 3,
      vertexCount: 5,
      hasColors: true,
      pointCloud: false,
      bbox: { bbox: { min: [0, 0, 0], max: [3, 2, 1] }, hasFiniteVertex: true },
    });
  });

  it('streams a file through a small window exactly like an in-memory parse', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'oralign-ply-'));
    try {
      for (const format of ENCODINGS) {
        const buf = plyFile(torusMesh(), {
          format,
          colors: 'uchar',
          extraVertexProps: true,
          extraFaceProps: true,
        });
        const file = path.join(dir, `${format}.ply`);
        await fs.writeFile(file, buf);
        const src = await ByteSource.open(file, 4096);
        try {
          expect(await readPly(src, true)).toEqual(await parse(buf));
        } finally {
          await src.close();
        }
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
