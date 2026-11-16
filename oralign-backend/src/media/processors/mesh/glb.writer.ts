/**
 * Triangle geometry → indexed glTF 2.0 binary for the in-browser viewer
 * (three.js GLTFLoader).
 */
import type { Bbox, TriangleGeometry } from './mesh.types';

export interface GlbBuild {
  glb: Buffer;
  uniqueVertexCount: number;
}

/** Dedup grid: 2^20 steps per bbox axis (≈0.1µm resolution on a 10cm scan). */
const QUANT_STEPS = 1_048_575; // 2^20 - 1

/**
 * glTF COLOR_0 is linear, scanners write sRGB: converting here keeps the
 * viewer's GLB path and its raw-file path (PLYLoader/OBJLoader linearize
 * too) showing the same colours.
 */
const SRGB_TO_LINEAR = Uint8Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  const linear = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return Math.round(linear * 255);
});

/**
 * Builds an indexed glTF binary: POSITION, plus COLOR_0 when the source is
 * coloured.
 *
 * No normals on purpose: STL normals are unreliable (often zeroed) and
 * per-face normals would forbid index sharing entirely — the frontend viewer
 * calls computeVertexNormals() after load instead, so shipping them would be
 * pure dead weight.
 *
 * Vertex dedup quantizes each coordinate onto a 2^20 grid spanning its bbox
 * axis (plus the colour, when there is one). The grid is ONLY the dedup key —
 * emitted floats are the untouched originals of the first occurrence, so
 * output positions stay lossless. An indexed source is keyed once per
 * vertex, not once per corner.
 *
 * Returns null when no renderable (fully finite) triangle survives.
 */
