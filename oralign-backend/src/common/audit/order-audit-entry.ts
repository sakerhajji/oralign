import type { Prisma, UserRole } from '@prisma/client';
import { lookupActorName } from '../access/actor-snapshot';
import type { Caller } from '../access/caller';

/**
 * The OrderAuditLog row builder, as a plain function: no DI, so the
 * payments module, the production helpers and the treatment-fee service
 * write the same row without importing OrdersModule (which would close a
 * module cycle). OrderAuditService.entry() delegates here.
 *
 *   const entry = await orderAuditEntry(tx, { actor, action, metadata, paymentId });
 *   await tx.orderAuditLog.create({ data: { orderId, ...entry } });
 *
 * or writeOrderAudit(tx, orderId, {...}) for both steps. Run it inside the
 * transaction of the transition it records (DECISIONS §1 "Audit").
 *
 * The actor is a REAL account (its id is a foreign key, SetNull) or null
 * for the system (a card settlement, the inactivity sweep). Its display
 * name is snapshotted at write time (DELETION-POLICY rule 4). Never pass a
 * synthetic caller such as the ClicToPay reconciliation principal: pass
 * null.
 */

export type AuditChanges = Record<string, { from: unknown; to: unknown }>;
export type AuditMetadata = Record<string, unknown>;

/**
 * Keys a history row must never carry: file paths and URLs (assigned
 * designers read the history). Matched on the key name, case-insensitive:
 * proofPath, previousProofPath, relativePath, proofUrl, …
 */
export const AUDIT_FORBIDDEN_KEY = /(?:path|url)$/i;

/** The OrderAuditLog columns an entry fills (orderId aside). */
export interface OrderAuditEntry {
  actorId: string | null;
  actorName: string | null;
  actorRole: UserRole | null;
  action: string;
  changes?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  paymentId?: string;
}

/** An entry written by a user (the shape OrderAuditService.entry returns). */
export interface CallerAuditEntry extends OrderAuditEntry {
  actorId: string;
  actorRole: UserRole;
}

export interface OrderAuditEntryInput {
  action: string;
  changes?: AuditChanges | null;
  metadata?: AuditMetadata | null;
  /** OrderAuditLog.paymentId: the Payment the row is about. */
  paymentId?: string | null;
  /**
   * The actor's name when the caller already read it (spares the lookup).
   * undefined = look it up.
   */
  actorName?: string | null;
}

type AuditDb = Pick<Prisma.TransactionClient, 'user'>;

/** The object without its path / URL keys (top level only, like the rows). */
export function withoutPathKeys<T extends Record<string, unknown>>(
  value: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !AUDIT_FORBIDDEN_KEY.test(key)),
  ) as Partial<T>;
}

function json(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (!value) return undefined;
  const kept = withoutPathKeys(value);
  return Object.keys(kept).length > 0
    ? (kept as Prisma.InputJsonValue)
    : undefined;
}

/** Build the row for an action by `actor` (a user). */
export async function orderAuditEntry(
  db: AuditDb,
  actor: Caller,
  input: OrderAuditEntryInput,
): Promise<CallerAuditEntry>;
/** Build the row for an action by `actor`, or by the system (null). */
export async function orderAuditEntry(
  db: AuditDb,
  actor: Caller | null,
  input: OrderAuditEntryInput,
): Promise<OrderAuditEntry>;
export async function orderAuditEntry(
  db: AuditDb,
  actor: Caller | null,
  input: OrderAuditEntryInput,
): Promise<OrderAuditEntry> {
  const actorName = !actor
    ? null
    : input.actorName !== undefined
      ? input.actorName
      : await lookupActorName(db, actor.userId);
  const changes = json(input.changes);
  const metadata = json(input.metadata);
  return {
    actorId: actor?.userId ?? null,
    actorName,
    actorRole: actor?.role ?? null,
    action: input.action,
    ...(changes ? { changes } : {}),
    ...(metadata ? { metadata } : {}),
    ...(input.paymentId ? { paymentId: input.paymentId } : {}),
  };
}

/** orderAuditEntry + the insert, in the caller's transaction. */
export async function writeOrderAudit(
  db: AuditDb & Pick<Prisma.TransactionClient, 'orderAuditLog'>,
  orderId: string,
  actor: Caller | null,
  input: OrderAuditEntryInput,
): Promise<void> {
  const entry = await orderAuditEntry(db, actor, input);
  await db.orderAuditLog.create({
    data: { orderId, ...entry },
    select: { id: true },
  });
}
