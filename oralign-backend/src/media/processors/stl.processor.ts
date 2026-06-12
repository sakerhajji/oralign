/**
 * STL processor for the async media pipeline.
 *
 * Pure module by design: no NestJS imports — only node:fs / node:path / sharp
 * and the shared pipeline types — so it can be unit-tested standalone and
 * later moved into a worker thread or a BullMQ sandboxed processor without
 * untangling any DI.
 *
 * For every uploaded .stl we derive, NEXT TO the original (never modified):
 *   `${baseName}__thumb.webp` — ~300px software-rendered preview
 *   `${baseName}__model.glb`  — deduplicated, indexed glTF binary for the
 *                               in-browser viewer (three.js GLTFLoader)
 *
 * GLB and thumbnail are each best-effort: a failure in either simply omits
 * that variant — metadata alone is a successful result. Only a file we cannot
 * parse at all throws.
 */
import { createReadStream, promises as fsp } from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
import type { MediaVariants, StlMetadata, StlProcessResult } from '../media.types';

/**
 * Files up to this size are parsed from a single in-memory Buffer (simplest
 * and fastest). 80 MB of binary STL ≈ 1.67M triangles ≈ a ~60 MB Float32Array
 * of vertex data on top of the raw buffer — comfortably inside Node's default
 * heap with headroom left for the GLB dedup map. Anything larger is STREAMED
 * to compute metadata only (no GLB, no thumbnail): unbounded whole-file
 * buffering is the one thing here that could OOM the whole pipeline.
 */
const FULL_PARSE_MAX_BYTES = 80 * 1024 * 1024;

/**
 * GLB conversion cap. The vertex dedup uses a string-keyed Map (simple and
 * collision-free); at 2M triangles / up to 6M keys it can transiently cost a
 * few hundred MB, which is the acceptable worst case for one background job.
 * Past the cap we still produce metadata + thumbnail and just skip the GLB.
 */
const GLB_MAX_TRIANGLES = 2_000_000;

/**
 * Raster cap for the thumbnail: above this we uniformly sample every k-th
 * triangle. A preview does not need every facet, and ~1.2M edge-function
 * fills keep worst-case CPU time in the low seconds instead of minutes.
 */
const THUMB_MAX_RENDER_TRIANGLES = 1_200_000;

/**
 * Render supersampled at 640², then let sharp downscale to the ~300px thumb
 * the variant map expects — the 2x+ downscale is our (cheap) antialiasing,
 * since the rasterizer itself has no MSAA.
 */
const RENDER_SIZE = 640;
const THUMB_SIZE = 300;

/** The model fills ~88% of the frame; the rest is breathing room. */
const FRAME_FIT = 0.88;

/** Neutral dental-model gray-blue (slate-400) — reads on light and dark UI. */
const BASE_R = 148;
const BASE_G = 163;
const BASE_B = 184;

/** Turntable camera: 35° yaw then 25° pitch — a readable 3/4 view of an arch. */
const VIEW_YAW_RAD = (35 * Math.PI) / 180;
const VIEW_PITCH_RAD = (25 * Math.PI) / 180;

/** Dedup grid: 2^20 steps per bbox axis (≈0.1µm resolution on a 10cm scan). */
const QUANT_STEPS = 1_048_575; // 2^20 - 1

export interface StlProcessArgs {
  /** Absolute path of the original .stl file (never modified). */
  absPath: string;
  /** Absolute directory to write derived files into (same dir as original). */
  absDir: string;
  /** Uploads-root-relative POSIX dir used for MediaVariantInfo.path values. */
  relDir: string;
  /** Filename stem for derived files (no extension). */
  baseName: string;
}

