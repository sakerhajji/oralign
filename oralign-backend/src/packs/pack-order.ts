import { Prisma } from '@prisma/client';

/**
 * The catalogue order chosen by the admin on /dashboard/packs. Every list
 * of packs shown to a person reads it from here, so the practitioner's
 * page, the quote picker and the admin table always agree. `createdAt`
 * only settles ties (packs seeded without a position).
 */
export const PACK_DISPLAY_ORDER: Prisma.PackOrderByWithRelationInput[] = [
  { displayOrder: 'asc' },
  { createdAt: 'asc' },
];

/**
 * The new catalogue order after an admin moved `movedIds`: the moved packs
 * take the positions those same packs held, in the requested order, and
 * every other pack keeps its place. That is what lets the admin reorder
 * the active packs while inactive ones are hidden from the table.
 */
export function applyPackOrder(
  currentIds: readonly string[],
  movedIds: readonly string[],
): string[] {
  const moved = new Set(movedIds);
  let next = 0;
  return currentIds.map((id) => (moved.has(id) ? movedIds[next++] : id));
}
