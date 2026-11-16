/**
 * Shared contracts for the async media-optimization pipeline.
 *
 * The pipeline never mutates originals: every derived artefact (resized
 * image, GLB preview, thumbnail) is written NEXT TO the original with a
 * `__<variant>.<ext>` suffix and recorded in a `variants` JSON column.
 * The DB row is the single source of truth for job state — the in-memory
 * queue is just a scheduler, which is what makes a later swap to
 * BullMQ/Redis a transport change rather than a redesign.
 */

/** Which table the job's `id` points into. */
export type MediaJobKind =
  | 'order-file'
  | 'treatment-attachment'
  | 'support-message'
  | 'slider-media'
  | 'blog-image';

export interface MediaJob {
  kind: MediaJobKind;
  id: string;
}

/** One derived artefact on disk. */
export interface MediaVariantInfo {
  /** Uploads-root-relative POSIX path. NEVER exposed raw over the API. */
  path: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  /** 'webp' | 'avif' | 'glb' — drives the Content-Type when served. */
  format: string;
}

/**
 * Variant map persisted in the `variants` JSON column.
 * Image keys:   thumb (~300px) | md (~800px) | lg (~1600px) | avif (md-size).
 * 3D scan keys: thumb (rendered preview) | model (optimized GLB).
 */
export type MediaVariants = Record<string, MediaVariantInfo>;

export interface ImageProcessResult {
  width: number;
  height: number;
  variants: MediaVariants;
}

/** Safe, extraction-free ZIP description (central directory only). */
export interface ZipMetadata {
  kind: 'zip';
  entryCount: number;
  /** Unique first path segments, capped — what the archive "contains". */
  topLevelEntries: string[];
  /** Sum of declared uncompressed sizes (from headers, nothing inflated). */
  totalUncompressedBytes: number;
  /** True when listing stopped early because a safety cap was hit. */
  truncated: boolean;
  /** Zip-bomb heuristics tripped (ratio / entry count). Display-only flag. */
  suspicious: boolean;
}

/** The 3D scan formats the mesh pipeline understands. */
export type MeshFormat = 'stl' | 'ply' | 'obj';

/**
 * Geometry facts of a 3D scan. STL rows written before PLY/OBJ support
 * carry exactly the same shape (the optional flags are simply absent), so
 * readers keyed on `kind === 'stl'` keep working unchanged.
 */
export interface MeshMetadata {
  /** The scan's true format, the same value as its file category. */
  kind: MeshFormat;
  /**
   * STL: `binary` | `ascii`. PLY: the header's encoding
   * (`ascii` | `binary_little_endian` | `binary_big_endian`). OBJ: `ascii`.
   */
  format: 'binary' | 'ascii' | 'binary_little_endian' | 'binary_big_endian';
  /** 0 for a point cloud. */
  triangleCount: number;
  /**
   * Unique vertex count when deduplicated for the GLB, else the source
   * count (an STL soup counts 3 per triangle; a point cloud, its points).
   */
  vertexCount: number;
  bbox: {
    min: [number, number, number];
    max: [number, number, number];
  };
  /** Set (true) only when the scan carries per-vertex colours. */
  hasColors?: boolean;
  /** Set (true) only for vertices without faces: no `model` variant. */
  pointCloud?: boolean;
}

export interface MeshProcessResult {
  metadata: MeshMetadata;
  /** `thumb` (rendered webp) and, when within caps, `model` (GLB). */
  variants: MediaVariants;
}
