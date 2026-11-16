/**
 * PLY (ascii, binary_little_endian, binary_big_endian) → indexed mesh or
 * point cloud, with the scanner's per-vertex colours when present.
 *
 * Only `vertex` (x/y/z + optional red/green/blue) and `face` (the
 * vertex_indices list) are read; every other property and element is
 * skipped by its declared size, so scanner extras (normals, quality,
 * texcoords, edges…) never need special cases.
 */
import { ByteSource, forEachLine, tokensOf } from './byte-source';
import { MeshBuilder } from './mesh-builder';
import type { ParsedMesh } from './mesh.types';

export type PlyEncoding =
  | 'ascii'
  | 'binary_little_endian'
  | 'binary_big_endian';

type PlyScalar =
  | 'int8'
  | 'uint8'
  | 'int16'
  | 'uint16'
  | 'int32'
  | 'uint32'
  | 'float32'
  | 'float64';

/** Classic names and their sized aliases. */
const SCALARS: ReadonlyMap<string, PlyScalar> = new Map([
  ['char', 'int8'],
  ['int8', 'int8'],
  ['uchar', 'uint8'],
  ['uint8', 'uint8'],
  ['short', 'int16'],
  ['int16', 'int16'],
  ['ushort', 'uint16'],
  ['uint16', 'uint16'],
  ['int', 'int32'],
  ['int32', 'int32'],
  ['uint', 'uint32'],
  ['uint32', 'uint32'],
  ['float', 'float32'],
  ['float32', 'float32'],
  ['double', 'float64'],
  ['float64', 'float64'],
]);

const BYTES: Readonly<Record<PlyScalar, number>> = {
  int8: 1,
  uint8: 1,
  int16: 2,
  uint16: 2,
  int32: 4,
  uint32: 4,
  float32: 4,
  float64: 8,
};

const ENCODINGS: ReadonlySet<string> = new Set<PlyEncoding>([
  'ascii',
  'binary_little_endian',
  'binary_big_endian',
]);

export interface PlyProperty {
  name: string;
  /** Scalar type, or the item type of a list. */
  type: PlyScalar;
  /** Count type of `property list <count> <item> <name>`; null for a scalar. */
  countType: PlyScalar | null;
}

export interface PlyElement {
  name: string;
  count: number;
  properties: PlyProperty[];
}

export interface PlyHeader {
  encoding: PlyEncoding;
  elements: PlyElement[];
  /** Bytes up to and including the line break after `end_header`. */
  byteLength: number;
}

/** Real headers are well under 4 KB; end_header is never searched for unboundedly. */
export const PLY_MAX_HEADER_BYTES = 64 * 1024;

/** A face lists a handful of corners; a huge declared count is a broken or hostile file. */
const MAX_LIST_ITEMS = 1 << 16;

/**
 * Parses and validates the header from the file's first bytes. Throws when
 * they are not a PLY header — the upload gate relies on that.
 */
export function parsePlyHeader(head: Buffer): PlyHeader {
  const text = head.toString(
    'latin1',
    0,
    Math.min(head.length, PLY_MAX_HEADER_BYTES),
  );
  const firstBreak = text.indexOf('\n');
  if (firstBreak === -1 || text.slice(0, firstBreak).trimEnd() !== 'ply') {
    throw new Error('Missing PLY magic line');
  }
  let encoding: PlyEncoding | null = null;
  const elements: PlyElement[] = [];
  let offset = firstBreak + 1;
  for (;;) {
    const nl = text.indexOf('\n', offset);
    if (nl === -1) throw new Error('PLY header has no end_header');
    const line = text.slice(offset, nl).trim();
    offset = nl + 1;
    if (line === '') continue;

    const [keyword, ...args] = line.split(/\s+/);
    switch (keyword) {
      case 'comment':
      case 'obj_info':
        break;
      case 'format':
        if (encoding !== null || elements.length > 0) {
          throw new Error('Misplaced PLY format line');
        }
        if (!ENCODINGS.has(args[0]) || !/^1(\.0+)?$/.test(args[1] ?? '')) {
          throw new Error(`Unsupported PLY format: ${args.join(' ')}`);
        }
        encoding = args[0] as PlyEncoding;
        break;
      case 'element':
        if (encoding === null || !args[0] || !/^\d+$/.test(args[1] ?? '')) {
          throw new Error(`Invalid PLY element line: ${line}`);
        }
        elements.push({
          name: args[0],
          count: Number(args[1]),
          properties: [],
        });
        break;
      case 'property': {
        const element = elements.at(-1);
        if (!element) throw new Error('PLY property outside an element');
        element.properties.push(parseProperty(args, line));
        break;
      }
      case 'end_header':
        if (encoding === null) throw new Error('PLY header has no format line');
        return { encoding, elements, byteLength: offset };
      default:
        throw new Error(`Unexpected PLY header line: ${keyword}`);
    }
  }
}

