/**
 * Pure helpers behind the 3D scan viewer. No three.js, no React and no
 * imports at all, so they run as-is under Node's type stripping
 * (`node --test src/components/orders/model-viewer/model-format.test.mjs`).
 */

export const MODEL_FORMATS = ['stl', 'ply', 'obj'] as const;
export type ModelFormat = (typeof MODEL_FORMATS)[number];

/** The 3D format a file name declares by its extension, or null. */
export function modelFormatOf(fileName: string): ModelFormat | null {
  const dot = fileName.lastIndexOf('.');
  if (dot === -1) return null;
  const extension = fileName.slice(dot + 1).toLowerCase();
  return (MODEL_FORMATS as readonly string[]).includes(extension)
    ? (extension as ModelFormat)
    : null;
}

export interface PlyHeaderFacts {
  /** Declared `element face` count; 0 means the scan is a point cloud. */
  faceCount: number;
  /** Colours stored as float/double (0..1) rather than uchar (0..255). */
  floatColors: boolean;
}

const PLY_COLOR_PROPERTIES = new Set(['red', 'diffuse_red', 'r', 'diffuse_r']);
const PLY_FLOAT_TYPES = new Set(['float', 'float32', 'double', 'float64']);

/**
 * The PLY header text (everything before `end_header`), or null when the
 * buffer is not a PLY. The header is ASCII even in binary files, and real
 * headers are a few hundred bytes, so 64 KB is a generous ceiling.
 */
export function readPlyHeader(bytes: Uint8Array): string | null {
  const text = new TextDecoder().decode(bytes.subarray(0, 64 * 1024));
  if (!text.startsWith('ply')) return null;
  const end = text.indexOf('end_header');
  return end === -1 ? null : text.slice(0, end);
}

/**
 * What three's PLYLoader does not tell us: whether faces exist, and whether
 * colours are floats. PLYLoader always divides colours by 255, so float
 * colours come out near-black unless the caller scales them back up.
 * When faces carry colours, PLYLoader uses those instead of the vertex
 * ones, so their type is the one that matters.
 */
export function parsePlyHeader(header: string): PlyHeaderFacts {
  let element = '';
  let faceCount = 0;
  const colorType: Record<string, string> = {};

  for (const line of header.split(/\r?\n/)) {
    const words = line.trim().split(/\s+/);
    if (words[0] === 'element') {
      element = words[1] ?? '';
      if (element === 'face') faceCount = Number(words[2]) || 0;
    } else if (
      words[0] === 'property' &&
      words[1] !== 'list' &&
      PLY_COLOR_PROPERTIES.has(words[2] ?? '') &&
      !(element in colorType)
    ) {
      colorType[element] = words[1] ?? '';
    }
  }

  const sourceType = colorType.face ?? colorType.vertex;
  return {
    faceCount,
    floatColors: sourceType !== undefined && PLY_FLOAT_TYPES.has(sourceType),
  };
}

/**
 * OBJ has no colour convention: scanners write `v x y z r g b` in either
 * 0..1 or 0..255. Any component above 1 can only mean bytes.
 */
export function colorsLookLikeBytes(values: ArrayLike<number>): boolean {
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] > 1) return true;
  }
  return false;
}

/**
 * World-space point size for a cloud framed to the viewer's 1.35 radius:
 * roughly the spacing between neighbouring points, so the surface reads as
 * closed when zoomed in without turning into blobs at the default zoom.
 */
export function pointSizeFor(pointCount: number): number {
  if (pointCount <= 0) return 0.04;
  return Math.min(0.04, Math.max(0.002, 2.4 / Math.sqrt(pointCount)));
}

export interface ModelFacts {
  triangleCount: number;
  vertexCount: number;
}

/**
 * Geometry facts the media pipeline stored for a scan (`mediaMetadata` of
 * kind stl, ply or obj). A point cloud has vertices but no triangles.
 */
export function modelFactsOf(metadata: unknown): ModelFacts | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const { kind, triangleCount, vertexCount } = metadata as Record<string, unknown>;
  if (typeof kind !== 'string' || !(MODEL_FORMATS as readonly string[]).includes(kind)) {
    return null;
  }
  return {
    triangleCount: typeof triangleCount === 'number' ? triangleCount : 0,
    vertexCount: typeof vertexCount === 'number' ? vertexCount : 0,
  };
}
