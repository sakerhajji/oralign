import {
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  historySourceOf,
  metadataForReader,
  OrderAuditService,
  paymentHistoryCoverage,
} from './order-audit.service';

/**
 * The order History (OrderAuditService.list, CONTRACT §2.5): the derived
 * entries are deduplicated against the rows persisted since 2026-11-27
 * (batch_unlocked, carried payment_* for P-A), every batch's unlock shows
 * (not only the delivered ones), and staff-only notes stay with staff.
 */

const dentist: Caller = { userId: 'u-doc', role: UserRole.dentist };
const designer: Caller = { userId: 'u-des', role: UserRole.designer };
const admin: Caller = { userId: 'u-admin', role: UserRole.admin };

const at = (minute: number) => new Date(Date.UTC(2026, 10, 27, 9, minute, 0));

const log = (
  id: string,
  action: string,
  over: Partial<{
    paymentId: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
  }> = {},
) => ({
  id,
  actorId: 'u-admin',
  actorName: 'Admin One',
  actorRole: UserRole.admin,
  action,
  changes: null,
  metadata: over.metadata ?? null,
  paymentId: over.paymentId ?? null,
  createdAt: over.createdAt ?? at(30),
});

const payment = (
  id: string,
  status: PaymentRecordStatus,
  over: Record<string, unknown> = {},
) => ({
  id,
  status,
  paymentMethod: PaymentMethod.bank_transfer,
  purpose: PaymentPurpose.installment,
  amount: new Prisma.Decimal('500.000'),
  currency: 'TND',
  createdAt: at(1),
  updatedAt: at(20),
  paidAt: status === PaymentRecordStatus.success ? at(10) : null,
  rejectedAt: status === PaymentRecordStatus.rejected ? at(12) : null,
  rejectionReason:
    status === PaymentRecordStatus.rejected ? 'Montant illisible' : null,
  installment: { installmentNumber: 2 },
  initiatedById: 'u-doc',
  initiatedBy: { fullName: 'Dr Salma', role: UserRole.dentist },
  confirmedById: null,
  confirmedBy: null,
  rejectedById: null,
  rejectedBy: null,
  ...over,
});

function makeService(data: {
  logs?: ReturnType<typeof log>[];
  payments?: ReturnType<typeof payment>[];
  batches?: Record<string, unknown>[];
}) {
  const findQuotation = jest.fn().mockResolvedValue(
    data.batches
      ? {
          id: 'q1',
          quotationNumber: 'DEV-1',
          status: 'approved',
          totalTtc: 1000,
          currency: 'TND',
          createdAt: at(0),
          sentAt: null,
          approvedAt: null,
          rejectedAt: null,
          rejectionReason: null,
          createdById: null,
          createdByName: null,
          createdBy: null,
          approvedById: null,
          approvedBy: null,
          rejectedById: null,
          rejectedBy: null,
          stepBatches: data.batches,
        }
      : null,
  );
  const prisma = {
    orderAuditLog: {
      findMany: jest.fn().mockResolvedValue(data.logs ?? []),
    },
    treatmentPlan: { findMany: jest.fn().mockResolvedValue([]) },
    quotation: { findFirst: findQuotation },
    payment: { findMany: jest.fn().mockResolvedValue(data.payments ?? []) },
  };
  const access = {
    requireReadable: jest.fn().mockResolvedValue(undefined),
  } as unknown as OrderAccessPolicy;
  return {
    service: new OrderAuditService(prisma as unknown as PrismaService, access),
    prisma,
    findQuotation,
  };
}

const actions = (entries: { action: string; id: string }[]) =>
  entries.map((entry) => `${entry.action}:${entry.id}`).sort();

