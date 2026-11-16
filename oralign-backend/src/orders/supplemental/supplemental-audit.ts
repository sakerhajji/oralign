import { Injectable } from '@nestjs/common';
import type { Prisma, UserRole } from '@prisma/client';
import { lookupActorName } from '../../common/access/actor-snapshot';
import type { Caller } from '../../common/access/caller';
import { PrismaService } from '../../prisma/prisma.service';

/** A JSON value the audit log can store. */
export type AuditValue = Prisma.InputJsonValue | null;
export type AuditChanges = Record<string, { from: AuditValue; to: AuditValue }>;
export type AuditMetadata = Record<string, AuditValue>;

/** Who acted, snapshotted once per operation (it survives an account purge). */
export interface AuditActor {
  actorId: string;
  actorName: string | null;
  actorRole: UserRole;
}

export interface AuditRow {
  orderId: string;
  action: string;
  changes?: AuditChanges;
  metadata?: AuditMetadata;
}

export interface ChildAndParentAudit {
  childId: string;
  parentId: string;
  child: { action: string; changes?: AuditChanges; metadata?: AuditMetadata };
  parent: { action: string; metadata: AuditMetadata };
}

/**
 * The two rows every supplemental event writes: the child's own row (its
 * field changes) and a `supplemental_child_*` row on the initial case that
 * carries metadata only, because the case itself did not change.
 */
export function childAndParentRows({
  childId,
  parentId,
  child,
  parent,
}: ChildAndParentAudit): AuditRow[] {
  return [
    { orderId: childId, ...child },
    { orderId: parentId, action: parent.action, metadata: parent.metadata },
  ];
}

/** Write audit rows inside the caller's transaction. Empty diffs are not stored. */
export async function writeAudit(
  tx: Pick<Prisma.TransactionClient, 'orderAuditLog'>,
  actor: AuditActor,
  rows: readonly AuditRow[],
): Promise<void> {
  await tx.orderAuditLog.createMany({
    data: rows.map(({ orderId, action, changes, metadata }) => ({
      ...actor,
      orderId,
      action,
      ...(changes && Object.keys(changes).length > 0 ? { changes } : {}),
      ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
    })),
  });
}

/** Builds the actor snapshot before a transaction opens (one user lookup). */
@Injectable()
export class SupplementalAudit {
  constructor(private readonly prisma: PrismaService) {}

  async actor(caller: Caller): Promise<AuditActor> {
    return {
      actorId: caller.userId,
      actorName: await lookupActorName(this.prisma, caller.userId),
      actorRole: caller.role,
    };
  }
}
