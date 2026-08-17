import type { UserRole } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Display name of the acting user, captured at write time.
 *
 * Actor references (createdBy / sender / uploadedBy) are `onDelete: SetNull`
 * so hard-deleting an account never destroys the records it authored — but
 * SetNull alone would leave "Sent by: —" in a doctor's treatment thread or
 * on a quotation. Every create site therefore snapshots the name next to
 * the FK. One extra indexed lookup per write; never worth caching.
 */
export async function lookupActorName(
  prisma: Pick<PrismaService, 'user'>,
  userId: string,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true },
  });
  return user?.fullName ?? null;
}

/** The shape every message DTO exposes for its author. */
export interface SenderView {
  id: string;
  fullName: string;
  role: UserRole | string;
  avatarUrl: string | null;
}

/** Shown when the account behind a message no longer exists. */
export const DELETED_ACCOUNT_LABEL = 'Deleted account';

/**
 * Serialise a message's sender: the live User relation when it still
 * exists, otherwise a synthetic principal built from the snapshot columns
 * (`senderName` / `senderRole`) — so a thread stays readable after the
 * author's account was purged, and clients never see `sender: null`.
 */
export function withSenderFallback<
  T extends {
    senderId: string | null;
    senderName?: string | null;
    senderRole?: UserRole | null;
    sender: SenderView | null;
  },
>(row: T): Omit<T, 'sender'> & { sender: SenderView } {
  if (row.sender) return row as Omit<T, 'sender'> & { sender: SenderView };
  return {
    ...row,
    sender: {
      id: row.senderId ?? '',
      fullName: row.senderName ?? DELETED_ACCOUNT_LABEL,
      role: row.senderRole ?? 'designer',
      avatarUrl: null,
    },
  };
}
