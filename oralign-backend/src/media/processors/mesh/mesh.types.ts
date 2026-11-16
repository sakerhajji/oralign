/**
 * In-memory geometry shared by the mesh parsers (STL / PLY / OBJ), the GLB
 * writer and the preview renderer. Kept as flat typed arrays: millions of
 * vertices as JS objects would cost ~10x the RAM.
 */
import type { MeshMetadata } from '../../media.types';

export type Vec3 = [number, number, number];

export interface Bbox {
  min: Vec3;
  max: Vec3;
}

export interface BboxResult {
  bbox: Bbox;
  /** False when not a single finite vertex exists (bbox falls back to zeros). */
  hasFiniteVertex: boolean;
}

export interface TriangleGeometry {
  kind: 'triangles';
  /** xyz per vertex. */
  positions: Float32Array;
  /** sRGB rgb (0..255) per vertex, as the scanner wrote it; null = uncoloured. */
  colors: Uint8Array | null;
  /**
   * Three vertex indices per triangle, every one < vertex count. Null for a
   * triangle soup (STL's native layout): corner k of triangle t is vertex
   * 3t + k.
   */
  indices: Uint32Array | null;
  triangleCount: number;
}

/** A scan exported as bare vertices (no faces). */
export interface PointGeometry {
  kind: 'points';
  positions: Float32Array;
  colors: Uint8Array | null;
  pointCount: number;
}

export type MeshGeometry = TriangleGeometry | PointGeometry;

/** What a parser hands to the pipeline. */
export interface ParsedMesh {
  format: MeshMetadata['format'];
  /** Null when the file was only scanned for metadata (past the parse cap). */
  geometry: MeshGeometry | null;
  triangleCount: number;
  /** Source vertex count (an STL soup counts 3 per triangle). */
  vertexCount: number;
  hasColors: boolean;
  pointCloud: boolean;
  bbox: BboxResult;
}

/**
 * Neutral dental-model gray-blue (slate-400) — reads on light and dark UI.
 * Uncoloured scans render in it, and so do the odd uncoloured vertices of a
 * coloured OBJ.
 */
export const NEUTRAL_RGB: Readonly<Vec3> = [148, 163, 184];
