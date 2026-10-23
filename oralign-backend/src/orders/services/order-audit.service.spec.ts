import { Prisma, UserRole } from '@prisma/client';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import type { PrismaService } from '../../prisma/prisma.service';
import { OrderAuditService } from './order-audit.service';

const caller: Caller = { userId: 'user-1', role: UserRole.dentist };

function makeService() {
  const requireReadable = jest.fn().mockResolvedValue(undefined);
  const findUser = jest.fn().mockResolvedValue({ fullName: 'Dr Test' });
  const createAuditLog = jest.fn().mockResolvedValue({ id: 'audit-1' });
  const findAuditLogs = jest.fn().mockResolvedValue([]);
  const findPlans = jest.fn().mockResolvedValue([]);
  const findQuotation = jest.fn().mockResolvedValue(null);
  const findPayments = jest.fn().mockResolvedValue([]);
  const prisma = {
    user: { findUnique: findUser },
    orderAuditLog: { create: createAuditLog, findMany: findAuditLogs },
    treatmentPlan: { findMany: findPlans },
    quotation: { findFirst: findQuotation },
    payment: { findMany: findPayments },
  } as unknown as PrismaService;
  const access = { requireReadable } as unknown as OrderAccessPolicy;

  return {
    service: new OrderAuditService(prisma, access),
    requireReadable,
    findUser,
    createAuditLog,
    findAuditLogs,
  };
}

describe('OrderAuditService', () => {
  it('snapshots the actor identity when creating an event', async () => {
    const { service, findUser } = makeService();

    await expect(
      service.entry(caller, 'updated', {
        status: { from: 'draft', to: 'submitted' },
      }),
    ).resolves.toMatchObject({
      actorId: caller.userId,
      actorName: 'Dr Test',
      actorRole: UserRole.dentist,
      action: 'updated',
    });
    expect(findUser).toHaveBeenCalledWith({
      where: { id: caller.userId },
      select: { fullName: true },
    });
  });

  it('normalizes values and only returns fields that changed', () => {
    const { service } = makeService();
    const date = new Date('2026-09-21T10:00:00.000Z');

    expect(
      service.diff(
        { status: 'draft', amount: new Prisma.Decimal(12), date },
        {
          status: 'submitted',
          amount: new Prisma.Decimal(12),
          date: new Date(date),
          ignored: undefined,
        },
      ),
    ).toEqual({ status: { from: 'draft', to: 'submitted' } });
  });

  it('checks order access and returns newest events first', async () => {
    const { service, requireReadable, findAuditLogs } = makeService();
    findAuditLogs.mockResolvedValue([
      {
        id: 'older',
        actorId: 'user-1',
        actorName: 'Dr Test',
        actorRole: UserRole.dentist,
        action: 'created',
        changes: null,
        metadata: null,
        createdAt: new Date('2026-09-20T10:00:00.000Z'),
      },
      {
        id: 'newer',
        actorId: 'admin-1',
        actorName: 'Admin Test',
        actorRole: UserRole.admin,
        action: 'status_changed',
        changes: { status: { from: 'draft', to: 'submitted' } },
        metadata: null,
        createdAt: new Date('2026-09-21T10:00:00.000Z'),
      },
    ]);

    const history = await service.list('order-1', caller);

    expect(requireReadable).toHaveBeenCalledWith('order-1', caller);
    expect(history.map((entry) => entry.id)).toEqual(['newer', 'older']);
    expect(history[0].actor).toEqual({
      id: 'admin-1',
      name: 'Admin Test',
      role: UserRole.admin,
    });
  });
});
