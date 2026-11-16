/**
 * 3D scan processor (STL, PLY, OBJ) for the async media pipeline.
 *
 * Pure module by design: no NestJS imports — only node:fs / node:path / sharp
 * and the shared pipeline types — so it can be unit-tested standalone and
 * later moved into a worker thread or a BullMQ sandboxed processor without
 * untangling any DI.
 *
 * For every uploaded scan we derive, NEXT TO the original (never modified):
 *   `${baseName}__thumb.webp` — ~300px software-rendered preview, in the
 *                               scanner's colours when it exported any
 *   `${baseName}__model.glb`  — deduplicated, indexed glTF binary for the
 *                               in-browser viewer (three.js GLTFLoader),
 *                               with COLOR_0 for a coloured scan
 * A point cloud (vertices without faces) gets the thumbnail only: the viewer
 * draws it from the original file.
 *
 * GLB and thumbnail are each best-effort: a failure in either simply omits
 * that variant — metadata alone is a successful result. Only a file we cannot
 * parse at all throws.
 */
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
import type {
  MediaVariants,
  MeshFormat,
  MeshMetadata,
  MeshProcessResult,
} from '../../media.types';
import { withFileSource } from './byte-source';
import { buildGlb } from './glb.writer';
import type { MeshGeometry, ParsedMesh } from './mesh.types';
import { readObj } from './obj.parser';
import { readPly } from './ply.parser';
import { RENDER_SIZE, renderPreview } from './preview.renderer';
import { readStl } from './stl.parser';

/**
 * Files up to this size are parsed in full. 80 MB of binary STL ≈ 1.67M
 * triangles ≈ a ~60 MB Float32Array of vertex data on top of the raw buffer —
 * comfortably inside Node's default heap with headroom left for the GLB dedup
 * map. Anything larger is STREAMED to compute metadata only (no GLB, no
 * thumbnail): unbounded whole-file buffering is the one thing here that
 * could OOM the whole pipeline.
 */
const FULL_PARSE_MAX_BYTES = 80 * 1024 * 1024;

/**
 * GLB conversion cap. The vertex dedup uses a string-keyed Map (simple and
 * collision-free); at 2M triangles / up to 6M keys it can transiently cost a
 * few hundred MB, which is the acceptable worst case for one background job.
 * Past the cap we still produce metadata + thumbnail and just skip the GLB.
 */
const GLB_MAX_TRIANGLES = 2_000_000;

const THUMB_SIZE = 300;

export interface MeshProcessArgs {
  /** Absolute path of the original scan (never modified). */
  absPath: string;
  /** Absolute directory to write derived files into (same dir as original). */
  absDir: string;
  /** Uploads-root-relative POSIX dir used for MediaVariantInfo.path values. */
  relDir: string;
  /** Filename stem for derived files (no extension). */
  baseName: string;
}

type MeshReader = (
  absPath: string,
  fileSize: number,
  collect: boolean,
) => Promise<ParsedMesh>;

const READERS: Readonly<Record<MeshFormat, MeshReader>> = {
  stl: readStl,
  ply: (absPath, _size, collect) =>
    withFileSource(absPath, (src) => readPly(src, collect)),
  obj: (absPath, _size, collect) =>
    withFileSource(absPath, (src) => readObj(src, collect)),
};

export async function processMesh(
  format: MeshFormat,
  args: MeshProcessArgs,
): Promise<MeshProcessResult> {
  const { absPath, absDir, relDir, baseName } = args;
  const { size: fileSize } = await fsp.stat(absPath);
  // Past the cap the reader only scans for metadata and returns no geometry,
  // so no variant is attempted (see FULL_PARSE_MAX_BYTES).
  const parsed = await READERS[format](
    absPath,
    fileSize,
    fileSize <= FULL_PARSE_MAX_BYTES,
  );
  const { geometry } = parsed;
  const { bbox, hasFiniteVertex } = parsed.bbox;

  const variants: MediaVariants = {};
  // Reported as the source count unless the GLB dedup ran to completion below.
  let vertexCount = parsed.vertexCount;

  // ---- GLB conversion (best-effort) --------------------------------------
  if (
    geometry?.kind === 'triangles' &&
    geometry.triangleCount > 0 &&
    geometry.triangleCount <= GLB_MAX_TRIANGLES &&
    hasFiniteVertex
  ) {
    try {
      const built = buildGlb(geometry, bbox);
      if (built !== null) {
        // The dedup completed, so the unique count is the truthful vertex
        // count even if the size comparison below skips the file write.
        vertexCount = built.uniqueVertexCount;
        // Tiny STL models lose the trade: ~600 B of JSON scaffolding plus
        // 12 B/triangle of indices can exceed STL's flat 50 B/triangle, and a
        // GLB that is not strictly smaller buys the viewer nothing. PLY/OBJ
        // always keep theirs: the raw file needs a JS parse (and colour
        // conversion) in the browser, while the GLB maps straight onto GPU
        // buffers, so even an equal-size GLB is the cheaper one to display.
        if (format !== 'stl' || built.glb.byteLength < fileSize) {
          const name = `${baseName}__model.glb`;
          await fsp.writeFile(path.join(absDir, name), built.glb);
          variants.model = {
            path: path.posix.join(relDir, name),
            sizeBytes: built.glb.byteLength,
            format: 'glb',
          };
        }
      }
    } catch {
      // Best-effort isolation: a conversion bug must never fail the job —
      // the original stays downloadable and metadata is already computed.
    }
  }

  // ---- Thumbnail (best-effort, isolated for the same reason) -------------
  if (geometry && primitiveCount(geometry) > 0 && hasFiniteVertex) {
    try {
      const rgba = renderPreview(geometry, bbox);
      const name = `${baseName}__thumb.webp`;
      const info = await sharp(Buffer.from(rgba.buffer, 0, rgba.byteLength), {
        raw: { width: RENDER_SIZE, height: RENDER_SIZE, channels: 4 },
      })
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside' })
        .webp({ quality: 80 })
        .toFile(path.join(absDir, name));
      variants.thumb = {
        path: path.posix.join(relDir, name),
        // Actual encoder output dimensions, not the requested box.
        width: info.width,
        height: info.height,
        sizeBytes: info.size,
        format: 'webp',
      };
    } catch {
      // Render or encode failure ⇒ no thumb variant; never fails the job.
    }
  }

  return { metadata: toMetadata(format, parsed, vertexCount), variants };
}

function primitiveCount(geometry: MeshGeometry): number {
  return geometry.kind === 'triangles'
    ? geometry.triangleCount
    : geometry.pointCount;
}

function toMetadata(
  kind: MeshFormat,
  parsed: ParsedMesh,
  vertexCount: number,
): MeshMetadata {
  // The optional flags are only ever present as `true`, so an STL row keeps
  // the exact shape it had before PLY/OBJ support.
  return {
    kind,
    format: parsed.format,
    triangleCount: parsed.triangleCount,
    vertexCount,
    bbox: parsed.bbox.bbox,
    ...(parsed.hasColors ? { hasColors: true } : {}),
    ...(parsed.pointCloud ? { pointCloud: true } : {}),
  };
}
