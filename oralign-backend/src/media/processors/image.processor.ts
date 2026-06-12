import * as path from 'path';
import sharp from 'sharp';
import {
  AVIF_MAX_SOURCE_PIXELS,
  AVIF_VARIANT,
  IMAGE_VARIANT_SPECS,
} from '../media.constants';
import { ImageProcessResult, MediaVariants } from '../media.types';

export interface ImageProcessArgs {
  /** Absolute path of the original (never modified). */
  absPath: string;
  /** Absolute directory derived files are written into. */
  absDir: string;
  /** Uploads-root-relative POSIX dir recorded in variant paths. */
  relDir: string;
  /** Filename stem for derived files (`<stem>__thumb.webp`, …). */
  baseName: string;
}

/**
 * Generate the resized/recompressed variant set for one image.
 *
 * Contract notes:
 *   • `.rotate()` (no args) bakes the EXIF orientation into the pixels
 *     so variants render upright everywhere without EXIF support.
 *   • sharp strips metadata by default — clinical photos shot on
 *     phones lose GPS/EXIF in every variant, which is the right
 *     privacy default; the untouched original keeps its data.
 *   • `withoutEnlargement` means a 600px source yields identical md/lg
 *     outputs; we drop the duplicates instead of storing them twice.
 *   • Animated GIFs are flattened to their first frame (preview-only
 *     variants; the original stays animated for download).
 */
export async function processImage(
  args: ImageProcessArgs,
): Promise<ImageProcessResult> {
  const { absPath, absDir, relDir, baseName } = args;

  const probe = sharp(absPath, { failOn: 'none' });
  const meta = await probe.metadata();
  if (!meta.width || !meta.height) {
    throw new Error('Could not read image dimensions');
  }

  // EXIF orientations 5-8 are 90°/270° rotations — after `.rotate()`
  // bakes them in, the effective width/height swap.
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = rotated ? meta.height : meta.width;
  const height = rotated ? meta.width : meta.height;
  const longest = Math.max(width, height);

  const variants: MediaVariants = {};
  let lastEmittedDim = 0;

  for (const spec of IMAGE_VARIANT_SPECS) {
    // A variant whose bound exceeds the source adds no pixels over the
    // previous one — emit it only once (the first time we'd clamp).
    const effectiveDim = Math.min(spec.maxDim, longest);
    if (effectiveDim <= lastEmittedDim) continue;

    const fileName = `${baseName}__${spec.name}.webp`;
    const info = await sharp(absPath, { failOn: 'none' })
      .rotate()
      .resize({
        width: spec.maxDim,
        height: spec.maxDim,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: spec.quality })
      .toFile(path.join(absDir, fileName));

    variants[spec.name] = {
      path: path.posix.join(relDir, fileName),
      width: info.width,
      height: info.height,
      sizeBytes: info.size,
      format: 'webp',
    };
    lastEmittedDim = Math.max(info.width, info.height);
  }

  // Single md-size AVIF — best bytes-per-pixel for the detail view.
  // Skipped for huge sources (encode cost) and never fatal: WebP
  // variants already cover every consumer.
  if (width * height <= AVIF_MAX_SOURCE_PIXELS) {
    try {
      const fileName = `${baseName}__${AVIF_VARIANT.name}.avif`;
      const info = await sharp(absPath, { failOn: 'none' })
        .rotate()
        .resize({
          width: AVIF_VARIANT.maxDim,
          height: AVIF_VARIANT.maxDim,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .avif({ quality: AVIF_VARIANT.quality, effort: 4 })
        .toFile(path.join(absDir, fileName));

      variants[AVIF_VARIANT.name] = {
        path: path.posix.join(relDir, fileName),
        width: info.width,
        height: info.height,
        sizeBytes: info.size,
        format: 'avif',
      };
    } catch {
      // AVIF support can vary with the bundled libvips — fine, WebP
      // covers it.
    }
  }

  return { width, height, variants };
}
