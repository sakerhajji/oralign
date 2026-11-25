import { Prisma } from '@prisma/client';

/**
 * The queue's search and orderings, shared by the technician queue
 * (production-queue.service.ts) and the admin "Avancement" view
 * (reports/production-progress.view.ts), so the two lists can never drift.
 * Plain values: importing them pulls in no Nest module.
 */

/** "En cours": in-progress cases first, then the untouched ones first come, first served; `id` makes it total. */
export const ACTIVE_QUEUE_ORDER_BY = [
  { productionProgress: { lastActionAt: { sort: 'desc', nulls: 'last' } } },
  { createdAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.DentalOrderOrderByWithRelationInput[];

/** "Terminés": latest action first. */
export const DONE_QUEUE_ORDER_BY = [
  { productionProgress: { lastActionAt: 'desc' } },
  { id: 'asc' },
] satisfies Prisma.DentalOrderOrderByWithRelationInput[];

/** orderCode, the parent's code, the patient or the practitioner (contains, case-insensitive). */
export function productionSearchWhere(
  search: string | undefined,
): Prisma.DentalOrderWhereInput {
  if (!search) return {};
  const contains = { contains: search, mode: Prisma.QueryMode.insensitive };
  return {
    OR: [
      { orderCode: contains },
      { parentOrder: { is: { orderCode: contains } } },
      { patient: { is: { fullName: contains } } },
      { doctor: { is: { fullName: contains } } },
    ],
  };
}