export function buildGlb(mesh: TriangleGeometry, bbox: Bbox): GlbBuild | null {
  const { positions, colors, indices, triangleCount } = mesh;
  const [minX, minY, minZ] = bbox.min;
  const [maxX, maxY, maxZ] = bbox.max;
  // Zero extent (flat axis) ⇒ scale 0 ⇒ every coordinate lands in cell 0.
  const qsx = maxX - minX > 0 ? QUANT_STEPS / (maxX - minX) : 0;
  const qsy = maxY - minY > 0 ? QUANT_STEPS / (maxY - minY) : 0;
  const qsz = maxZ - minZ > 0 ? QUANT_STEPS / (maxZ - minZ) : 0;

  const cellToIndex = new Map<string, number>();
  // Worst case (zero sharing) is every corner, or every source vertex when
  // indexed — allocated up front so the hot loop never reallocates; trimmed
  // via byte views when serialized.
  const capacity = indices
    ? Math.min(triangleCount * 3, positions.length / 3)
    : triangleCount * 3;
  const outPos = new Float32Array(capacity * 3);
  const outColor = colors ? new Uint8Array(capacity * 4) : null;
  const outIndices = new Uint32Array(triangleCount * 3);
  const slotOfSource = indices
    ? new Int32Array(positions.length / 3).fill(-1)
    : null;
  const corner = new Uint32Array(3);
  let unique = 0;
  let written = 0;

  for (let t = 0; t < triangleCount; t++) {
    // Drop triangles touching any non-finite coordinate: one NaN in a GPU
    // position buffer poisons three.js bounding-volume math on the client.
    let finite = true;
    for (let v = 0; v < 3 && finite; v++) {
      const src = indices ? indices[t * 3 + v] : t * 3 + v;
      corner[v] = src;
      for (let f = 0; f < 3 && finite; f++) {
        finite = Number.isFinite(positions[src * 3 + f]);
      }
    }
    if (!finite) continue;

    for (let v = 0; v < 3; v++) {
      const src = corner[v];
      let idx = slotOfSource ? slotOfSource[src] : -1;
      if (idx < 0) {
        const x = positions[src * 3];
        const y = positions[src * 3 + 1];
        const z = positions[src * 3 + 2];
        let key =
          `${Math.round((x - minX) * qsx)},` +
          `${Math.round((y - minY) * qsy)},` +
          `${Math.round((z - minZ) * qsz)}`;
        if (colors) {
          key += `,${colors[src * 3]},${colors[src * 3 + 1]},${colors[src * 3 + 2]}`;
        }
        const known = cellToIndex.get(key);
        if (known === undefined) {
          idx = unique;
          unique++;
          cellToIndex.set(key, idx);
          outPos[idx * 3] = x;
          outPos[idx * 3 + 1] = y;
          outPos[idx * 3 + 2] = z;
          if (outColor && colors) {
            outColor[idx * 4] = SRGB_TO_LINEAR[colors[src * 3]];
            outColor[idx * 4 + 1] = SRGB_TO_LINEAR[colors[src * 3 + 1]];
            outColor[idx * 4 + 2] = SRGB_TO_LINEAR[colors[src * 3 + 2]];
            outColor[idx * 4 + 3] = 255;
          }
        } else {
          idx = known;
        }
        if (slotOfSource) slotOfSource[src] = idx;
      }
      outIndices[written++] = idx;
    }
  }
  if (written === 0) return null;

  // BIN layout: [indices: Uint32][positions: Float32][colours: Uint8×4].
  // Each section is a multiple of 4 bytes, so every view starts 4-byte
  // aligned with no padding in between. Typed-array memory is serialized
  // as-is: glTF mandates little-endian, and every platform this app's Node
  // runs on (x64 / arm64) is little-endian — a per-element writeFloatLE loop
  // would only buy correctness on big-endian mainframes at real CPU cost.
  const idxBytes = Buffer.from(outIndices.buffer, 0, written * 4);
  const posBytes = Buffer.from(outPos.buffer, 0, unique * 12);
  const colorBytes = outColor
    ? Buffer.from(outColor.buffer, 0, unique * 4)
    : null;
  const bin = Buffer.concat(
    colorBytes ? [idxBytes, posBytes, colorBytes] : [idxBytes, posBytes],
  );

  const accessors: object[] = [
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
  ];
  const bufferViews: object[] = [
    { buffer: 0, byteOffset: 0, byteLength: idxBytes.length, target: 34963 }, // ELEMENT_ARRAY_BUFFER
    {
      buffer: 0,
      byteOffset: idxBytes.length,
      byteLength: posBytes.length,
      target: 34962,
    }, // ARRAY_BUFFER
  ];
  const attributes: Record<string, number> = { POSITION: 1 };
  if (colorBytes) {
    // VEC4, not VEC3: vertex attribute elements must start 4-byte aligned,
    // which tightly packed 3-byte colours would not. Alpha is always opaque —
    // scanner alpha channels are unreliable and a scan is never see-through.
    accessors.push({
      bufferView: 2,
      componentType: 5121, // UNSIGNED_BYTE
      normalized: true,
      count: unique,
      type: 'VEC4',
    });
    bufferViews.push({
      buffer: 0,
      byteOffset: idxBytes.length + posBytes.length,
      byteLength: colorBytes.length,
      target: 34962,
    });
    attributes.COLOR_0 = 2;
  }

  const json = {
    asset: { version: '2.0', generator: 'oralign-media' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes, indices: 0, mode: 4 }] }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };
  return { glb: packGlb(json, bin), uniqueVertexCount: unique };
}

/**
 * GLB container: 12-byte header, then the JSON chunk (padded to 4 with
 * 0x20 spaces, per spec), then the BIN chunk (padded with zeros).
 */
function packGlb(json: object, bin: Buffer): Buffer {
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4; // always 0 here; kept for safety
  const totalLength =
    12 + 8 + jsonBuf.length + jsonPad + 8 + bin.length + binPad;

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

  return Buffer.concat([
    header,
    jsonChunkHeader,
    jsonBuf,
    Buffer.alloc(jsonPad, 0x20),
    binChunkHeader,
    bin,
    Buffer.alloc(binPad),
  ]);
}
