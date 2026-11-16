import type { BboxResult } from './mesh.types';

/** Mutable min/max accumulator shared by the buffered and streamed parsers. */
export interface BboxAcc {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** True once at least one fully finite vertex has been seen. */
  found: boolean;
}

export function newBboxAcc(): BboxAcc {
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
export function bboxAdd(a: BboxAcc, x: number, y: number, z: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
  if (x < a.minX) a.minX = x;
  if (x > a.maxX) a.maxX = x;
  if (y < a.minY) a.minY = y;
  if (y > a.maxY) a.maxY = y;
  if (z < a.minZ) a.minZ = z;
  if (z > a.maxZ) a.maxZ = z;
  a.found = true;
}

export function bboxFinish(a: BboxAcc): BboxResult {
  if (!a.found) {
    // No vertex or all-degenerate input: report a point at the origin
    // rather than ±Infinity, which would not survive the JSON column anyway.
    return { bbox: { min: [0, 0, 0], max: [0, 0, 0] }, hasFiniteVertex: false };
  }
  return {
    bbox: { min: [a.minX, a.minY, a.minZ], max: [a.maxX, a.maxY, a.maxZ] },
    hasFiniteVertex: true,
  };
}

/** Bbox of a flat xyz vertex stream. */
export function computeBbox(positions: Float32Array): BboxResult {
  const acc = newBboxAcc();
  for (let o = 0; o + 2 < positions.length; o += 3) {
    bboxAdd(acc, positions[o], positions[o + 1], positions[o + 2]);
  }
  return bboxFinish(acc);
}
