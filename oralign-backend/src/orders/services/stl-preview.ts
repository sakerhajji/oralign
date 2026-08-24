import * as fs from 'fs';
import sharp from 'sharp';

/**
 * Server-side STL → PNG preview for the order sheet.
 *
 * The media pipeline's `model` variant is a GLB — a 3D asset the PDF
 * cannot show. The sheet needs a flat picture, so this module renders one
 * itself: parse the mesh, orthographic front projection, per-pixel
 * z-buffer with Lambertian shading, encode via sharp (already a backend
 * dependency — no new package).
 *
 * Deliberately bounded: files over MAX_FILE_BYTES or MAX_TRIANGLES are
 * refused with `null` rather than rendered slowly — the sheet then simply
 * lists the scan by name, exactly as before this module existed.
 */

const MAX_FILE_BYTES = 80 * 1024 * 1024;
const MAX_TRIANGLES = 400_000;
const WIDTH = 640;
const HEIGHT = 440;

/** Background: transparent; the sheet's CSS provides the card behind it. */
const LIGHT_DIR = normalize([0.35, 0.45, 1]);
/** Ivory base tint, matching the sheet's tooth glyphs. */
const BASE_RGB: readonly [number, number, number] = [232, 226, 210];

interface Mesh {
  /** Flat xyz triplets, 9 floats per triangle. */
  positions: Float32Array;
  triangleCount: number;
}

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** Binary STL: 80-byte header, uint32 count, 50 bytes per triangle. */
function parseBinaryStl(buf: Buffer): Mesh | null {
  if (buf.length < 84) return null;
  const count = buf.readUInt32LE(80);
  if (count === 0 || count > MAX_TRIANGLES) return null;
  if (buf.length < 84 + count * 50) return null;

  const positions = new Float32Array(count * 9);
  for (let t = 0; t < count; t += 1) {
    // Skip the 12-byte facet normal — recomputed from the vertices so
    // exporters with garbage normals still shade correctly.
    const base = 84 + t * 50 + 12;
    for (let f = 0; f < 9; f += 1) {
      positions[t * 9 + f] = buf.readFloatLE(base + f * 4);
    }
  }
  return { positions, triangleCount: count };
}

/** ASCII STL: `vertex x y z` lines, three per facet. */
function parseAsciiStl(text: string): Mesh | null {
  const coords: number[] = [];
  const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    coords.push(Number(m[1]), Number(m[2]), Number(m[3]));
    if (coords.length > MAX_TRIANGLES * 9) return null;
  }
  const triangleCount = Math.floor(coords.length / 9);
  if (triangleCount === 0) return null;
  return {
    positions: Float32Array.from(coords.slice(0, triangleCount * 9)),
    triangleCount,
  };
}

function parseStl(buf: Buffer): Mesh | null {
  // "solid" prefix is not decisive (many binary exporters write it), so
  // check whether the binary size equation actually holds.
  if (buf.length >= 84) {
    const count = buf.readUInt32LE(80);
    if (84 + count * 50 === buf.length) return parseBinaryStl(buf);
  }
  const head = buf.subarray(0, 512).toString('latin1').toLowerCase();
  if (head.includes('solid') && head.includes('facet')) {
    return parseAsciiStl(buf.toString('latin1'));
  }
  return parseBinaryStl(buf);
}

/**
 * Render the mesh to a PNG buffer, or null when the file is missing,
 * oversized, or not a parseable STL. Never throws: a preview is garnish,
 * not a dependency of the sheet.
 */
