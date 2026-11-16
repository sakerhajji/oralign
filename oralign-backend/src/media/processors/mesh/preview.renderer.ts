/**
 * Pure-software orthographic preview of a mesh or point cloud — no GPU, no
 * native canvas dependency: the pipeline must run on a bare VPS, and a CPU
 * rasterizer at 640² is plenty fast for an async job (the sampling cap
 * bounds the worst case).
 */
import {
  type Bbox,
  type MeshGeometry,
  NEUTRAL_RGB,
  type PointGeometry,
  type TriangleGeometry,
} from './mesh.types';

/**
 * Render supersampled at 640², then let sharp downscale to the ~300px thumb
 * the variant map expects — the 2x+ downscale is our (cheap) antialiasing,
 * since the rasterizer itself has no MSAA.
 */
export const RENDER_SIZE = 640;

/**
 * Raster cap: above this we uniformly sample every k-th triangle (or
 * point). A preview does not need every facet, and ~1.2M edge-function
 * fills keep worst-case CPU time in the low seconds instead of minutes.
 */
const MAX_RENDER_PRIMITIVES = 1_200_000;

/** The model fills ~88% of the frame; the rest is breathing room. */
const FRAME_FIT = 0.88;

/** Turntable camera: 35° yaw then 25° pitch — a readable 3/4 view of an arch. */
const VIEW_YAW_RAD = (35 * Math.PI) / 180;
const VIEW_PITCH_RAD = (25 * Math.PI) / 180;

/** Returns W×W RGBA pixels; the background stays transparent. */
export function renderPreview(
  geometry: MeshGeometry,
  bbox: Bbox,
): Uint8ClampedArray {
  const W = RENDER_SIZE;
  const target: Target = {
    rgba: new Uint8ClampedArray(W * W * 4), // zero-filled ⇒ transparent bg
    zbuf: new Float32Array(W * W).fill(-Infinity),
  };
  const camera = cameraFor(bbox);
  if (geometry.kind === 'triangles')
    rasterizeTriangles(geometry, camera, target);
  else splatPoints(geometry, camera, target);
  return target.rgba;
}

interface Target {
  rgba: Uint8ClampedArray;
  /** Camera looks down -Z, so the nearest surface has the LARGEST depth. */
  zbuf: Float32Array;
}

interface Camera {
  ctrX: number;
  ctrY: number;
  ctrZ: number;
  cosY: number;
  sinY: number;
  cosP: number;
  sinP: number;
  scale: number;
  offX: number;
  offY: number;
  /** View-space depth range of the bbox, for depth-cued point shading. */
  nearZ: number;
  farZ: number;
}

/**
 * Frame fit from the 8 rotated bbox corners — they always enclose the
 * projected model, so this is slightly conservative (the model may land
 * just under the 88% target) but avoids buffering every rotated vertex
 * for an exact fit. Orthographic projection: rotated x/y, depth = rotated z.
 */
function cameraFor(bbox: Bbox): Camera {
  const W = RENDER_SIZE;
  const ctrX = (bbox.min[0] + bbox.max[0]) / 2;
  const ctrY = (bbox.min[1] + bbox.max[1]) / 2;
  const ctrZ = (bbox.min[2] + bbox.max[2]) / 2;
  const cosY = Math.cos(VIEW_YAW_RAD);
  const sinY = Math.sin(VIEW_YAW_RAD);
  const cosP = Math.cos(VIEW_PITCH_RAD);
  const sinP = Math.sin(VIEW_PITCH_RAD);

  let pMinX = Infinity;
  let pMaxX = -Infinity;
  let pMinY = Infinity;
  let pMaxY = -Infinity;
  let farZ = Infinity;
  let nearZ = -Infinity;
  for (let i = 0; i < 8; i++) {
    const x = (i & 1 ? bbox.max[0] : bbox.min[0]) - ctrX;
    const y = (i & 2 ? bbox.max[1] : bbox.min[1]) - ctrY;
    const z = (i & 4 ? bbox.max[2] : bbox.min[2]) - ctrZ;
    const rx = x * cosY + z * sinY;
    const zy = -x * sinY + z * cosY;
    const ry = y * cosP - zy * sinP;
    const rz = y * sinP + zy * cosP;
    if (rx < pMinX) pMinX = rx;
    if (rx > pMaxX) pMaxX = rx;
    if (ry < pMinY) pMinY = ry;
    if (ry > pMaxY) pMaxY = ry;
    if (rz < farZ) farZ = rz;
    if (rz > nearZ) nearZ = rz;
  }
  // One uniform scale on both axes preserves aspect; the epsilon guards
  // degenerate (point/flat-on-view) models against a division by zero.
  const span = Math.max(pMaxX - pMinX, pMaxY - pMinY, 1e-9);
  const scale = (W * FRAME_FIT) / span;
  return {
    ctrX,
    ctrY,
    ctrZ,
    cosY,
    sinY,
    cosP,
    sinP,
    scale,
    offX: W / 2 - ((pMinX + pMaxX) / 2) * scale,
    offY: W / 2 + ((pMinY + pMaxY) / 2) * scale, // screen Y grows downward
    nearZ,
    farZ,
  };
}

/** Uniform sampling keeps the silhouette intact, which is all a preview needs. */
const samplingStep = (count: number) =>
  count > MAX_RENDER_PRIMITIVES ? Math.ceil(count / MAX_RENDER_PRIMITIVES) : 1;

