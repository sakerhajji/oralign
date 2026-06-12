/**
 * Tuning knobs for the media-optimization pipeline, in one place so the
 * trade-offs are reviewable. Sizes follow the product spec: ~300px
 * thumbnails for cards/lists, ~800px for detail panes, ~1600px for
 * lightbox/fullscreen. WebP everywhere (universal support); AVIF only
 * at the md size where its encode cost buys the most.
 */

export interface ImageVariantSpec {
  name: 'thumb' | 'md' | 'lg';
  /** Longest-side bound; `fit: inside` + withoutEnlargement (never upscale). */
  maxDim: number;
  quality: number;
}

export const IMAGE_VARIANT_SPECS: readonly ImageVariantSpec[] = [
  { name: 'thumb', maxDim: 300, quality: 75 },
  { name: 'md', maxDim: 800, quality: 80 },
  { name: 'lg', maxDim: 1600, quality: 82 },
] as const;

// AVIF encodes 3-10× slower than WebP and the win shrinks above ~1MP,
// so we emit a single md-size AVIF and skip it entirely for very large
// sources where the encode would hog the single worker slot.
export const AVIF_VARIANT = { name: 'avif', maxDim: 800, quality: 50 } as const;
export const AVIF_MAX_SOURCE_PIXELS = 24_000_000; // ~24 MP

/**
 * Mime types sharp can reliably decode with the prebuilt binaries.
 * Deliberately EXCLUDES image/heic — prebuilt libvips has no HEVC
 * decoder (patent), so HEIC uploads keep status `failed` and the
 * original is served as-is.
 */
export const PROCESSABLE_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

export const ZIP_MIMES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'multipart/x-zip',
]);

// ── ZIP safety caps ──────────────────────────────────────────────────
// We only ever read the central directory (no extraction, nothing is
// inflated), so a zip bomb cannot expand here — these caps just keep
// the LISTING itself bounded and let us flag suspicious archives in
// the metadata we show to admins.
export const ZIP_MAX_LISTED_ENTRIES = 20_000;
export const ZIP_MAX_TOP_LEVEL = 40;
export const ZIP_SUSPICIOUS_RATIO = 150; // declared-uncompressed : archive size
export const ZIP_SUSPICIOUS_TOTAL_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB

/** How long after bootstrap before reconciliation/backfill starts. */
export const RECONCILE_DELAY_MS = 15_000;
/** Per-model cap on backfilled rows per boot — keeps cold starts calm. */
export const RECONCILE_BACKFILL_BATCH = 300;

export type MediaKind = 'image' | 'zip' | 'stl';

/**
 * Single source of truth for "does the pipeline apply to this file".
 * Upload sites use it to decide whether a row starts as `pending`
 * (vs. null = not applicable), and the worker uses it to dispatch.
 * Returning null for image/heic is deliberate — see
 * PROCESSABLE_IMAGE_MIMES.
 */
export function classifyMedia(
  mimeType: string | null | undefined,
  fileName: string,
): MediaKind | null {
  const lower = (fileName || '').toLowerCase();
  if (mimeType && PROCESSABLE_IMAGE_MIMES.has(mimeType)) return 'image';
  if ((mimeType && ZIP_MIMES.has(mimeType)) || lower.endsWith('.zip')) {
    return 'zip';
  }
  if (
    lower.endsWith('.stl') ||
    mimeType === 'model/stl' ||
    mimeType === 'application/sla' ||
    mimeType === 'application/vnd.ms-pki.stl'
  ) {
    return 'stl';
  }
  return null;
}
