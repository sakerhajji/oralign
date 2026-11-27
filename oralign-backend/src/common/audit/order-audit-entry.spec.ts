import { UserRole } from '@prisma/client';
import type { Caller } from '../access/caller';
import {
  orderAuditEntry,
  withoutPathKeys,
  writeOrderAudit,
} from './order-audit-entry';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };

function db(fullName: string | null = 'Admin One') {
  return {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(fullName === null ? null : { fullName }),
    },
    orderAuditLog: { create: jest.fn().mockResolvedValue({ id: 'a-1' }) },
  };
}

describe('orderAuditEntry (the one OrderAuditLog row builder)', () => {
  it('snapshots the actor: id, role and the name read at write time', async () => {
    const client = db('  Admin One  ');
    const entry = await orderAuditEntry(client as never, admin, {
      action: 'payment_confirmed',
      metadata: { installmentNumber: 2 },
      paymentId: 'p-1',
    });
    expect(entry).toEqual({
      actorId: 'u-admin',
      actorName: 'Admin One',
      actorRole: UserRole.admin,
      action: 'payment_confirmed',
      metadata: { installmentNumber: 2 },
      paymentId: 'p-1',
    });
    expect(client.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u-admin' },
      select: { fullName: true },
    });
  });

  it('a null actor is the system: no lookup, no id, no role', async () => {
    const client = db();
    const entry = await orderAuditEntry(client as never, null, {
      action: 'batch_unlocked',
    });
    expect(entry).toEqual({
      actorId: null,
      actorName: null,
      actorRole: null,
      action: 'batch_unlocked',
    });
    expect(client.user.findUnique).not.toHaveBeenCalled();
  });

  it('uses a name the caller already read (no second lookup)', async () => {
    const client = db();
    const entry = await orderAuditEntry(client as never, admin, {
      action: 'batch_unlocked',
      actorName: 'Known Name',
    });
    expect(entry.actorName).toBe('Known Name');
    expect(client.user.findUnique).not.toHaveBeenCalled();
  });

  it('drops empty changes / metadata and an absent paymentId', async () => {
    const entry = await orderAuditEntry(db() as never, admin, {
      action: 'updated',
      changes: {},
      metadata: null,
      paymentId: null,
    });
    expect(entry).not.toHaveProperty('changes');
    expect(entry).not.toHaveProperty('metadata');
    expect(entry).not.toHaveProperty('paymentId');
  });

  it('never stores a file path or URL, in metadata or changes', async () => {
    const entry = await orderAuditEntry(db() as never, admin, {
      action: 'payment_proof_replaced',
      metadata: {
        hasProof: true,
        proofPath: '/uploads/orders/o-1/payment-proofs/a.pdf',
        previousProofPath: '/uploads/payments/b.pdf',
        proofUrl: '/uploads/payments/b.pdf',
        fileName: 'recu.pdf',
      },
      changes: {
        treatmentFeeProofPath: { from: 'a', to: 'b' },
        status: { from: 'a', to: 'b' },
      },
    });
    expect(entry.metadata).toEqual({ hasProof: true, fileName: 'recu.pdf' });
    expect(entry.changes).toEqual({ status: { from: 'a', to: 'b' } });
  });

  it('a payload made only of paths is dropped altogether', async () => {
    const entry = await orderAuditEntry(db() as never, admin, {
      action: 'x',
      metadata: { relativePath: 'a' },
    });
    expect(entry).not.toHaveProperty('metadata');
  });

  it('withoutPathKeys keeps names, counts and categories', () => {
    expect(
      withoutPathKeys({
        fileNames: ['a'],
        count: 2,
        category: 'scan',
        url: 'x',
      }),
    ).toEqual({ fileNames: ['a'], count: 2, category: 'scan' });
  });

  it('writeOrderAudit inserts the row on the given order', async () => {
    const client = db();
    await writeOrderAudit(client as never, 'o-1', admin, {
      action: 'payment_rejected',
      metadata: { reason: 'Montant incorrect' },
      paymentId: 'p-1',
    });
    expect(client.orderAuditLog.create).toHaveBeenCalledWith({
      data: {
        orderId: 'o-1',
        actorId: 'u-admin',
        actorName: 'Admin One',
        actorRole: UserRole.admin,
        action: 'payment_rejected',
        metadata: { reason: 'Montant incorrect' },
        paymentId: 'p-1',
      },
      select: { id: true },
    });
  });
});
