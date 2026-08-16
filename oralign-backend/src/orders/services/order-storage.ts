import { OrderFileCategory } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '../../common/exceptions/app.exception';

/**
 * Where order files live on disk and how big they may be. Pure helpers —
 * shared by OrderFilesService (write/read), OrderExportService (read),
 * OrderService (delete on order removal) and ChunkedUploadService (tmp
 * staging under the same root).
 */

export const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

// ── Per-category upload caps ─────────────────────────────────────────
// Clinical photos, PDFs and generic attachments fit comfortably under
// 50 MB and we cap there to keep storage sane.
//
// Two families get the 1 GB ceiling:
//   • CBCT / DICOM bundles (`zip`) — a single archive holding hundreds
//     of slice files; real-world volumes sit between 200 MB and 800 MB.
//   • 3D scans (`stl` / `ply` / `obj`) — high-resolution intra-oral
//     scanner exports (full-arch STL from modern scanners routinely
//     exceed 50 MB, and multi-arch/bite exports go far beyond).
// The photo/PDF slots stay at 50 MB so a stray giant JPEG can't sneak
// into a clinical-photo slot.
//
// Bytes-only constants (no MB strings) so unit conversion is obvious
// at the call site.
export const MAX_FILE_SIZE_DEFAULT_BYTES = 50 * 1024 * 1024;      //  50 MB
export const MAX_FILE_SIZE_ZIP_BUNDLE_BYTES = 1024 * 1024 * 1024; //   1 GB
/** Categories that get the 1 GB ceiling: CBCT/DICOM archives + 3D scans. */
export const LARGE_FILE_CATEGORIES: ReadonlySet<OrderFileCategory> = new Set([
  OrderFileCategory.zip,
  OrderFileCategory.stl,
  OrderFileCategory.ply,
  OrderFileCategory.obj,
]);
export const maxUploadBytesFor = (category: OrderFileCategory): number =>
  LARGE_FILE_CATEGORIES.has(category)
    ? MAX_FILE_SIZE_ZIP_BUNDLE_BYTES
    : MAX_FILE_SIZE_DEFAULT_BYTES;

/**
 * Resolve a stored relative path to an absolute one INSIDE the upload
 * root. Rejects absolute paths and `..` segments so a corrupt / hostile
 * DB row can never read or delete outside the uploads tree.
 */
export function resolveUploadPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.includes('..')) {
    throw new BadRequestException('Invalid stored file path');
  }

  const absolutePath = path.resolve(UPLOAD_ROOT, normalized);
  if (!absolutePath.startsWith(path.resolve(UPLOAD_ROOT))) {
    throw new BadRequestException('Invalid stored file path');
  }

  return absolutePath;
}

/** Best-effort unlink; a missing blob is not an error. */
export async function removeFileFromDisk(relativePath: string): Promise<void> {
  const absolutePath = resolveUploadPath(relativePath);
  try {
    if (fs.existsSync(absolutePath)) {
      await fs.promises.unlink(absolutePath);
    }
  } catch {
    return;
  }
}