export async function processStl(args: StlProcessArgs): Promise<StlProcessResult> {
  const { absPath, absDir, relDir, baseName } = args;
  const { size: fileSize } = await fsp.stat(absPath);
  const head = await readHead(absPath, fileSize);
  const format = detectFormat(head, fileSize);

  // Oversized files: stream for metadata only (see FULL_PARSE_MAX_BYTES).
  // No variants in this path — both GLB and the render need the full vertex
  // soup in memory, which is exactly what the cap exists to avoid.
  if (fileSize > FULL_PARSE_MAX_BYTES) {
    const metadata =
      format === 'binary'
        ? await streamBinaryMetadata(absPath)
        : await streamAsciiMetadata(absPath);
    return { metadata, variants: {} };
  }

  const whole = await fsp.readFile(absPath);
  const { triangleCount, positions } =
    format === 'binary' ? parseBinary(whole) : parseAscii(whole);
  const { bbox, hasFiniteVertex } = computeBbox(positions, triangleCount);

  const variants: MediaVariants = {};
  // Reported as triangleCount*3 unless the GLB dedup ran to completion below.
  let vertexCount = triangleCount * 3;

  // ---- GLB conversion (best-effort) --------------------------------------
  if (triangleCount > 0 && triangleCount <= GLB_MAX_TRIANGLES && hasFiniteVertex) {
    try {
      const built = buildGlb(positions, triangleCount, bbox);
      if (built !== null) {
        // The dedup completed, so the unique count is the truthful vertex
        // count even if the size comparison below skips the file write.
        vertexCount = built.uniqueVertexCount;
        // Tiny models lose the trade: ~600 B of JSON scaffolding plus
        // 12 B/triangle of indices can exceed STL's flat 50 B/triangle. A GLB
        // that is not strictly smaller than the original buys the viewer
        // nothing (it can parse neither faster nor cheaper), so skip silently.
        if (built.glb.byteLength < fileSize) {
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
      // the original STL stays downloadable and metadata is already computed.
    }
  }

  // ---- Thumbnail (best-effort, isolated for the same reason) -------------
  if (triangleCount > 0 && hasFiniteVertex) {
    try {
      const rgba = renderPreview(positions, triangleCount, bbox);
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

  const metadata: StlMetadata = { kind: 'stl', format, triangleCount, vertexCount, bbox };
  return { metadata, variants };
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

/** First 4 KB (or the whole file when smaller) — enough for both checks. */
async function readHead(absPath: string, fileSize: number): Promise<Buffer> {
  const fh = await fsp.open(absPath, 'r');
  try {
    const want = Math.min(4096, fileSize);
    const buf = Buffer.alloc(want);
    const { bytesRead } = await fh.read(buf, 0, want, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/**
 * Binary detection runs FIRST and is authoritative because it is structural:
 * plenty of real-world binary exports begin with the bytes "solid", so the
 * textual heuristic alone would misclassify them and then "parse" garbage.
 */
function detectFormat(head: Buffer, fileSize: number): 'binary' | 'ascii' {
  if (head.length >= 84) {
    const declared = head.readUInt32LE(80);
    const expected = 84 + 50 * declared;
    // Up to 4 trailing pad bytes tolerated — some exporters round the file up.
    if (fileSize >= expected && fileSize - expected <= 4) return 'binary';
  }
  // ASCII: "solid" must be the first non-whitespace token AND a "facet" must
  // appear within the first 4 KB. A real header line is never that long, so
  // files whose first facet sits beyond 4 KB are rejected on purpose rather
  // than scanned without bound.
  const text = head.toString('latin1').toLowerCase();
  if (text.trimStart().startsWith('solid') && text.includes('facet')) return 'ascii';
  throw new Error('Unrecognized STL format');
}

// ---------------------------------------------------------------------------
// Full in-memory parsers (files ≤ FULL_PARSE_MAX_BYTES)
// ---------------------------------------------------------------------------

interface ParsedStl {
  triangleCount: number;
  /** Flat vertex stream: 9 floats per triangle (3 vertices × xyz). */
  positions: Float32Array;
}

function parseBinary(buf: Buffer): ParsedStl {
  // detectFormat already validated byteLength === 84 + 50·count (± pad),
  // so the declared count is safe to trust as the loop bound.
  const triangleCount = buf.readUInt32LE(80);
  const positions = new Float32Array(triangleCount * 9);
  for (let t = 0; t < triangleCount; t++) {
    // Record: 12 B normal (ignored — the viewer recomputes normals anyway),
    // 36 B of vertex floats (contiguous), 2 B attribute byte count.
    const rec = 84 + t * 50 + 12;
    for (let f = 0; f < 9; f++) {
      // readFloatLE is endian-explicit, so parsing is correct on any host.
      positions[t * 9 + f] = buf.readFloatLE(rec + f * 4);
    }
  }
  return { triangleCount, positions };
}

/** Lenient keyword matching: case-insensitive, leading whitespace allowed. */
const ASCII_VERTEX_RE = /^\s*vertex\s+(\S+)\s+(\S+)\s+(\S+)/i;
/** Matches "facet ..." but not "endfacet" (\b after the keyword). */
const ASCII_FACET_RE = /^\s*facet\b/i;

function parseAscii(buf: Buffer): ParsedStl {
  const lines = buf.toString('utf8').split(/\r?\n/);
  // Pass 1: count vertex lines so the typed array is allocated exactly once
  // (pushing millions of JS numbers into a plain array costs ~10x the RAM).
  let vertexLines = 0;
  for (const line of lines) {
    if (ASCII_VERTEX_RE.test(line)) vertexLines++;
  }
  const floats = new Float32Array(vertexLines * 3);
  let w = 0;
  for (const line of lines) {
    const m = ASCII_VERTEX_RE.exec(line);
    if (m === null) continue;
    // Unparseable numbers become NaN ON PURPOSE: dropping the line instead
    // would shift every later vertex into the wrong triangle. NaN vertices
    // are excluded from the bbox, dropped from the GLB and never rasterize.
    floats[w++] = parseFloat(m[1]);
    floats[w++] = parseFloat(m[2]);
    floats[w++] = parseFloat(m[3]);
  }
  // Vertices group 3-per-facet in file order; a malformed trailing facet with
  // fewer than 3 vertices is ignored by the floor().
  const triangleCount = Math.floor(w / 9);
  return { triangleCount, positions: floats.subarray(0, triangleCount * 9) };
}

// ---------------------------------------------------------------------------
// Bounding box
// ---------------------------------------------------------------------------

/** Mutable min/max accumulator shared by the buffered and streamed parsers. */
interface BboxAcc {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** True once at least one fully finite vertex has been seen. */
  found: boolean;
}

interface BboxResult {
  bbox: StlMetadata['bbox'];
  /** False when not a single finite vertex exists (bbox falls back to zeros). */
  hasFiniteVertex: boolean;
}

function newBboxAcc(): BboxAcc {
  return {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
    found: false,
  };
}

/**
 * NaN/Infinity coords (broken exporters do ship them) are skipped so a single
 * degenerate vertex cannot poison the bbox the viewer uses for camera framing.
 */
function bboxAdd(a: BboxAcc, x: number, y: number, z: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
  if (x < a.minX) a.minX = x;
  if (x > a.maxX) a.maxX = x;
  if (y < a.minY) a.minY = y;
  if (y > a.maxY) a.maxY = y;
  if (z < a.minZ) a.minZ = z;
  if (z > a.maxZ) a.maxZ = z;
  a.found = true;
}

function bboxFinish(a: BboxAcc): BboxResult {
  if (!a.found) {
    // Zero triangles or all-degenerate input: report a point at the origin
    // rather than ±Infinity, which would not survive the JSON column anyway.
    return { bbox: { min: [0, 0, 0], max: [0, 0, 0] }, hasFiniteVertex: false };
  }
  return {
    bbox: { min: [a.minX, a.minY, a.minZ], max: [a.maxX, a.maxY, a.maxZ] },
    hasFiniteVertex: true,
  };
}

function computeBbox(positions: Float32Array, triangleCount: number): BboxResult {
  const acc = newBboxAcc();
  for (let v = 0; v < triangleCount * 3; v++) {
    bboxAdd(acc, positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
  }
  return bboxFinish(acc);
}

// ---------------------------------------------------------------------------
// Streaming metadata (files > FULL_PARSE_MAX_BYTES)
// ---------------------------------------------------------------------------

/**
 * Constant-memory binary scan: one sub-50-byte carry plus the current chunk.
 * Only the record count and bbox are computed. The count necessarily matches
 * the header (detectFormat already validated size === 84 + 50·count ± pad);
 * we still count the records actually scanned and report that as the ground
 * truth rather than echoing the header.
 */
function streamBinaryMetadata(absPath: string): Promise<StlMetadata> {
  return new Promise<StlMetadata>((resolve, reject) => {
    const acc = newBboxAcc();
    let headerToSkip = 84;
    let carry: Buffer = Buffer.alloc(0);
    let triangleCount = 0;

    const stream = createReadStream(absPath);
    stream.on('data', (chunk: string | Buffer) => {
      let part = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      if (headerToSkip > 0) {
        const skip = Math.min(headerToSkip, part.length);
        headerToSkip -= skip;
        part = part.subarray(skip);
        if (part.length === 0) return;
      }
      // 50-byte records straddle chunk boundaries: prepend the carried tail.
      const buf = carry.length > 0 ? Buffer.concat([carry, part]) : part;
      const wholeRecords = Math.floor(buf.length / 50);
      for (let t = 0; t < wholeRecords; t++) {
        const rec = t * 50 + 12; // skip the 12-byte normal
        for (let v = 0; v < 3; v++) {
          const off = rec + v * 12;
          bboxAdd(acc, buf.readFloatLE(off), buf.readFloatLE(off + 4), buf.readFloatLE(off + 8));
        }
      }
      triangleCount += wholeRecords;
      carry = buf.subarray(wholeRecords * 50);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      resolve({
        kind: 'stl',
        format: 'binary',
        triangleCount,
        // No dedup in the streamed path (it would need exactly the memory we
        // are avoiding), so the raw 3-per-triangle figure is reported.
        vertexCount: triangleCount * 3,
        bbox: bboxFinish(acc).bbox,
      });
    });
  });
}

/**
 * Constant-memory ASCII scan: lines are processed as they stream in; only a
 * facet counter and the bbox are kept.
 */
function streamAsciiMetadata(absPath: string): Promise<StlMetadata> {
  return new Promise<StlMetadata>((resolve, reject) => {
    const acc = newBboxAcc();
    let facetCount = 0;
    let tail = '';

    const consume = (line: string): void => {
      if (ASCII_FACET_RE.test(line)) {
        facetCount++;
        return;
      }
      const m = ASCII_VERTEX_RE.exec(line);
      if (m !== null) bboxAdd(acc, parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
    };

    const stream = createReadStream(absPath, { encoding: 'utf8' });
    stream.on('data', (chunk: string | Buffer) => {
      tail += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      const lines = tail.split(/\r?\n/);
      tail = lines.pop() ?? ''; // the last element may be a partial line
      for (const line of lines) consume(line);
      // A "line" growing past 1 MB means the file has no newlines (garbage or
      // hostile) — drop the carry so it cannot defeat the streaming cap. Real
      // STL lines are well under 100 bytes.
      if (tail.length > 1024 * 1024) tail = '';
    });
    stream.on('error', reject);
    stream.on('end', () => {
      if (tail.length > 0) consume(tail);
      resolve({
        kind: 'stl',
        format: 'ascii',
        triangleCount: facetCount,
        vertexCount: facetCount * 3,
        bbox: bboxFinish(acc).bbox,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// GLB conversion
// ---------------------------------------------------------------------------

interface GlbBuild {
  glb: Buffer;
  uniqueVertexCount: number;
}

/**
 * Builds an indexed, POSITION-only glTF 2.0 binary.
 *
 * No normals on purpose: STL normals are unreliable (often zeroed) and
 * per-face normals would forbid index sharing entirely — the frontend viewer
 * calls computeVertexNormals() after load instead, so shipping them would be
 * pure dead weight.
 *
 * Vertex dedup quantizes each coordinate onto a 2^20 grid spanning its bbox
 * axis. The grid is ONLY the dedup key — emitted floats are the untouched
 * originals of the first occurrence, so output positions stay lossless.
 *
 * Returns null when no renderable (fully finite) triangle survives.
 */
function buildGlb(
  positions: Float32Array,
  triangleCount: number,
  bbox: StlMetadata['bbox'],
): GlbBuild | null {
  const [minX, minY, minZ] = bbox.min;
  const [maxX, maxY, maxZ] = bbox.max;
  // Zero extent (flat axis) ⇒ scale 0 ⇒ every coordinate lands in cell 0.
  const qsx = maxX - minX > 0 ? QUANT_STEPS / (maxX - minX) : 0;
  const qsy = maxY - minY > 0 ? QUANT_STEPS / (maxY - minY) : 0;
  const qsz = maxZ - minZ > 0 ? QUANT_STEPS / (maxZ - minZ) : 0;

  const cellToIndex = new Map<string, number>();
  // Worst case (zero sharing) is exactly the input size — allocated up front
  // so the hot loop never reallocates; trimmed via byte views when serialized.
  const outPos = new Float32Array(triangleCount * 9);
  const indices = new Uint32Array(triangleCount * 3);
  let unique = 0;
  let written = 0;

  for (let t = 0; t < triangleCount; t++) {
    const base = t * 9;
    // Drop triangles touching any non-finite coordinate: one NaN in a GPU
    // position buffer poisons three.js bounding-volume math on the client.
    let finite = true;
    for (let f = 0; f < 9 && finite; f++) finite = Number.isFinite(positions[base + f]);
    if (!finite) continue;

    for (let v = 0; v < 3; v++) {
      const x = positions[base + v * 3];
      const y = positions[base + v * 3 + 1];
      const z = positions[base + v * 3 + 2];
      const key =
        `${Math.round((x - minX) * qsx)},` +
        `${Math.round((y - minY) * qsy)},` +
        `${Math.round((z - minZ) * qsz)}`;
      let idx = cellToIndex.get(key);
      if (idx === undefined) {
        idx = unique;
        unique++;
        cellToIndex.set(key, idx);
        outPos[idx * 3] = x;
        outPos[idx * 3 + 1] = y;
        outPos[idx * 3 + 2] = z;
      }
      indices[written++] = idx;
    }
  }
  if (written === 0) return null;

  // BIN layout: [indices: Uint32][positions: Float32]. Index bytes come first
  // and are always a multiple of 4, so the position view starts 4-byte
  // aligned with no padding in between. Typed-array memory is serialized
  // as-is: glTF mandates little-endian, and every platform this app's Node
  // runs on (x64 / arm64) is little-endian — a per-element writeFloatLE loop
  // would only buy correctness on big-endian mainframes at real CPU cost.
  const idxBytes = Buffer.from(indices.buffer, 0, written * 4);
  const posBytes = Buffer.from(outPos.buffer, 0, unique * 12);
  const bin = Buffer.concat([idxBytes, posBytes]);

  const json = {
    asset: { version: '2.0', generator: 'oralign-media' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 1 }, indices: 0, mode: 4 }] }],
    accessors: [
      // 5125 = UNSIGNED_INT. Always 32-bit, never 16: constant-shape code
      // beats the tiny byte saving on small meshes, and GLBs small enough to
      // care are skipped by the size comparison anyway.
      { bufferView: 0, componentType: 5125, count: written, type: 'SCALAR' },
      // min/max = model bbox. Dedup keeps a subset of original coords, so the
      // true extrema can sit up to one quantization cell inside the bbox —
      // loaders only use these for framing, where that error is invisible.
      {
        bufferView: 1,
        componentType: 5126, // FLOAT
        count: unique,
        type: 'VEC3',
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: idxBytes.length, target: 34963 }, // ELEMENT_ARRAY_BUFFER
      { buffer: 0, byteOffset: idxBytes.length, byteLength: posBytes.length, target: 34962 }, // ARRAY_BUFFER
    ],
    buffers: [{ byteLength: bin.length }],
  };

  // GLB container: 12-byte header, then the JSON chunk (padded to 4 with
  // 0x20 spaces, per spec), then the BIN chunk (padded with zeros).
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4; // always 0 here; kept for safety
  const totalLength = 12 + 8 + jsonBuf.length + jsonPad + 8 + bin.length + binPad;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // magic "glTF"
  header.writeUInt32LE(2, 4); // container version
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuf.length + jsonPad, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // chunk type "JSON"

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(bin.length + binPad, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // chunk type "BIN\0"

  const glb = Buffer.concat([
    header,
    jsonChunkHeader,
    jsonBuf,
    Buffer.alloc(jsonPad, 0x20),
    binChunkHeader,
    bin,
    Buffer.alloc(binPad),
  ]);
  return { glb, uniqueVertexCount: unique };
}

// ---------------------------------------------------------------------------
// Thumbnail rendering
// ---------------------------------------------------------------------------

/**
 * Pure-software orthographic render — no GPU, no native canvas dependency:
 * the pipeline must run on a bare VPS, and a CPU edge-function rasterizer at
 * 640² is plenty fast for an async job (the triangle cap bounds the worst
 * case). Classic z-buffer fill; no top-left edge rule — double-shaded shared
 * edges are invisible at thumbnail size and not worth the branchier loop.
 */
function renderPreview(
  positions: Float32Array,
  triangleCount: number,
  bbox: StlMetadata['bbox'],
): Uint8ClampedArray {
  const W = RENDER_SIZE;
  const rgba = new Uint8ClampedArray(W * W * 4); // zero-filled ⇒ transparent bg
  const zbuf = new Float32Array(W * W).fill(-Infinity);

  const ctrX = (bbox.min[0] + bbox.max[0]) / 2;
  const ctrY = (bbox.min[1] + bbox.max[1]) / 2;
  const ctrZ = (bbox.min[2] + bbox.max[2]) / 2;
  const cosY = Math.cos(VIEW_YAW_RAD);
  const sinY = Math.sin(VIEW_YAW_RAD);
  const cosP = Math.cos(VIEW_PITCH_RAD);
  const sinP = Math.sin(VIEW_PITCH_RAD);

  // Frame fit from the 8 rotated bbox corners — they always enclose the
  // projected model, so this is slightly conservative (the model may land
  // just under the 88% target) but avoids buffering every rotated vertex
  // for an exact fit. Orthographic projection: rotated x/y, depth = rotated z.
  let pMinX = Infinity;
  let pMaxX = -Infinity;
  let pMinY = Infinity;
  let pMaxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    const x = (i & 1 ? bbox.max[0] : bbox.min[0]) - ctrX;
    const y = (i & 2 ? bbox.max[1] : bbox.min[1]) - ctrY;
    const z = (i & 4 ? bbox.max[2] : bbox.min[2]) - ctrZ;
    const rx = x * cosY + z * sinY;
    const zy = -x * sinY + z * cosY;
    const ry = y * cosP - zy * sinP;
    if (rx < pMinX) pMinX = rx;
    if (rx > pMaxX) pMaxX = rx;
    if (ry < pMinY) pMinY = ry;
    if (ry > pMaxY) pMaxY = ry;
  }
  // One uniform scale on both axes preserves aspect; the epsilon guards
  // degenerate (point/flat-on-view) models against a division by zero.
  const span = Math.max(pMaxX - pMinX, pMaxY - pMinY, 1e-9);
  const scale = (W * FRAME_FIT) / span;
  const offX = W / 2 - ((pMinX + pMaxX) / 2) * scale;
  const offY = W / 2 + ((pMinY + pMaxY) / 2) * scale; // screen Y grows downward

  // Decimation for huge meshes: keep every k-th triangle. Uniform sampling
  // keeps the silhouette intact, which is all a preview needs.
  const step =
    triangleCount > THUMB_MAX_RENDER_TRIANGLES
      ? Math.ceil(triangleCount / THUMB_MAX_RENDER_TRIANGLES)
      : 1;

  // Light in view space (up-right, toward the camera), normalized once.
  const lLen = Math.hypot(0.4, 0.6, 1);
  const lx = 0.4 / lLen;
  const ly = 0.6 / lLen;
  const lz = 1 / lLen;

  const rxA = new Float64Array(3);
  const ryA = new Float64Array(3);
  const rzA = new Float64Array(3);

  for (let t = 0; t < triangleCount; t += step) {
    const base = t * 9;
    for (let v = 0; v < 3; v++) {
      const x = positions[base + v * 3] - ctrX;
      const y = positions[base + v * 3 + 1] - ctrY;
      const z = positions[base + v * 3 + 2] - ctrZ;
      const rx = x * cosY + z * sinY;
      const zy = -x * sinY + z * cosY;
      rxA[v] = rx;
      ryA[v] = y * cosP - zy * sinP;
      rzA[v] = y * sinP + zy * cosP;
    }

    // Flat shading from the view-space face normal. The abs() below makes
    // STL winding irrelevant — real-world files mix orientations freely.
    const e1x = rxA[1] - rxA[0];
    const e1y = ryA[1] - ryA[0];
    const e1z = rzA[1] - rzA[0];
    const e2x = rxA[2] - rxA[0];
    const e2y = ryA[2] - ryA[0];
    const e2z = rzA[2] - rzA[0];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const nLen = Math.hypot(nx, ny, nz);
    if (!(nLen > 0)) continue; // degenerate (or NaN-poisoned) triangle
    const intensity = 0.25 + 0.75 * Math.abs((nx * lx + ny * ly + nz * lz) / nLen);
    const r = BASE_R * intensity;
    const g = BASE_G * intensity;
    const b = BASE_B * intensity;

    // To screen space (y flipped: view-space +Y is up, raster +Y is down).
    let x0 = offX + rxA[0] * scale;
    let y0 = offY - ryA[0] * scale;
    let z0 = rzA[0];
    let x1 = offX + rxA[1] * scale;
    let y1 = offY - ryA[1] * scale;
    let z1 = rzA[1];
    let x2 = offX + rxA[2] * scale;
    let y2 = offY - ryA[2] * scale;
    let z2 = rzA[2];

    let area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    if (!Number.isFinite(area) || area === 0) continue; // degenerate / NaN
    if (area < 0) {
      // Normalize winding so the inside test is a uniform `w >= 0`.
      let tmp = x1; x1 = x2; x2 = tmp;
      tmp = y1; y1 = y2; y2 = tmp;
      tmp = z1; z1 = z2; z2 = tmp;
      area = -area;
    }

    const minPx = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxPx = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minPy = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxPy = Math.min(W - 1, Math.ceil(Math.max(y0, y1, y2)));

    for (let py = minPy; py <= maxPy; py++) {
      const pyc = py + 0.5; // sample at pixel centers
      for (let px = minPx; px <= maxPx; px++) {
        const pxc = px + 0.5;
        // Edge functions: w0/w1/w2 are the (unnormalized) barycentric weights
        // of vertices 0/1/2 — each from the edge spanned by the other two.
        const w0 = (x2 - x1) * (pyc - y1) - (y2 - y1) * (pxc - x1);
        const w1 = (x0 - x2) * (pyc - y2) - (y0 - y2) * (pxc - x2);
        const w2 = (x1 - x0) * (pyc - y0) - (y1 - y0) * (pxc - x0);
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const depth = (w0 * z0 + w1 * z1 + w2 * z2) / area;
        const o = py * W + px;
        // Camera looks down -Z, so the nearest surface has the LARGEST depth.
        if (depth > zbuf[o]) {
          zbuf[o] = depth;
          const p4 = o * 4;
          rgba[p4] = r;
          rgba[p4 + 1] = g;
          rgba[p4 + 2] = b;
          rgba[p4 + 3] = 255;
        }
      }
    }
  }
  return rgba;
}
