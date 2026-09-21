import * as path from 'path';
import { OrderFileCategory } from '@prisma/client';

/**
 * Upload slots and what they mean for the filenames a human sees.
 *
 * The order form uploads each clinical photo / scan into a named SLOT and
 * prefixes the slot key onto the client filename it stores as
 * `originalName`: `left-lateral__IMG_1234.jpg`, `upper-stl__scan.stl`.
 * The prefix is load-bearing and stays in the database — the form
 * re-binds files to their slots with it, and the order-sheet PDF captions
 * and orders photos by it. Every consumer that shows a filename to a
 * person therefore parses it through here instead of with its own regex.
 */

const SLOT_PREFIX = /^([a-z0-9-]+)__(.*)$/i;

export function splitUploadSlot(name: string): {
  slotKey: string | null;
  rest: string;
} {
  const match = SLOT_PREFIX.exec(name);
  return match
    ? { slotKey: match[1].toLowerCase(), rest: match[2] }
    : { slotKey: null, rest: name };
}

/** Name tokens that state a side of the mouth ("left-lateral", "left-photo"). */
const SIDE_TOKENS: ReadonlySet<string> = new Set(['left', 'right']);

function namesSide(token: string): boolean {
  return token
    .toLowerCase()
    .split('-')
    .some((part) => SIDE_TOKENS.has(part));
}

/**
 * The side-bearing categories as generated names spell them ("left-photo",
 * "right-photo" — order-files.service derives the segment with
 * `category.replace(/_/g, '-')`), read off the enum so a future category
 * is covered without touching this file.
 */
const SIDE_CATEGORY_TOKENS: ReadonlySet<string> = new Set(
  Object.values(OrderFileCategory)
    .map((category) => category.replace(/_/g, '-'))
    .filter(namesSide),
);

/**
 * Drop generated side segments from a `_`-separated name. They also turn
 * up AFTER a slot prefix: re-editing a photo re-uploads it under its
 * generated name ("left-lateral__Dr-X_Patient_left-photo_004.jpg").
 */
function dropSideCategorySegments(name: string): string {
  const kept = name
    .split('_')
    .filter((part) => !SIDE_CATEGORY_TOKENS.has(part.toLowerCase()));
  return kept.some((part) => part.length > 0) ? kept.join('_') : name;
}

/**
 * The file's name inside the lab ZIP (its folder is chosen separately,
 * from the category — see LAB_FOLDER_LABELS in order-export.service.ts).
 *
 * The lateral-photo FOLDERS already state the side, in the clinic's
 * mirrored convention (`left_photo` → "PHOTO DENTS DROITE"). Two internal
 * names used to restate it inside the file name — and name the OPPOSITE
 * side: the upload-slot key (`PHOTO DENTS DROITE/left-lateral__IMG.jpg`)
 * and the raw category segment of a generated name (`…_left-photo_004.jpg`,
 * which a re-edited photo carries even behind its slot prefix). Both are
 * dropped here, for files already stored as well as new ones.
 *
 * Every other slot prefix is kept on purpose: it carries what the folder
 * cannot — upper vs lower STL scan, first vs second occlusion, the
 * profile photo that shares the lateral folder. The doctor's own client
 * filename is never rewritten.
 */
export function labZipFileName(file: {
  originalName: string | null;
  generatedName: string | null;
  relativePath: string;
  category: string;
}): string {
  const original = file.originalName?.trim();
  if (original) {
    const { slotKey, rest } = splitUploadSlot(original);
    const name =
      slotKey && namesSide(slotKey) && rest.trim() ? rest.trim() : original;
    return dropSideCategorySegments(name);
  }

  const generated = file.generatedName?.trim();
  if (generated) return dropSideCategorySegments(generated);

  return path.basename(file.relativePath);
}
