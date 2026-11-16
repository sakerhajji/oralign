// Shared fixtures of the mesh pipeline specs. Named *.helper-spec.ts on
// purpose: the build excludes it like a spec (tsconfig.build "**/*spec.ts")
// and jest does not collect it as a suite (testRegex ".spec.ts").
//
// The torus is FROZEN: the STL regression spec pins golden hashes of the
// GLB and of the raw render produced from it by the pre-refactor STL
// processor. Changing its geometry invalidates those hashes.

import type { TriangleGeometry } from './mesh.types';

export type Vec3 = [number, number, number];

export interface FixtureMesh {
  vertices: Vec3[];
  /** Polygons (3+ vertex indices each), 0-based. */
  faces: number[][];
  /** Per-vertex sRGB colour, 0..255. */
  colors: Vec3[];
}

export const GUM_RGB: Vec3 = [214, 120, 140];
export const TOOTH_RGB: Vec3 = [245, 245, 240];

/** Rounded to 1e-3 so the fixture never depends on the last ulp of sin/cos. */
const q = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * Elliptical torus (an arch-like ring) made of quads: pink "gum" on the
 * outer half, white "teeth" on the inner half.
 */
export function torusMesh(segU = 48, segV = 24): FixtureMesh {
  const vertices: Vec3[] = [];
  const colors: Vec3[] = [];
  for (let i = 0; i < segU; i++) {
    for (let j = 0; j < segV; j++) {
      const u = (i / segU) * 2 * Math.PI;
      const v = (j / segV) * 2 * Math.PI;
      const ring = 20 + 6 * Math.cos(v);
      vertices.push([
        q(1.3 * ring * Math.cos(u)),
        q(6 * Math.sin(v)),
        q(ring * Math.sin(u)),
      ]);
      colors.push(Math.cos(v) > 0 ? GUM_RGB : TOOTH_RGB);
    }
  }
  const faces: number[][] = [];
  const at = (i: number, j: number) => (i % segU) * segV + (j % segV);
  for (let i = 0; i < segU; i++) {
    for (let j = 0; j < segV; j++) {
      faces.push([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
    }
  }
  return { vertices, faces, colors };
}

/** Fan-triangulated corner stream: 9 floats per triangle. */
export function toSoup(mesh: FixtureMesh): Float32Array {
  const out: number[] = [];
  for (const face of mesh.faces) {
    for (let k = 1; k + 1 < face.length; k++) {
      for (const index of [face[0], face[k], face[k + 1]]) {
        out.push(...mesh.vertices[index]);
      }
    }
  }
  return Float32Array.from(out);
}

/** The parser-side shape of a fixture: fan-triangulated, optionally coloured. */
export function indexedGeometry(
  mesh: FixtureMesh,
  withColors: boolean,
): TriangleGeometry {
  const indices: number[] = [];
  for (const face of mesh.faces) {
    for (let k = 1; k + 1 < face.length; k++) {
      indices.push(face[0], face[k], face[k + 1]);
    }
  }
  return {
    kind: 'triangles',
    positions: Float32Array.from(mesh.vertices.flat()),
    colors: withColors ? Uint8Array.from(mesh.colors.flat()) : null,
    indices: Uint32Array.from(indices),
    triangleCount: indices.length / 3,
  };
}

/** Appends one NaN-poisoned triangle — real exporters do ship them. */
export function withNaNTriangle(soup: Float32Array): Float32Array {
  const out = new Float32Array(soup.length + 9);
  out.set(soup);
  out.fill(NaN, soup.length, soup.length + 3);
  out.set([1, 2, 3, 4, 5, 6], soup.length + 3);
  return out;
}

// ── STL ─────────────────────────────────────────────────────────────────

export function binaryStl(
  soup: Float32Array,
  header = 'oralign fixture',
): Buffer {
  const count = soup.length / 9;
  const buf = Buffer.alloc(84 + count * 50);
  buf.write(header, 0, 'latin1');
  buf.writeUInt32LE(count, 80);
  for (let t = 0; t < count; t++) {
    for (let f = 0; f < 9; f++) {
      buf.writeFloatLE(soup[t * 9 + f], 84 + t * 50 + 12 + f * 4);
    }
  }
  return buf;
}

export function asciiStl(soup: Float32Array): Buffer {
  const lines = ['solid fixture'];
  for (let t = 0; t < soup.length / 9; t++) {
    lines.push('  facet normal 0 0 0', '    outer loop');
    for (let v = 0; v < 3; v++) {
      const o = t * 9 + v * 3;
      lines.push(`      vertex ${soup[o]} ${soup[o + 1]} ${soup[o + 2]}`);
    }
    lines.push('    endloop', '  endfacet');
  }
  lines.push('endsolid fixture', '');
  return Buffer.from(lines.join('\n'), 'latin1');
}

// ── PLY ─────────────────────────────────────────────────────────────────

export type PlyEncoding =
  | 'ascii'
  | 'binary_little_endian'
  | 'binary_big_endian';

export interface PlyOptions {
  format: PlyEncoding;
  /** Colour properties: uchar red/green/blue, float 0..1, or diffuse_* uchar. */
  colors?: 'uchar' | 'float' | 'diffuse' | 'none';
  alpha?: boolean;
  /** Scalar type of x/y/z (any PLY name or alias). */
  positionType?: string;
  /** nx/ny/nz floats before the colours and a trailing double + short. */
  extraVertexProps?: boolean;
  countType?: string;
  indexType?: string;
  indexName?: 'vertex_indices' | 'vertex_index';
  /** A per-face uchar flag and a texcoord float list after the indices. */
  extraFaceProps?: boolean;
  /** An unrelated `edge` element after the faces. */
  extraElement?: boolean;
  /** No face element at all: a point cloud. */
  pointCloud?: boolean;
  /** Put the face element BEFORE the vertex element. */
  facesFirst?: boolean;
  crlf?: boolean;
}

interface PlyProperty {
  type: string;
  value: (vertexIndex: number) => number;
}

export function plyFile(mesh: FixtureMesh, options: PlyOptions): Buffer {
  const positionType = options.positionType ?? 'float';
  const colorMode = options.colors ?? 'none';
  const countType = options.countType ?? 'uchar';
  const indexType = options.indexType ?? 'int';
  const indexName = options.indexName ?? 'vertex_indices';
  const eol = options.crlf ? '\r\n' : '\n';

  const vertexProps: { decl: string; prop: PlyProperty }[] = [];
  const vertexProp = (
    type: string,
    name: string,
    value: PlyProperty['value'],
  ) =>
    vertexProps.push({
      decl: `property ${type} ${name}`,
      prop: { type, value },
    });
  vertexProp(positionType, 'x', (i) => mesh.vertices[i][0]);
  vertexProp(positionType, 'y', (i) => mesh.vertices[i][1]);
  vertexProp(positionType, 'z', (i) => mesh.vertices[i][2]);
  if (options.extraVertexProps) {
    for (const axis of ['nx', 'ny', 'nz']) vertexProp('float', axis, () => 0.5);
  }
  if (colorMode !== 'none') {
    const prefix = colorMode === 'diffuse' ? 'diffuse_' : '';
    const type = colorMode === 'float' ? 'float' : 'uchar';
    const channel = (c: number) => (i: number) =>
      colorMode === 'float' ? mesh.colors[i][c] / 255 : mesh.colors[i][c];
    vertexProp(type, `${prefix}red`, channel(0));
    vertexProp(type, `${prefix}green`, channel(1));
    vertexProp(type, `${prefix}blue`, channel(2));
    if (options.alpha)
      vertexProp(type, `${prefix}alpha`, () => (type === 'float' ? 1 : 255));
  }
  if (options.extraVertexProps) {
    vertexProp('double', 'quality', () => 0.25);
    vertexProp('short', 'flags', () => -3);
  }

  const vertexHeader = [
    `element vertex ${mesh.vertices.length}`,
    ...vertexProps.map((p) => p.decl),
  ];
  const faceHeader = options.pointCloud
    ? []
    : [
        `element face ${mesh.faces.length}`,
        `property list ${countType} ${indexType} ${indexName}`,
        ...(options.extraFaceProps
          ? ['property uchar flag', 'property list uchar float texcoord']
          : []),
      ];
  const edgeHeader = options.extraElement
    ? ['element edge 1', 'property int vertex1', 'property int vertex2']
    : [];
  const header =
    [
      'ply',
      `format ${options.format} 1.0`,
      'comment oralign fixture',
      ...(options.facesFirst
        ? [...faceHeader, ...vertexHeader]
        : [...vertexHeader, ...faceHeader]),
      ...edgeHeader,
      'end_header',
    ].join(eol) + eol;

  // Each record is a list of [type, value] cells; lists expand to count + items.
  type Cell = [string, number];
  const vertexRecords: Cell[][] = mesh.vertices.map((_, i) =>
    vertexProps.map(({ prop }) => [prop.type, prop.value(i)] as Cell),
  );
  const faceRecords: Cell[][] = options.pointCloud
    ? []
    : mesh.faces.map((face) => [
        [countType, face.length] as Cell,
        ...face.map((index) => [indexType, index] as Cell),
        ...(options.extraFaceProps
          ? ([
              ['uchar', 7],
              ['uchar', 2],
              ['float', 0.5],
              ['float', 0.75],
            ] as Cell[])
          : []),
      ]);
  const edgeRecords: Cell[][] = options.extraElement
    ? [
        [
          ['int', 0],
          ['int', 1],
        ],
      ]
    : [];
  const records = options.facesFirst
    ? [...faceRecords, ...vertexRecords, ...edgeRecords]
    : [...vertexRecords, ...faceRecords, ...edgeRecords];

  if (options.format === 'ascii') {
    const body = records
      .map((cells) => cells.map(([, v]) => String(v)).join(' '))
      .join(eol);
    return Buffer.from(header + body + eol, 'latin1');
  }
  const littleEndian = options.format === 'binary_little_endian';
  const size = records.reduce(
    (sum, cells) =>
      sum + cells.reduce((s, [type]) => s + PLY_FIXTURE_SIZES[type], 0),
    0,
  );
  const body = Buffer.alloc(size);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let offset = 0;
  for (const cells of records) {
    for (const [type, value] of cells) {
      writePlyScalar(view, offset, type, value, littleEndian);
      offset += PLY_FIXTURE_SIZES[type];
    }
  }
  return Buffer.concat([Buffer.from(header, 'latin1'), body]);
}

const PLY_FIXTURE_SIZES: Record<string, number> = {
  char: 1,
  int8: 1,
  uchar: 1,
  uint8: 1,
  short: 2,
  int16: 2,
  ushort: 2,
  uint16: 2,
  int: 4,
  int32: 4,
  uint: 4,
  uint32: 4,
  float: 4,
  float32: 4,
  double: 8,
  float64: 8,
};

function writePlyScalar(
  view: DataView,
  offset: number,
  type: string,
  value: number,
  le: boolean,
): void {
  switch (type) {
    case 'char':
    case 'int8':
      return view.setInt8(offset, value);
    case 'uchar':
    case 'uint8':
      return view.setUint8(offset, value);
    case 'short':
    case 'int16':
      return view.setInt16(offset, value, le);
    case 'ushort':
    case 'uint16':
      return view.setUint16(offset, value, le);
    case 'int':
    case 'int32':
      return view.setInt32(offset, value, le);
    case 'uint':
    case 'uint32':
      return view.setUint32(offset, value, le);
    case 'float':
    case 'float32':
      return view.setFloat32(offset, value, le);
    default:
      return view.setFloat64(offset, value, le);
  }
}

// ── OBJ ─────────────────────────────────────────────────────────────────

export interface ObjOptions {
  /** Vertex colours after xyz: 0..1 floats or 0..255 integers. */
  colors?: 'unit' | 'byte' | 'none';
  faceStyle?: 'v' | 'v/vt' | 'v//vn' | 'v/vt/vn';
  /** Relative indices, counted back from the last vertex defined. */
  negative?: boolean;
  /** Comments, mtllib/usemtl, o/g/s and vt/vn statements around the geometry. */
  extras?: boolean;
  /** No `f` statement at all: a point cloud. */
  pointCloud?: boolean;
  crlf?: boolean;
}

export function objFile(mesh: FixtureMesh, options: ObjOptions = {}): Buffer {
  const colorMode = options.colors ?? 'none';
  const style = options.faceStyle ?? 'v';
  const lines: string[] = [];
  if (options.extras) {
    lines.push('# oralign fixture', 'mtllib scan.mtl', 'o arch', 'g upper');
  }
  mesh.vertices.forEach(([x, y, z], i) => {
    const c = mesh.colors[i];
    const color =
      colorMode === 'unit'
        ? ` ${c[0] / 255} ${c[1] / 255} ${c[2] / 255}`
        : colorMode === 'byte'
          ? ` ${c[0]} ${c[1]} ${c[2]}`
          : '';
    lines.push(`v ${x} ${y} ${z}${color}`);
  });
  if (options.extras) {
    lines.push('vt 0.5 0.5', 'vn 0 0 1', 'usemtl gum', 's 1');
  }
  if (!options.pointCloud) {
    const n = mesh.vertices.length;
    for (const face of mesh.faces) {
      const refs = face.map((index) => {
        const v = options.negative ? String(index - n) : String(index + 1);
        switch (style) {
          case 'v/vt':
            return `${v}/1`;
          case 'v//vn':
            return `${v}//1`;
          case 'v/vt/vn':
            return `${v}/1/1`;
          default:
            return v;
        }
      });
      lines.push(`f ${refs.join(' ')}`);
    }
  }
  lines.push('');
  return Buffer.from(lines.join(options.crlf ? '\r\n' : '\n'), 'utf8');
}

// ── GLB ─────────────────────────────────────────────────────────────────

export interface GltfAccessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: 'SCALAR' | 'VEC3' | 'VEC4';
  normalized?: boolean;
  min?: number[];
  max?: number[];
}

export interface GltfBufferView {
  buffer: number;
  byteOffset: number;
  byteLength: number;
  byteStride?: number;
  target?: number;
}

export interface GltfJson {
  asset: { version: string };
  meshes: {
    primitives: {
      attributes: Record<string, number>;
      indices: number;
      mode: number;
    }[];
  }[];
  accessors: GltfAccessor[];
  bufferViews: GltfBufferView[];
  buffers: { byteLength: number }[];
}

/**
 * Splits a GLB into its JSON and BIN chunks, checking the container itself
 * (magic, version, declared lengths, chunk types, 4-byte chunk alignment).
 */
export function readGlb(glb: Buffer): { json: GltfJson; bin: Buffer } {
  const fail = (what: string) => {
    throw new Error(`Invalid GLB: ${what}`);
  };
  if (glb.readUInt32LE(0) !== 0x46546c67) fail('magic');
  if (glb.readUInt32LE(4) !== 2) fail('version');
  if (glb.readUInt32LE(8) !== glb.length) fail('total length');
  const jsonLength = glb.readUInt32LE(12);
  if (glb.readUInt32LE(16) !== 0x4e4f534a) fail('JSON chunk type');
  if (jsonLength % 4 !== 0) fail('JSON chunk padding');
  const json = JSON.parse(
    glb.toString('utf8', 20, 20 + jsonLength),
  ) as GltfJson;
  const binAt = 20 + jsonLength;
  const binLength = glb.readUInt32LE(binAt);
  if (glb.readUInt32LE(binAt + 4) !== 0x004e4942) fail('BIN chunk type');
  if (binLength % 4 !== 0) fail('BIN chunk padding');
  if (binAt + 8 + binLength !== glb.length) fail('BIN chunk length');
  if (json.buffers[0].byteLength > binLength) fail('buffer length');
  return { json, bin: glb.subarray(binAt + 8, binAt + 8 + binLength) };
}

const COMPONENTS = { SCALAR: 1, VEC3: 3, VEC4: 4 } as const;

/** An accessor's raw values (normalized integers are NOT scaled). */
export function accessorValues(
  gltf: { json: GltfJson; bin: Buffer },
  index: number,
): number[] {
  const accessor = gltf.json.accessors[index];
  const view = gltf.json.bufferViews[accessor.bufferView];
  const start = view.byteOffset + (accessor.byteOffset ?? 0);
  const n = accessor.count * COMPONENTS[accessor.type];
  const bytes = gltf.bin.subarray(start, view.byteOffset + view.byteLength);
  const read: Record<number, (i: number) => number> = {
    5121: (i) => bytes[i],
    5125: (i) => bytes.readUInt32LE(i * 4),
    5126: (i) => bytes.readFloatLE(i * 4),
  };
  return Array.from({ length: n }, (_, i) => read[accessor.componentType](i));
}
