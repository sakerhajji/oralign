/**
 * STL (binary and ASCII) → triangle soup, or metadata only for files past
 * the full-parse cap (streamed in constant memory).
 */
import { createReadStream, promises as fsp } from 'node:fs';
import {
  type BboxAcc,
  bboxAdd,
  bboxFinish,
  computeBbox,
  newBboxAcc,
} from './bbox';
import type { BboxResult, ParsedMesh } from './mesh.types';

type StlEncoding = 'binary' | 'ascii';

/** Whole-file parse of an in-memory STL. Throws on an unrecognized format. */
export function parseStl(buf: Buffer): ParsedMesh {
  const format = detectFormat(buf.subarray(0, HEAD_BYTES), buf.length);
  const { triangleCount, positions } =
    format === 'binary' ? parseBinary(buf) : parseAscii(buf);
  return {
    format,
    geometry: {
      kind: 'triangles',
      positions,
      colors: null,
      indices: null,
      triangleCount,
    },
    triangleCount,
    vertexCount: triangleCount * 3,
    hasColors: false,
    pointCloud: false,
    bbox: computeBbox(positions),
  };
}

/**
 * `collect: false` streams the file for counts + bbox only: no geometry,
 * since that is exactly the memory the full-parse cap exists to avoid.
 */
export async function readStl(
  absPath: string,
  fileSize: number,
  collect: boolean,
): Promise<ParsedMesh> {
  if (collect) return parseStl(await fsp.readFile(absPath));

  const format = detectFormat(await readHead(absPath, fileSize), fileSize);
  const { triangleCount, bbox } =
    format === 'binary'
      ? await streamBinaryMetadata(absPath)
      : await streamAsciiMetadata(absPath);
  return {
    format,
    geometry: null,
    triangleCount,
    // No dedup in the streamed path (it would need exactly the memory we
    // are avoiding), so the raw 3-per-triangle figure is reported.
    vertexCount: triangleCount * 3,
    hasColors: false,
    pointCloud: false,
    bbox,
  };
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

/** First 4 KB (or the whole file when smaller) — enough for both checks. */
const HEAD_BYTES = 4096;

async function readHead(absPath: string, fileSize: number): Promise<Buffer> {
  const fh = await fsp.open(absPath, 'r');
  try {
    const want = Math.min(HEAD_BYTES, fileSize);
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
function detectFormat(head: Buffer, fileSize: number): StlEncoding {
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
  if (text.trimStart().startsWith('solid') && text.includes('facet')) {
    return 'ascii';
  }
  throw new Error('Unrecognized STL format');
}

// ---------------------------------------------------------------------------
// Full in-memory parsers
// ---------------------------------------------------------------------------

interface StlSoup {
  triangleCount: number;
  /** Flat vertex stream: 9 floats per triangle (3 vertices × xyz). */
  positions: Float32Array;
}

function parseBinary(buf: Buffer): StlSoup {
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

function parseAscii(buf: Buffer): StlSoup {
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
// Streaming metadata (files past the full-parse cap)
// ---------------------------------------------------------------------------

interface StlStreamStats {
  triangleCount: number;
  bbox: BboxResult;
}

/**
 * Constant-memory binary scan: one sub-50-byte carry plus the current chunk.
 * Only the record count and bbox are computed. The count necessarily matches
 * the header (detectFormat already validated size === 84 + 50·count ± pad);
 * we still count the records actually scanned and report that as the ground
 * truth rather than echoing the header.
 */
function streamBinaryMetadata(absPath: string): Promise<StlStreamStats> {
  return new Promise<StlStreamStats>((resolve, reject) => {
    const acc: BboxAcc = newBboxAcc();
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
          bboxAdd(
            acc,
            buf.readFloatLE(off),
            buf.readFloatLE(off + 4),
            buf.readFloatLE(off + 8),
          );
        }
      }
      triangleCount += wholeRecords;
      carry = buf.subarray(wholeRecords * 50);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      resolve({ triangleCount, bbox: bboxFinish(acc) });
    });
  });
}

/**
 * Constant-memory ASCII scan: lines are processed as they stream in; only a
 * facet counter and the bbox are kept.
 */
function streamAsciiMetadata(absPath: string): Promise<StlStreamStats> {
  return new Promise<StlStreamStats>((resolve, reject) => {
    const acc = newBboxAcc();
    let facetCount = 0;
    let tail = '';

    const consume = (line: string): void => {
      if (ASCII_FACET_RE.test(line)) {
        facetCount++;
        return;
      }
      const m = ASCII_VERTEX_RE.exec(line);
      if (m !== null) {
        bboxAdd(acc, parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
      }
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
      resolve({ triangleCount: facetCount, bbox: bboxFinish(acc) });
    });
  });
}
