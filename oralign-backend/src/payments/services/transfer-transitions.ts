import {
  OrderStatus,
  type Payment,
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
} from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import { idempotencyKeyReused } from './transfer-rules';

/**
 * The database steps the pack-transfer transitions share (declare,
 * withdraw, reject), as plain functions over the caller's transaction:
 * PaymentsModule's providers are fixed, and these steps hold no state.
 *
 * Lock order (CONTRACT §0): the installment row FOR UPDATE first, the
 * order row last; the audit row is written after every order lock (its
 * foreign key takes a key-share lock on the order).
 */

type Tx = Prisma.TransactionClient;

/** The installment row lock every installment transition takes first. */
export async function lockInstallmentRow(
  tx: Pick<Tx, '$queryRaw'>,
  installmentId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "QuoteInstallment" WHERE id = ${installmentId} FOR UPDATE`;
}

/**
 * Cancel the declarations still awaiting confirmation on an installment,
 * stamped as superseded by `actor` (cancelledAt / ById / ByName), the
 * receipts kept. Returns their ids, newest first. Status-guarded: a row a
 * concurrent admin processed meanwhile is left alone.
 */
export async function supersedeAwaitingDeclarations(
  tx: Pick<Tx, 'payment'>,
  args: {
    installmentId: string;
    actor: Caller;
    actorName: string | null;
    at: Date;
  },
): Promise<string[]> {
  const awaiting = await tx.payment.findMany({
    where: {
      installmentId: args.installmentId,
      paymentMethod: PaymentMethod.bank_transfer,
      status: PaymentRecordStatus.awaiting_confirmation,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  if (awaiting.length === 0) return [];
  const ids = awaiting.map((row) => row.id);
  await tx.payment.updateMany({
    where: {
      id: { in: ids },
      status: PaymentRecordStatus.awaiting_confirmation,
    },
    data: {
      status: PaymentRecordStatus.cancelled,
      cancelledAt: args.at,
      cancelledById: args.actor.userId,
      cancelledByName: args.actorName,
    },
  });
  return ids;
}

/**
 * How many installment transfers of the order still await the admin: the
 * one rule behind "the order stays in payment_review" (DECISIONS §1),
 * shared by the refusal / withdrawal and the settlement paths.
 */
export function countAwaitingInstallmentTransfers(
  tx: Pick<Tx, 'payment'>,
  orderId: string,
): Promise<number> {
  return tx.payment.count({
    where: {
      orderId,
      purpose: PaymentPurpose.installment,
      paymentMethod: PaymentMethod.bank_transfer,
      status: PaymentRecordStatus.awaiting_confirmation,
    },
  });
}

/**
 * A refusal (or a withdrawal) moves the order back from payment_review to
 * payment_pending when no other transfer of the order still awaits the
 * admin (DECISIONS §1). The order row is locked BEFORE the count, so a
 * declaration of another installment committing meanwhile is either seen
 * (the order stays in review) or comes after (and puts it back).
 */
export async function releaseOrderFromReview(
  tx: Pick<Tx, '$queryRaw' | 'payment' | 'dentalOrder'>,
  orderId: string,
): Promise<boolean> {
  await tx.$queryRaw`SELECT id FROM "DentalOrder" WHERE id = ${orderId} FOR UPDATE`;
  const stillAwaiting = await countAwaitingInstallmentTransfers(tx, orderId);
  if (stillAwaiting > 0) return false;
  const { count } = await tx.dentalOrder.updateMany({
    where: { id: orderId, status: OrderStatus.payment_review },
    data: { status: OrderStatus.payment_pending },
  });
  return count > 0;
}

/**
 * The payment-phase status an order takes when a settlement leaves its
 * quote partially paid: payment_review while another installment transfer
 * of the order still awaits the admin ("Toutes les restantes" declares
 * several), payment_pending otherwise. The same rule as a refusal
 * (releaseOrderFromReview), so confirming one transfer of several never
 * takes the order out of review. Call it after the settled payment left
 * awaiting_confirmation.
 *
 * The order row is locked BEFORE the count, so a declaration of another
 * installment committing meanwhile is either seen or comes after (and
 * puts the order in review itself). FOR NO KEY UPDATE, not FOR UPDATE:
 * this runs late in the settlement, after rows that reference the order
 * were written (the cash payment, the batch_unlocked audit row), and a
 * concurrent settlement of the same order may hold the same key-share
 * locks while it waits for this transaction's quotation lock; FOR UPDATE
 * would deadlock with it, FOR NO KEY UPDATE does not conflict with key
 * shares and still serialises with declarations (their status update) and
 * refusals (FOR UPDATE).
 */
export async function paymentPhaseAfterPartialSettlement(
  tx: Pick<Tx, '$queryRaw' | 'payment'>,
  orderId: string,
): Promise<OrderStatus> {
  await tx.$queryRaw`SELECT id FROM "DentalOrder" WHERE id = ${orderId} FOR NO KEY UPDATE`;
  const awaiting = await countAwaitingInstallmentTransfers(tx, orderId);
  return awaiting > 0
    ? OrderStatus.payment_review
    : OrderStatus.payment_pending;
}

/**
 * The declaration a replayed Idempotency-Key already created: the row when
 * this caller used the key on THIS installment (the repeat answers 200
 * with it, as it stands now), null when the key is new, 409
 * TRANSFER_IDEMPOTENCY_KEY_REUSED when it named another installment.
 * Served by the (initiatedById, declarationKey) unique index.
 */
export async function findDeclarationReplay(
  db: Pick<Tx, 'payment'>,
  args: { callerId: string; key: string; installmentId: string },
): Promise<Payment | null> {
  const existing = await db.payment.findUnique({
    where: {
      initiatedById_declarationKey: {
        initiatedById: args.callerId,
        declarationKey: args.key,
      },
    },
  });
  if (!existing) return null;
  if (existing.installmentId !== args.installmentId) {
    throw idempotencyKeyReused();
  }
  return existing;
}

/** True for the unique violation a concurrent replay of the same key hits. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