/**
 * Classic z-buffer fill with flat Lambert shading; no top-left edge rule —
 * double-shaded shared edges are invisible at thumbnail size and not worth
 * the branchier loop. A coloured mesh shades each face with the mean of its
 * corner colours: faces are sub-pixel at thumbnail scale, so per-pixel
 * interpolation would buy nothing visible.
 */
function rasterizeTriangles(
  mesh: TriangleGeometry,
  cam: Camera,
  target: Target,
): void {
  const W = RENDER_SIZE;
  const { positions, colors, indices, triangleCount } = mesh;
  const { rgba, zbuf } = target;
  const { ctrX, ctrY, ctrZ, cosY, sinY, cosP, sinP, scale, offX, offY } = cam;
  const step = samplingStep(triangleCount);

  // Light in view space (up-right, toward the camera), normalized once.
  const lLen = Math.hypot(0.4, 0.6, 1);
  const lx = 0.4 / lLen;
  const ly = 0.6 / lLen;
  const lz = 1 / lLen;

  const rxA = new Float64Array(3);
  const ryA = new Float64Array(3);
  const rzA = new Float64Array(3);
  const corner = new Uint32Array(3);

  for (let t = 0; t < triangleCount; t += step) {
    for (let v = 0; v < 3; v++) {
      const src = indices ? indices[t * 3 + v] : t * 3 + v;
      corner[v] = src;
      const x = positions[src * 3] - ctrX;
      const y = positions[src * 3 + 1] - ctrY;
      const z = positions[src * 3 + 2] - ctrZ;
      const rx = x * cosY + z * sinY;
      const zy = -x * sinY + z * cosY;
      rxA[v] = rx;
      ryA[v] = y * cosP - zy * sinP;
      rzA[v] = y * sinP + zy * cosP;
    }

    // Flat shading from the view-space face normal. The abs() below makes
    // winding irrelevant — real-world files mix orientations freely.
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
    const intensity =
      0.25 + 0.75 * Math.abs((nx * lx + ny * ly + nz * lz) / nLen);
    let baseR = NEUTRAL_RGB[0];
    let baseG = NEUTRAL_RGB[1];
    let baseB = NEUTRAL_RGB[2];
    if (colors) {
      const a = corner[0] * 3;
      const b = corner[1] * 3;
      const c = corner[2] * 3;
      baseR = (colors[a] + colors[b] + colors[c]) / 3;
      baseG = (colors[a + 1] + colors[b + 1] + colors[c + 1]) / 3;
      baseB = (colors[a + 2] + colors[b + 2] + colors[c + 2]) / 3;
    }
    const r = baseR * intensity;
    const g = baseG * intensity;
    const b = baseB * intensity;

    // To screen space (y flipped: view-space +Y is up, raster +Y is down).
    const x0 = offX + rxA[0] * scale;
    const y0 = offY - ryA[0] * scale;
    const z0 = rzA[0];
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
      let tmp = x1;
      x1 = x2;
      x2 = tmp;
      tmp = y1;
      y1 = y2;
      y2 = tmp;
      tmp = z1;
      z1 = z2;
      z2 = tmp;
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
}

/**
 * Square z-buffered splats. Points carry no normals to light, so shading is
 * depth-cued instead (nearer = brighter), which is what makes the arch read
 * as a 3D shape rather than a flat stain.
 */
function splatPoints(cloud: PointGeometry, cam: Camera, target: Target): void {
  const W = RENDER_SIZE;
  const { positions, colors, pointCount } = cloud;
  const { rgba, zbuf } = target;
  const { ctrX, ctrY, ctrZ, cosY, sinY, cosP, sinP, scale, offX, offY } = cam;
  const step = samplingStep(pointCount);
  // Side ≈ the spacing of the drawn points over the framed area, so a dense
  // scan closes into a surface and a sparse one stays legible.
  const drawn = Math.ceil(pointCount / step);
  const size = Math.min(
    8,
    Math.max(2, Math.round(((W * FRAME_FIT) / Math.sqrt(drawn)) * 1.5)),
  );
  const depthSpan = cam.nearZ - cam.farZ || 1;

  for (let i = 0; i < pointCount; i += step) {
    const x = positions[i * 3] - ctrX;
    const y = positions[i * 3 + 1] - ctrY;
    const z = positions[i * 3 + 2] - ctrZ;
    const rx = x * cosY + z * sinY;
    const zy = -x * sinY + z * cosY;
    const ry = y * cosP - zy * sinP;
    const rz = y * sinP + zy * cosP;
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(rz))
      continue;

    const shade = 0.55 + 0.45 * ((rz - cam.farZ) / depthSpan);
    const r = (colors ? colors[i * 3] : NEUTRAL_RGB[0]) * shade;
    const g = (colors ? colors[i * 3 + 1] : NEUTRAL_RGB[1]) * shade;
    const b = (colors ? colors[i * 3 + 2] : NEUTRAL_RGB[2]) * shade;

    const left = Math.round(offX + rx * scale - size / 2);
    const top = Math.round(offY - ry * scale - size / 2);
    const right = Math.min(W, left + size);
    const bottom = Math.min(W, top + size);
    for (let py = Math.max(0, top); py < bottom; py++) {
      for (let px = Math.max(0, left); px < right; px++) {
        const o = py * W + px;
        if (rz > zbuf[o]) {
          zbuf[o] = rz;
          const p4 = o * 4;
          rgba[p4] = r;
          rgba[p4 + 1] = g;
          rgba[p4 + 2] = b;
          rgba[p4 + 3] = 255;
        }
      }
    }
  }
}