describe('OrderAuditService.list — derived payment entries vs the persisted transfer rows', () => {
  it('a journaled transfer shows its rows only: no derived started / succeeded twin', async () => {
    const { service } = makeService({
      logs: [
        log('l1', 'payment_transfer_declared', {
          paymentId: 'p1',
          createdAt: at(1),
        }),
        log('l2', 'payment_confirmed', { paymentId: 'p1', createdAt: at(10) }),
      ],
      payments: [payment('p1', PaymentRecordStatus.success)],
    });

    const history = await service.list('o1', admin);

    expect(actions(history)).toEqual([
      'payment_confirmed:l2',
      'payment_transfer_declared:l1',
    ]);
  });

  it('a superseded declaration: the replaced row tells its cancel; the refusal row its reject', async () => {
    const { service } = makeService({
      logs: [
        log('l1', 'payment_transfer_declared', { paymentId: 'p-old' }),
        log('l2', 'payment_proof_replaced', {
          paymentId: 'p-new',
          metadata: { replacedPaymentId: 'p-old', hasProof: true },
        }),
        log('l3', 'payment_rejected', {
          paymentId: 'p-new',
          metadata: { reason: 'Montant illisible' },
        }),
      ],
      payments: [
        payment('p-old', PaymentRecordStatus.cancelled),
        payment('p-new', PaymentRecordStatus.rejected),
      ],
    });

    const history = await service.list('o1', dentist);

    expect(actions(history)).toEqual([
      'payment_proof_replaced:l2',
      'payment_rejected:l3',
      'payment_transfer_declared:l1',
    ]);
    // The doctor reads the refusal reason.
    expect(history.find((entry) => entry.id === 'l3')?.metadata).toEqual({
      reason: 'Montant illisible',
    });
  });

  it('a withdrawn declaration has no derived cancel twin; older payments keep their derived entries', async () => {
    const { service } = makeService({
      logs: [
        log('l1', 'payment_transfer_declared', { paymentId: 'p1' }),
        log('l2', 'payment_transfer_withdrawn', { paymentId: 'p1' }),
      ],
      payments: [
        payment('p1', PaymentRecordStatus.cancelled),
        // Before 2026-11-27: no persisted row, derived as before.
        payment('p0', PaymentRecordStatus.rejected),
        // A card failure has no persisted counterpart.
        payment('p-card', PaymentRecordStatus.failed, {
          paymentMethod: PaymentMethod.card,
        }),
      ],
    });

    const history = await service.list('o1', admin);

    expect(actions(history)).toEqual([
      'payment_failed:payment-terminal-p-card',
      'payment_rejected:payment-terminal-p0',
      'payment_started:payment-started-p-card',
      'payment_started:payment-started-p0',
      'payment_transfer_declared:l1',
      'payment_transfer_withdrawn:l2',
    ]);
  });

  it('paymentHistoryCoverage reads the paymentId column and the replaced id', () => {
    const coverage = paymentHistoryCoverage([
      {
        action: 'payment_proof_replaced',
        paymentId: 'n',
        metadata: { replacedPaymentId: 'o' },
      },
      { action: 'batch_unlocked', paymentId: 'n', metadata: { batchId: 'b' } },
      { action: 'payment_confirmed', paymentId: null, metadata: null },
    ]);
    expect([...coverage.started]).toEqual(['n']);
    expect(coverage.ended.get('o')?.has('payment_transfer_withdrawn')).toBe(
      true,
    );
    expect(coverage.ended.has('null')).toBe(false);
  });
});