function parseProperty(args: string[], line: string): PlyProperty {
  if (args[0] === 'list') {
    const countType = SCALARS.get(args[1]);
    const type = SCALARS.get(args[2]);
    if (!countType || countType.startsWith('float') || !type || !args[3]) {
      throw new Error(`Invalid PLY list property: ${line}`);
    }
    return { name: args[3], type, countType };
  }
  const type = SCALARS.get(args[0]);
  if (!type || !args[1]) throw new Error(`Invalid PLY property: ${line}`);
  return { name: args[1], type, countType: null };
}

export async function readPly(
  src: ByteSource,
  collect: boolean,
): Promise<ParsedMesh> {
  await src.ensure(PLY_MAX_HEADER_BYTES); // a smaller file simply ends sooner
  const header = parsePlyHeader(src.buf.subarray(src.pos, src.end));
  src.pos += header.byteLength;
  const { plans, colorRange } = planBody(header);
  const countOf = (role: ElementPlan['role']) =>
    plans.find((plan) => plan.role === role)?.element.count ?? 0;
  const builder = new MeshBuilder(collect, {
    vertices: countOf('vertex'),
    triangles: countOf('face'),
  });
  if (header.encoding === 'ascii') {
    await readAsciiBody(src, plans, builder);
  } else {
    const littleEndian = header.encoding === 'binary_little_endian';
    await readBinaryBody(src, plans, builder, littleEndian);
  }
  return builder.finish(header.encoding, colorRange);
}

// ---------------------------------------------------------------------------
// Body plan: which element feeds the mesh, through which property slots
// ---------------------------------------------------------------------------

type Slots = [number, number, number];

interface VertexPlan {
  role: 'vertex';
  element: PlyElement;
  xyz: Slots;
  rgb: Slots | null;
}

interface FacePlan {
  role: 'face';
  element: PlyElement;
  /** Slot of the vertex_indices list. */
  list: number;
}

type ElementPlan =
  | VertexPlan
  | FacePlan
  | { role: 'skip'; element: PlyElement };

function planBody(header: PlyHeader): {
  plans: ElementPlan[];
  /** Channel value meaning full intensity, from the colour property type. */
  colorRange: number;
} {
  let colorRange = 255;
  let vertex: VertexPlan | null = null;
  let face: FacePlan | null = null;
  const plans = header.elements.map((element): ElementPlan => {
    const scalar = (name: string) =>
      element.properties.findIndex(
        (p) => p.name === name && p.countType === null,
      );
    const slots = (prefix: string): Slots => [
      scalar(`${prefix}red`),
      scalar(`${prefix}green`),
      scalar(`${prefix}blue`),
    ];
    if (element.name === 'vertex' && vertex === null) {
      const xyz: Slots = [scalar('x'), scalar('y'), scalar('z')];
      if (xyz.includes(-1)) throw new Error('PLY vertex element lacks x/y/z');
      const rgb =
        [slots(''), slots('diffuse_')].find((s) => !s.includes(-1)) ?? null;
      if (rgb) colorRange = rangeOf(element.properties[rgb[0]].type);
      vertex = { role: 'vertex', element, xyz, rgb };
      return vertex;
    }
    const list = element.properties.findIndex(
      (p) =>
        p.countType !== null &&
        (p.name === 'vertex_indices' || p.name === 'vertex_index'),
    );
    if (element.name === 'face' && face === null && list !== -1) {
      face = { role: 'face', element, list };
      return face;
    }
    return { role: 'skip', element };
  });
  if (vertex === null) throw new Error('PLY file has no vertex element');
  return { plans, colorRange };
}

function rangeOf(type: PlyScalar): number {
  switch (type) {
    case 'float32':
    case 'float64':
      return 1;
    case 'uint16':
      return 65535;
    default:
      return 255;
  }
}

// ---------------------------------------------------------------------------
// Body readers: both fill one Scratch per instance, then `emit`
// ---------------------------------------------------------------------------

/** Reused per-instance storage: scalar values by property slot, list corners. */
class Scratch {
  values = new Float64Array(16);
  corners = new Float64Array(16);
  cornerCount = 0;

  fitValues(n: number): void {
    if (n > this.values.length) this.values = new Float64Array(n);
  }

  fitCorners(n: number): void {
    if (n > this.corners.length) this.corners = new Float64Array(n);
    this.cornerCount = n;
  }
}

function emit(plan: ElementPlan, s: Scratch, builder: MeshBuilder): void {
  if (plan.role === 'vertex') {
    const v = s.values;
    const { xyz, rgb } = plan;
    if (rgb) {
      builder.addColoredVertex(
        v[xyz[0]],
        v[xyz[1]],
        v[xyz[2]],
        v[rgb[0]],
        v[rgb[1]],
        v[rgb[2]],
      );
    } else {
      builder.addVertex(v[xyz[0]], v[xyz[1]], v[xyz[2]]);
    }
  } else if (plan.role === 'face') {
    builder.addPolygon(s.corners, s.cornerCount);
  }
}

