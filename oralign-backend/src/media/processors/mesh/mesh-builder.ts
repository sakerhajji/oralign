/**
 * Collects the vertices and polygons the PLY and OBJ parsers stream out, so
 * both formats share one triangulation / validation / colour path. With
 * `collect: false` only counts, colour presence and the bbox are kept —
 * the metadata-only scan of files past the parse cap.
 */
import { bboxAdd, bboxFinish, newBboxAcc } from './bbox';
import { type ParsedMesh, NEUTRAL_RGB } from './mesh.types';

/** Typed-array vector with amortized O(1) push. */
class Growable<T extends Float32Array | Uint32Array> {
  length = 0;
  private data: T;

  constructor(
    private readonly make: (size: number) => T,
    capacity: number,
  ) {
    this.data = make(Math.max(64, capacity));
  }

  push3(a: number, b: number, c: number): void {
    if (this.length + 3 > this.data.length) {
      const next = this.make(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = a;
    this.data[this.length++] = b;
    this.data[this.length++] = c;
  }

  /** Live storage: valid entries are [0, length). */
  get raw(): T {
    return this.data;
  }
}

const floats = (n: number) => new Float32Array(n);
const uints = (n: number) => new Uint32Array(n);

/** Header counts are only a hint: clamped so a lying one cannot pre-allocate GBs. */
const MAX_PRESIZE = 1 << 22;
const presize = (n: number) => Math.min(Math.max(0, n), MAX_PRESIZE);

const isIndex = (value: number) =>
  Number.isInteger(value) && value >= 0 && value <= 0xffffffff;

export class MeshBuilder {
  private vertices = 0;
  private triangles = 0;
  private sawFaces = false;
  private sawColor = false;
  private colorMax = 0;
  private readonly bbox = newBboxAcc();
  private readonly positions: Growable<Float32Array> | null;
  private readonly indices: Growable<Uint32Array> | null;
  /** Raw channel values, NaN for an uncoloured vertex; created on first colour. */
  private colors: Growable<Float32Array> | null = null;

  constructor(
    collect: boolean,
    expected: { vertices: number; triangles: number } = {
      vertices: 0,
      triangles: 0,
    },
  ) {
    this.positions = collect
      ? new Growable(floats, presize(expected.vertices * 3))
      : null;
    this.indices = collect
      ? new Growable(uints, presize(expected.triangles * 3))
      : null;
  }

  /** Vertices added so far — what an OBJ negative index counts back from. */
  get vertexCount(): number {
    return this.vertices;
  }

  addVertex(x: number, y: number, z: number): void {
    this.colors?.push3(NaN, NaN, NaN);
    this.pushPosition(x, y, z);
  }

  /** Channels in the source's own range; `finish` maps that range to 0..255. */
  addColoredVertex(
    x: number,
    y: number,
    z: number,
    r: number,
    g: number,
    b: number,
  ): void {
    this.sawColor = true;
    const max = Math.max(r, g, b);
    if (max > this.colorMax) this.colorMax = max;
    if (this.positions && this.colors === null) {
      // First colour after uncoloured vertices: backfill those as uncoloured.
      this.colors = new Growable(floats, this.positions.raw.length);
      for (let v = 0; v < this.vertices; v++) {
        this.colors.push3(NaN, NaN, NaN);
      }
    }
    this.colors?.push3(r, g, b);
    this.pushPosition(x, y, z);
  }

  /**
   * Fan-triangulates polygon corners[0..n) (0-based vertex indices). Range
   * checks against the vertex count wait for `finish`: faces may precede or
   * forward-reference their vertices.
   */
  addPolygon(corners: ArrayLike<number>, n: number): void {
    this.sawFaces = true;
    for (let k = 0; k < n; k++) if (!isIndex(corners[k])) return;
    for (let k = 1; k + 1 < n; k++) {
      this.triangles++;
      this.indices?.push3(corners[0], corners[k], corners[k + 1]);
    }
  }

  /**
   * `colorRange` is the channel value meaning full intensity (1 for float
   * colours, 255 for bytes); 'auto' decides from the largest value seen —
   * OBJ does not declare its range, and a per-vertex guess would read a
   * near-black 0..255 vertex as 0..1 white.
   */
  finish(
    format: ParsedMesh['format'],
    colorRange: number | 'auto',
  ): ParsedMesh {
    const pointCloud = !this.sawFaces && this.vertices > 0;
    const base = {
      format,
      triangleCount: this.triangles,
      vertexCount: this.vertices,
      hasColors: this.sawColor,
      pointCloud,
      bbox: bboxFinish(this.bbox),
    };
    if (!this.positions || !this.indices) return { ...base, geometry: null };

    const positions = this.positions.raw.subarray(0, this.vertices * 3);
    const range =
      colorRange === 'auto' ? (this.colorMax > 1 ? 255 : 1) : colorRange;
    const colors = this.colors
      ? toBytes(this.colors.raw, this.vertices, range)
      : null;
    if (pointCloud) {
      return {
        ...base,
        geometry: {
          kind: 'points',
          positions,
          colors,
          pointCount: this.vertices,
        },
      };
    }
    const indices = keepValidTriangles(
      this.indices.raw,
      this.indices.length,
      this.vertices,
    );
    const triangleCount = indices.length / 3;
    return {
      ...base,
      triangleCount,
      geometry: {
        kind: 'triangles',
        positions,
        colors,
        indices,
        triangleCount,
      },
    };
  }

  private pushPosition(x: number, y: number, z: number): void {
    // Bbox from the stored float32 values, so it matches the GLB data
    // exactly whether the source spelled them in text or doubles.
    bboxAdd(this.bbox, Math.fround(x), Math.fround(y), Math.fround(z));
    this.positions?.push3(x, y, z);
    this.vertices++;
  }
}

/** Compacts (in place) away every triangle referencing a missing vertex. */
function keepValidTriangles(
  raw: Uint32Array,
  length: number,
  vertexCount: number,
): Uint32Array {
  let w = 0;
  for (let r = 0; r + 2 < length; r += 3) {
    const a = raw[r];
    const b = raw[r + 1];
    const c = raw[r + 2];
    if (a < vertexCount && b < vertexCount && c < vertexCount) {
      raw[w++] = a;
      raw[w++] = b;
      raw[w++] = c;
    }
  }
  return raw.subarray(0, w);
}

function toBytes(
  raw: Float32Array,
  vertexCount: number,
  range: number,
): Uint8Array {
  const out = new Uint8Array(vertexCount * 3);
  const scale = 255 / range;
  for (let i = 0; i < vertexCount * 3; i++) {
    const value = raw[i];
    out[i] = Number.isFinite(value)
      ? Math.min(255, Math.max(0, Math.round(value * scale)))
      : NEUTRAL_RGB[i % 3];
  }
  return out;
}
