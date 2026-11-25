import { extname } from 'path';
import type { OrderFileCategory } from '@prisma/client';

/**
 * The file name a production stream sends in Content-Disposition:
 * `<category>-<NNN>[-<variant>]<ext>` ("front-photo-003.jpg",
 * "front-photo-003-md.webp"). Never the stored name nor the stored variant
 * name: those carry the doctor's and the patient's names and, with the
 * order id, rebuild the disk path under uploads/orders/. `storedPath` only
 * lends its extension.
 */
export function productionDownloadName(
  file: { category: OrderFileCategory; orderIndex: number },
  storedPath: string,
  variant?: string,
): string {
  const ext = extname(storedPath)
    .toLowerCase()
    .replace(/[^.a-z0-9]/g, '');
  const stem = `${file.category.replace(/_/g, '-')}-${String(
    Math.max(file.orderIndex, 0),
  ).padStart(3, '0')}`;
  return `${stem}${variant ? `-${variant}` : ''}${ext}`;
}