describe('OrderAuditService.list — step batches', () => {
  const batch = (id: string, over: Record<string, unknown>) => ({
    id,
    batchNumber: 2,
    fromStep: 5,
    toStep: 7,
    unlockedAt: at(5),
    deliveredAt: null,
    deliveredById: null,
    deliveredBy: null,
    ...over,
  });

  it('reads every batch (not only delivered ones): an unlocked batch has its derived unlock', async () => {
    const { service, findQuotation } = makeService({
      batches: [batch('b2', {})],
    });

    const history = await service.list('o1', admin);

    expect(history.map((entry) => entry.id)).toContain('batch-unlocked-b2');
    const args = findQuotation.mock.calls[0] as [
      { select: { stepBatches: Record<string, unknown> } },
    ];
    expect(args[0].select.stepBatches).not.toHaveProperty('where');
  });

  it('a journaled unlock is shown once, from its row', async () => {
    const { service } = makeService({
      logs: [
        log('l1', 'batch_unlocked', {
          metadata: {
            batchId: 'b2',
            source: 'manual',
            reason: 'Accord direction',
          },
        }),
      ],
      batches: [batch('b2', {})],
    });

    const history = await service.list('o1', admin);

    expect(
      history.filter((entry) => entry.action === 'batch_unlocked'),
    ).toEqual([
      expect.objectContaining({
        id: 'l1',
        metadata: {
          batchId: 'b2',
          source: 'manual',
          reason: 'Accord direction',
        },
      }),
    ]);
  });

  it.each([dentist, designer])(
    'a $role reads the manual unlock without its internal reason, and no override note',
    async (caller) => {
      const { service } = makeService({
        logs: [
          log('l1', 'batch_unlocked', {
            metadata: {
              batchId: 'b2',
              source: 'manual',
              reason: 'Accord direction',
            },
          }),
          log('l2', 'payment_confirmed', {
            paymentId: 'p1',
            metadata: { hasProof: false, overrideNote: 'Relevé vérifié' },
          }),
        ],
      });

      const history = await service.list('o1', caller);

      expect(history.find((entry) => entry.id === 'l1')?.metadata).toEqual({
        batchId: 'b2',
        source: 'manual',
      });
      expect(history.find((entry) => entry.id === 'l2')?.metadata).toEqual({
        hasProof: false,
      });
    },
  );
});

describe('metadataForReader', () => {
  it('keeps everything for staff, and a refusal reason for everyone', () => {
    const meta = { reason: 'x', overrideNote: 'y' };
    expect(metadataForReader('batch_unlocked', meta, true)).toBe(meta);
    expect(metadataForReader('payment_rejected', meta, false)).toEqual({
      reason: 'x',
    });
    expect(metadataForReader('batch_unlocked', meta, false)).toEqual({});
    expect(metadataForReader('batch_unlocked', null, false)).toBeNull();
  });
});

describe('historySourceOf: a journaled row keeps the heading of the entry it replaces', () => {
  it.each([
    ['batch_unlocked', 'delivery'],
    ['payment_transfer_declared', 'payment'],
    ['payment_proof_replaced', 'payment'],
    ['payment_transfer_withdrawn', 'payment'],
    ['payment_review_opened', 'payment'],
    ['payment_confirmed', 'payment'],
    ['payment_rejected', 'payment'],
    ['treatment_fee_proof_uploaded', 'order'],
    ['status_changed', 'order'],
  ])('%s → %s', (action, source) => {
    expect(historySourceOf(action)).toBe(source);
  });

  it('list() shows a journaled unlock under « delivery » and a transfer row under « payment »', async () => {
    const { service } = makeService({
      logs: [
        log('l1', 'batch_unlocked', { metadata: { batchId: 'b2' } }),
        log('l2', 'payment_confirmed', { paymentId: 'p1' }),
        log('l3', 'status_changed'),
      ],
    });

    const history = await service.list('o1', admin);

    expect(
      Object.fromEntries(history.map((entry) => [entry.id, entry.source])),
    ).toEqual({ l1: 'delivery', l2: 'payment', l3: 'order' });
  });

  it('a derived (older) unlock carries its backfilled source', async () => {
    const { service } = makeService({
      batches: [
        {
          id: 'b1',
          batchNumber: 1,
          fromStep: 1,
          toStep: 4,
          unlockedAt: at(3),
          unlockSource: 'payment',
          deliveredAt: null,
          deliveredById: null,
          deliveredBy: null,
        },
      ],
    });

    const history = await service.list('o1', dentist);

    expect(history.find((entry) => entry.id === 'batch-unlocked-b1')).toEqual(
      expect.objectContaining({
        source: 'delivery',
        metadata: { batchNumber: 1, fromStep: 1, toStep: 4, source: 'payment' },
      }),
    );
  });
});
