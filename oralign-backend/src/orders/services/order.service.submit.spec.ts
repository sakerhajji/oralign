import { OrderStatus, UserRole } from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import type { OrderAuditService } from './order-audit.service';
import type { WelcomeGiftService } from './welcome-gift.service';
import { OrderService } from './order.service';

jest.mock('./order-storage', () => ({
  purgeStoredMedia: jest.fn(),
  removeFileFromDisk: jest.fn(),
  purgeOrderDirectory: jest.fn(),
}));
// The mapper needs every relation of a real row; identity is enough here.
jest.mock('./order.mapper', () => ({
  orderInclude: {},
  mapOrderToDto: (order: unknown) => order,
}));

const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };
const admin: Caller = { userId: 'u-admin', role: UserRole.admin };

const draft = {
  id: 'o-1',
  orderCode: 'ORD-1',
  doctorId: 'u-doc',
  status: OrderStatus.draft,
  submittedAt: null,
  useCbctWithScans: false,
  files: [],
  doctor: { fullName: 'Dr Test' },
  patient: { fullName: 'Patient' },
};

function makeService(gifted: boolean) {
  const updated = { ...draft, status: OrderStatus.submitted, tag: 'updated' };
  const reread = { ...updated, tag: 'reread' };
  const tx = {
    dentalOrder: {
      update: jest.fn().mockResolvedValue(updated),
      findUniqueOrThrow: jest.fn().mockResolvedValue(reread),
    },
    orderAuditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const applyOnSubmit = jest.fn().mockResolvedValue(gifted);
  const service = new OrderService(
    prisma as unknown as PrismaService,
    {} as OrderAccessPolicy,
    { emit: jest.fn() } as unknown as EventEmitter2,
    {
      entry: jest.fn().mockResolvedValue({ action: 'submitted' }),
    } as unknown as OrderAuditService,
    { applyOnSubmit } as unknown as WelcomeGiftService,
  );
  jest.spyOn(service, 'findAccessibleOrder').mockResolvedValue(draft as never);
  return { service, tx, applyOnSubmit };
}

describe('OrderService.submitOrder — welcome gift wiring', () => {
  it('decides the gift inside the submit transaction, after the status update', async () => {
    const { service, tx, applyOnSubmit } = makeService(true);

    const result = await service.submitOrder(
      'o-1',
      { termsAccepted: true },
      doctor,
    );

    expect(applyOnSubmit).toHaveBeenCalledWith(tx, 'o-1', 'u-doc', doctor);
    expect(tx.dentalOrder.update.mock.invocationCallOrder[0]).toBeLessThan(
      applyOnSubmit.mock.invocationCallOrder[0],
    );
    // The gift columns are written after `updated` was read: re-read.
    expect(tx.dentalOrder.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'o-1' } }),
    );
    expect(result).toMatchObject({ tag: 'reread' });
  });

  it('returns the updated row as-is when no gift was applied', async () => {
    const { service, tx } = makeService(false);

    const result = await service.submitOrder(
      'o-1',
      { termsAccepted: true },
      doctor,
    );

    expect(tx.dentalOrder.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(result).toMatchObject({ tag: 'updated' });
  });

  it("keys the gift on the ORDER's doctor when an admin submits", async () => {
    const { service, tx, applyOnSubmit } = makeService(true);

    await service.submitOrder('o-1', { termsAccepted: true }, admin);

    expect(applyOnSubmit).toHaveBeenCalledWith(tx, 'o-1', 'u-doc', admin);
  });

  it('never reaches the gift when the submission itself is refused', async () => {
    const { service, applyOnSubmit } = makeService(true);

    await expect(
      service.submitOrder('o-1', { termsAccepted: false }, doctor),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(applyOnSubmit).not.toHaveBeenCalled();
  });
});
