import { NotificationType } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { isTransferSubjectKey } from './notification-subject';

/**
 * The one reader of an admin's UNREAD transfer subjects: the rows the
 * listener writes for every admin when a receipt arrives
 * (payment_declared / treatment_fee_declared, each with its subjectKey).
 * Shared by the sidebar badge (admin-dashboard.service.ts) and the
 * pending desk's "Nouveau" tab and seenByMe (transfer-queue.service.ts),
 * so the two always count the same subjects.
 *
 * A plain function (no DI): DashboardModule and PaymentsModule both read
 * it without importing NotificationsModule.
 */

/** The notification types that announce a transfer receipt to the admins. */
export const TRANSFER_DECLARED_TYPES: readonly NotificationType[] = [
  NotificationType.payment_declared,
  NotificationType.treatment_fee_declared,
];

/**
 * Upper bound of the rows read. An admin's unread transfer rows are about
 * transfers still in flight (every subject is resolved when processed, so
 * they do not pile up); the cap only guards the query against a runaway
 * inbox. Duplicates (one subject, several rows: the migration backfill of
 * fee receipts re-uploaded before 2026-11-27) are folded below.
 */
export const UNREAD_TRANSFER_ROWS_CAP = 2000;

export type NotificationReader = Pick<PrismaService, 'notification'>;

/**
 * The distinct, well-formed subject keys of my unread transfer rows. One
 * indexed read on (recipientId, subjectKey, readAt), keys only.
 */
export async function unreadTransferSubjectKeys(
  db: NotificationReader,
  recipientId: string,
): Promise<Set<string>> {
  const rows = await db.notification.findMany({
    where: {
      recipientId,
      readAt: null,
      subjectKey: { not: null },
      type: { in: [...TRANSFER_DECLARED_TYPES] },
    },
    select: { subjectKey: true },
    take: UNREAD_TRANSFER_ROWS_CAP,
  });
  const keys = new Set<string>();
  for (const row of rows) {
    if (isTransferSubjectKey(row.subjectKey)) keys.add(row.subjectKey);
  }
  return keys;
}