const truncated = () => new Error('Truncated PLY body');

function listLength(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > MAX_LIST_ITEMS) {
    throw new Error('Invalid PLY list length');
  }
  return n;
}

/** Each element instance is one line of whitespace-separated numbers. */
async function readAsciiBody(
  src: ByteSource,
  plans: ElementPlan[],
  builder: MeshBuilder,
): Promise<void> {
  const s = new Scratch();
  let e = 0;
  let instance = 0;
  const skipFinished = () => {
    while (e < plans.length && instance >= plans[e].element.count) {
      e++;
      instance = 0;
    }
  };
  skipFinished();
  await forEachLine(src, (buf, start, end) => {
    if (e >= plans.length) return; // trailing lines past the declared counts
    const tokens = tokensOf(buf, start, end);
    if (tokens.length === 0) return;
    const plan = plans[e];
    if (plan.role !== 'skip') {
      const { properties } = plan.element;
      s.fitValues(properties.length);
      s.cornerCount = 0;
      let t = 0;
      for (let p = 0; p < properties.length; p++) {
        if (properties[p].countType === null) {
          s.values[p] = parseFloat(tokens[t++]);
          continue;
        }
        const n = listLength(Number(tokens[t++]));
        if (plan.role === 'face' && p === plan.list) {
          s.fitCorners(n);
          for (let k = 0; k < n; k++) s.corners[k] = Number(tokens[t + k]);
        }
        t += n;
      }
      emit(plan, s, builder);
    }
    instance++;
    skipFinished();
  });
  if (e < plans.length) throw truncated();
}

async function readBinaryBody(
  src: ByteSource,
  plans: ElementPlan[],
  builder: MeshBuilder,
  le: boolean,
): Promise<void> {
  const s = new Scratch();
  // Called only when the window runs short, so the hot loops never await.
  const refill = async (n: number) => {
    if (!(await src.ensure(n))) throw truncated();
  };
  for (const plan of plans) {
    const { properties, count } = plan.element;
    s.fitValues(properties.length);
    const fixed = properties.every((p) => p.countType === null)
      ? properties.reduce((sum, p) => sum + BYTES[p.type], 0)
      : null;
    if (plan.role === 'skip' && fixed !== null) {
      await skip(src, fixed * count);
      continue;
    }
    for (let i = 0; i < count; i++) {
      if (fixed !== null && src.available < fixed) await refill(fixed);
      s.cornerCount = 0;
      for (let p = 0; p < properties.length; p++) {
        const { type, countType } = properties[p];
        if (countType === null) {
          if (fixed === null && src.available < BYTES[type]) {
            await refill(BYTES[type]);
          }
          s.values[p] = readScalar(src.buf, src.pos, type, le);
          src.pos += BYTES[type];
          continue;
        }
        if (src.available < BYTES[countType]) await refill(BYTES[countType]);
        const n = listLength(readScalar(src.buf, src.pos, countType, le));
        src.pos += BYTES[countType];
        const bytes = n * BYTES[type];
        if (src.available < bytes) await refill(bytes);
        if (plan.role === 'face' && p === plan.list) {
          s.fitCorners(n);
          for (let k = 0; k < n; k++) {
            s.corners[k] = readScalar(
              src.buf,
              src.pos + k * BYTES[type],
              type,
              le,
            );
          }
        }
        src.pos += bytes;
      }
      emit(plan, s, builder);
    }
  }
}

async function skip(src: ByteSource, bytes: number): Promise<void> {
  let left = bytes;
  for (;;) {
    const take = Math.min(left, src.available);
    src.pos += take;
    left -= take;
    if (left === 0) return;
    if (!(await src.more())) throw truncated();
  }
}

function readScalar(
  buf: Buffer,
  at: number,
  type: PlyScalar,
  le: boolean,
): number {
  switch (type) {
    case 'int8':
      return buf.readInt8(at);
    case 'uint8':
      return buf[at];
    case 'int16':
      return le ? buf.readInt16LE(at) : buf.readInt16BE(at);
    case 'uint16':
      return le ? buf.readUInt16LE(at) : buf.readUInt16BE(at);
    case 'int32':
      return le ? buf.readInt32LE(at) : buf.readInt32BE(at);
    case 'uint32':
      return le ? buf.readUInt32LE(at) : buf.readUInt32BE(at);
    case 'float32':
      return le ? buf.readFloatLE(at) : buf.readFloatBE(at);
    case 'float64':
      return le ? buf.readDoubleLE(at) : buf.readDoubleBE(at);
  }
}