export async function renderStlPreviewPng(
  absolutePath: string,
): Promise<Buffer | null> {
  try {
    const stat = fs.statSync(absolutePath);
    if (stat.size > MAX_FILE_BYTES) return null;
    const mesh = parseStl(fs.readFileSync(absolutePath));
    if (!mesh) return null;

    const { positions, triangleCount } = mesh;

    // Fit the model into the viewport: bbox → center + uniform scale.
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < triangleCount * 9; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (!Number.isFinite(minX) || maxX <= minX) return null;

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const margin = 0.88;
    const scale = Math.min((WIDTH * margin) / spanX, (HEIGHT * margin) / spanY);

    // Dental scans are exported Z-up as often as Y-up; pick the axis pair
    // that fills the frame better so an arch never renders edge-on.
    const spanZ = maxZ - minZ;
    const useZAsVertical = spanZ > spanY * 1.4;

    const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
    const zbuf = new Float32Array(WIDTH * HEIGHT).fill(-Infinity);

    const px = (x: number) => (x - cx) * scale + WIDTH / 2;
    const py = (v: number, center: number) => HEIGHT / 2 - (v - center) * scale;
    const vCenter = useZAsVertical ? (minZ + maxZ) / 2 : cy;

    for (let t = 0; t < triangleCount; t += 1) {
      const o = t * 9;
      const ax = positions[o], ay = positions[o + 1], az = positions[o + 2];
      const bx = positions[o + 3], by = positions[o + 4], bz = positions[o + 5];
      const cx3 = positions[o + 6], cy3 = positions[o + 7], cz3 = positions[o + 8];

      // Face normal for shading + a depth value per vertex.
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx3 - ax, vy = cy3 - ay, vz = cz3 - az;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const nlen = Math.hypot(nx, ny, nz) || 1;
      nx /= nlen; ny /= nlen; nz /= nlen;
      // Double-sided: viewer-facing shade regardless of winding.
      const facing = useZAsVertical ? ny : nz;
      const flip = facing < 0 ? -1 : 1;
      const lambert = Math.max(
        0.18,
        (nx * flip) * LIGHT_DIR[0] + (ny * flip) * LIGHT_DIR[1] + (nz * flip) * LIGHT_DIR[2],
      );

      const x0 = px(ax), x1 = px(bx), x2 = px(cx3);
      const v0 = useZAsVertical ? az : ay;
      const v1 = useZAsVertical ? bz : by;
      const v2 = useZAsVertical ? cz3 : cy3;
      const y0 = py(v0, vCenter), y1 = py(v1, vCenter), y2 = py(v2, vCenter);
      const d0 = useZAsVertical ? ay : az;
      const d1 = useZAsVertical ? by : bz;
      const d2 = useZAsVertical ? cy3 : cz3;

      const minPx = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxPx = Math.min(WIDTH - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minPy = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxPy = Math.min(HEIGHT - 1, Math.ceil(Math.max(y0, y1, y2)));
      if (minPx > maxPx || minPy > maxPy) continue;

      const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      if (Math.abs(denom) < 1e-9) continue;

      const shade = Math.min(1, lambert);
      const r = Math.round(BASE_RGB[0] * shade);
      const g = Math.round(BASE_RGB[1] * shade);
      const b = Math.round(BASE_RGB[2] * shade);

      for (let yPix = minPy; yPix <= maxPy; yPix += 1) {
        for (let xPix = minPx; xPix <= maxPx; xPix += 1) {
          const w0 = ((y1 - y2) * (xPix - x2) + (x2 - x1) * (yPix - y2)) / denom;
          const w1 = ((y2 - y0) * (xPix - x2) + (x0 - x2) * (yPix - y2)) / denom;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const depth = w0 * d0 + w1 * d1 + w2 * d2;
          const idx = yPix * WIDTH + xPix;
          if (depth <= zbuf[idx]) continue;
          zbuf[idx] = depth;
          const o4 = idx * 4;
          rgba[o4] = r;
          rgba[o4 + 1] = g;
          rgba[o4 + 2] = b;
          rgba[o4 + 3] = 255;
        }
      }
    }

    return await sharp(rgba, {
      raw: { width: WIDTH, height: HEIGHT, channels: 4 },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    return null;
  }
}
