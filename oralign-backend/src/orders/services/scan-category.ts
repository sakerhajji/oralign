import { OrderFileCategory } from '@prisma/client';
import { meshFormatOf } from '../../media/media.constants';
import type { MeshFormat } from '../../media/media.types';

const SCAN_CATEGORY: Readonly<Record<MeshFormat, OrderFileCategory>> = {
  stl: OrderFileCategory.stl,
  ply: OrderFileCategory.ply,
  obj: OrderFileCategory.obj,
};

const SCAN_CATEGORIES: ReadonlySet<OrderFileCategory> = new Set(
  Object.values(SCAN_CATEGORY),
);

/**
 * The category a file is stored under. Every 3D scan slot accepts STL, PLY
 * and OBJ, so a `.ply` dropped into the upper-arch slot may arrive labelled
 * `stl`: among the three scan categories the file's extension wins, keeping
 * the category truthful for the export folders, the order sheet and the
 * viewer. The slot itself travels in the `<slotKey>__` originalName prefix,
 * which this never touches. Any other category is kept as requested.
 */
export function resolveUploadCategory(
  requested: OrderFileCategory,
  fileName: string,
): OrderFileCategory {
  const format = meshFormatOf(fileName);
  return format && SCAN_CATEGORIES.has(requested)
    ? SCAN_CATEGORY[format]
    : requested;
}
