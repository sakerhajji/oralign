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
