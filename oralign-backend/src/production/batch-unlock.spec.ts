import { BatchStatus, BatchUnlockSource, UserRole } from '@prisma/client';
import type { Caller } from '../common/access/caller';

// The projection has its own spec: here only when and in which transaction
// it runs.
jest.mock('./production-batch-projection', () => ({
  projectBatches: jest.fn().mockResolvedValue(undefined),
}));

import { projectBatches } from './production-batch-projection';
import { unlockStepBatch, unlockStepBatches } from './batch-unlock';

const project = jest.mocked(projectBatches);
beforeEach(() => project.mockClear());

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const at = new Date('2026-11-27T09:00:00.000Z');

function world(
  status: BatchStatus | null = BatchStatus.locked,
  options: { count?: number } = {},
) {
  const tx = {
    quoteStepBatch: {
      findUnique: jest.fn().mockResolvedValue(
        status === null
          ? null
          : {
              id: 'b-2',
              quotationId: 'q-1',
              installmentId: 'i-2',
              batchNumber: 2,
              fromStep: 5,
              toStep: 7,
              status,
              quotation: { orderId: 'o-1' },
              installment: { installmentNumber: 2 },
            },
      ),
      updateMany: jest.fn().mockResolvedValue({ count: options.count ?? 1 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin One' }),
    },
    orderAuditLog: { create: jest.fn().mockResolvedValue({ id: 'a-1' }) },
  };
  return tx;
}

const updateArgs = (tx: ReturnType<typeof world>) =>
  (
    tx.quoteStepBatch.updateMany.mock.calls[0] as [
      { where: Record<string, unknown>; data: Record<string, unknown> },
    ]
  )[0];

const auditData = (tx: ReturnType<typeof world>) =>
  (
    tx.orderAuditLog.create.mock.calls[0] as [{ data: Record<string, unknown> }]
  )[0].data;

describe('unlockStepBatch (the one locked → unlocked writer)', () => {
  it('a settled installment: guarded update, THEN projection, THEN the journal row', async () => {
    const tx = world();
    const released = await unlockStepBatch(tx as never, {
      batchId: 'b-2',
      source: BatchUnlockSource.payment,
      actor: admin,
      paymentId: 'p-9',
      at,
    });

    expect(tx.quoteStepBatch.updateMany).toHaveBeenCalledWith({
      where: { id: 'b-2', status: BatchStatus.locked },
      data: {
        status: BatchStatus.unlocked,
        unlockedAt: at,
        unlockedById: 'u-admin',
        unlockedByName: 'Admin One',
        unlockSource: BatchUnlockSource.payment,
        unlockReason: null,
      },
    });
    expect(project).toHaveBeenCalledWith(tx, { orderId: 'o-1', actorId: null });
    expect(project.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.quoteStepBatch.updateMany.mock.invocationCallOrder[0],
    );
    expect(tx.orderAuditLog.create.mock.invocationCallOrder[0]).toBeGreaterThan(
      project.mock.invocationCallOrder[0],
    );
    expect(auditData(tx)).toEqual({
      orderId: 'o-1',
      actorId: 'u-admin',
      actorName: 'Admin One',
      actorRole: UserRole.admin,
      action: 'batch_unlocked',
      paymentId: 'p-9',
      metadata: {
        batchId: 'b-2',
        batchNumber: 2,
        fromStep: 5,
        toStep: 7,
        source: 'payment',
        installmentNumber: 2,
      },
    });
    // One name lookup for the batch column and the journal row.
    expect(tx.user.findUnique).toHaveBeenCalledTimes(1);
    expect(released).toEqual({
      id: 'b-2',
      quotationId: 'q-1',
      installmentId: 'i-2',
      orderId: 'o-1',
      batchNumber: 2,
      fromStep: 5,
      toStep: 7,
      installmentNumber: 2,
      source: BatchUnlockSource.payment,
      unlockedAt: at,
    });
  });

  it('a card settlement is the system: no actor anywhere, no lookup', async () => {
    const tx = world();
    await unlockStepBatch(tx as never, {
      batchId: 'b-2',
      source: BatchUnlockSource.payment,
      actor: null,
      paymentId: 'p-card',
    });
    const data = updateArgs(tx).data;
    expect(data).toMatchObject({ unlockedById: null, unlockedByName: null });
    expect(data.unlockedAt).toBeInstanceOf(Date);
    expect(auditData(tx)).toMatchObject({
      actorId: null,
      actorName: null,
      actorRole: null,
    });
    expect(tx.user.findUnique).not.toHaveBeenCalled();
  });

  it('an installment cancelled by a quote edit has its own source and no payment', async () => {
    const tx = world();
    await unlockStepBatch(tx as never, {
      batchId: 'b-2',
      source: BatchUnlockSource.installment_cancelled,
      actor: admin,
      // A reason is a manual-unlock field only.
      reason: 'ignored',
    });
    expect(updateArgs(tx)).toMatchObject({
      data: { unlockSource: 'installment_cancelled', unlockReason: null },
    });
    expect(auditData(tx)).not.toHaveProperty('paymentId');
    expect(auditData(tx).metadata).not.toHaveProperty('reason');
  });

  it('a manual unlock keeps the trimmed reason on the batch and in the journal', async () => {
    const tx = world();
    await unlockStepBatch(tx as never, {
      batchId: 'b-2',
      source: BatchUnlockSource.manual,
      actor: admin,
      reason: '  Accord du directeur  ',
    });
    expect(updateArgs(tx)).toMatchObject({
      data: { unlockSource: 'manual', unlockReason: 'Accord du directeur' },
    });
    expect(auditData(tx).metadata).toMatchObject({
      source: 'manual',
      reason: 'Accord du directeur',
    });
  });

  it.each([[undefined], [''], ['  ab ']])(
    'a manual unlock without a real reason (%p) is a 400 and writes nothing',
    async (reason) => {
      const tx = world();
      await expect(
        unlockStepBatch(tx as never, {
          batchId: 'b-2',
          source: BatchUnlockSource.manual,
          actor: admin,
          reason,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'UNLOCK_REASON_REQUIRED',
      });
      expect(tx.quoteStepBatch.findUnique).not.toHaveBeenCalled();
      expect(tx.quoteStepBatch.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each([[BatchStatus.unlocked], [BatchStatus.delivered], [null]])(
    'a batch that is %p (or unknown) is left alone: null, no write, no projection, no journal',
    async (status) => {
      const tx = world(status);
      await expect(
        unlockStepBatch(tx as never, {
          batchId: 'b-2',
          source: BatchUnlockSource.payment,
          actor: admin,
        }),
      ).resolves.toBeNull();
      expect(tx.quoteStepBatch.updateMany).not.toHaveBeenCalled();
      expect(project).not.toHaveBeenCalled();
      expect(tx.orderAuditLog.create).not.toHaveBeenCalled();
    },
  );

  it('a concurrent release wins the guard: null, no projection, no journal', async () => {
    const tx = world(BatchStatus.locked, { count: 0 });
    await expect(
      unlockStepBatch(tx as never, {
        batchId: 'b-2',
        source: BatchUnlockSource.payment,
        actor: admin,
      }),
    ).resolves.toBeNull();
    expect(project).not.toHaveBeenCalled();
    expect(tx.orderAuditLog.create).not.toHaveBeenCalled();
  });
});

describe('unlockStepBatches (one act releasing several batches: the quote edit)', () => {
  function several(statuses: Record<string, BatchStatus>) {
    const tx = {
      quoteStepBatch: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) => {
          const status = statuses[where.id];
          const n = Number(where.id.slice(2));
          return Promise.resolve(
            status === undefined
              ? null
              : {
                  id: where.id,
                  quotationId: 'q-1',
                  installmentId: `i-${n}`,
                  batchNumber: n,
                  fromStep: n * 4 - 3,
                  toStep: n * 4,
                  status,
                  quotation: { orderId: 'o-1' },
                  installment: { installmentNumber: n },
                },
          );
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin One' }),
      },
      orderAuditLog: { create: jest.fn().mockResolvedValue({ id: 'a-1' }) },
    };
    return tx;
  }

  it('releases every locked batch, projects ONCE after the last release, then journals each', async () => {
    const tx = several({
      'b-2': BatchStatus.locked,
      'b-3': BatchStatus.locked,
      'b-4': BatchStatus.unlocked,
    });
    const released = await unlockStepBatches(tx as never, {
      batchIds: ['b-2', 'b-3', 'b-4', 'b-9', 'b-2'],
      source: BatchUnlockSource.installment_cancelled,
      actor: admin,
      at,
    });

    expect(released.map((batch) => batch.id)).toEqual(['b-2', 'b-3']);
    expect(tx.quoteStepBatch.updateMany).toHaveBeenCalledTimes(2);
    expect(project).toHaveBeenCalledTimes(1);
    expect(project).toHaveBeenCalledWith(tx, { orderId: 'o-1', actorId: null });
    expect(project.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.quoteStepBatch.updateMany.mock.invocationCallOrder[1],
    );
    const rows = tx.orderAuditLog.create.mock.calls.map(
      (call) => (call as [{ data: Record<string, unknown> }])[0].data,
    );
    expect(
      rows.map((row) => (row.metadata as { batchId: string }).batchId),
    ).toEqual(['b-2', 'b-3']);
    expect(tx.orderAuditLog.create.mock.invocationCallOrder[0]).toBeGreaterThan(
      project.mock.invocationCallOrder[0],
    );
    // One name lookup for the whole act.
    expect(tx.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('nothing released (empty list, or nothing locked): no lookup, no projection, no journal', async () => {
    const tx = several({ 'b-4': BatchStatus.delivered });
    await expect(
      unlockStepBatches(tx as never, {
        batchIds: [],
        source: BatchUnlockSource.installment_cancelled,
        actor: admin,
      }),
    ).resolves.toEqual([]);
    await expect(
      unlockStepBatches(tx as never, {
        batchIds: ['b-4'],
        source: BatchUnlockSource.installment_cancelled,
        actor: admin,
      }),
    ).resolves.toEqual([]);
    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(tx.quoteStepBatch.updateMany).not.toHaveBeenCalled();
    expect(project).not.toHaveBeenCalled();
    expect(tx.orderAuditLog.create).not.toHaveBeenCalled();
  });
});
