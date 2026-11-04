import { OrderStatus, UserRole } from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import type { UpdateOrderDto } from '../dto/order.dto';
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

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const doctor: Caller = { userId: 'u-doc-p', role: UserRole.dentist };

const submitted = {
  id: 'o-1',
  doctorId: 'u-doc-p',
  patientId: 'p-1',
  status: OrderStatus.submitted,
  treatmentFeePaidAt: null,
  cbctFeeAmount: null,
  welcomeGiftAppliedAt: null as Date | null,
};

function makeService(current: typeof submitted) {
  const tx = {
    dentalOrder: {
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: object }) =>
          Promise.resolve({ ...current, ...where, ...data }),
      ),
    },
    orderAuditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const service = new OrderService(
    prisma as unknown as PrismaService,
    {} as OrderAccessPolicy,
    { emit: jest.fn() } as unknown as EventEmitter2,
    {
      diff: jest.fn().mockReturnValue({}),
      entry: jest.fn().mockResolvedValue({ action: 'updated' }),
    } as unknown as OrderAuditService,
    {} as WelcomeGiftService,
  );
  jest
    .spyOn(service, 'findAccessibleOrder')
    .mockResolvedValue(current as never);
  // The checks that need a database are not what is under test.
  const internals = service as unknown as Record<string, jest.Mock>;
  jest.spyOn(internals, 'ensureDentistExists').mockResolvedValue(undefined);
  jest
    .spyOn(internals, 'ensurePatientBelongsToDoctor')
    .mockResolvedValue(undefined);
  return { service, prisma, tx };
}

const gifted = { ...submitted, welcomeGiftAppliedAt: new Date('2026-11-01') };
const moveTo = (doctorId: string) => ({ doctorId }) as UpdateOrderDto;

describe('OrderService.updateOrder — welcome-gift order reassignment', () => {
  it('refuses to move a gift order to another doctor (400, nothing written)', async () => {
    const { service, prisma } = makeService(gifted);

    await expect(
      service.updateOrder('o-1', moveTo('u-doc-q'), admin),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'WELCOME_GIFT_ORDER_REASSIGN',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('still lets an admin edit a gift order that keeps its doctor', async () => {
    const { service, tx } = makeService(gifted);

    await service.updateOrder('o-1', moveTo('u-doc-p'), admin);

    expect(tx.dentalOrder.update).toHaveBeenCalledTimes(1);
    const [{ where, data }] = tx.dentalOrder.update.mock.calls[0];
    expect(where).toEqual({ id: 'o-1' });
    expect(data).toMatchObject({ doctorId: 'u-doc-p' });
  });

  it('moves an order without a gift as before', async () => {
    const { service, tx } = makeService(submitted);

    await service.updateOrder('o-1', moveTo('u-doc-q'), admin);

    expect(tx.dentalOrder.update).toHaveBeenCalledTimes(1);
    expect(tx.dentalOrder.update.mock.calls[0][0].data).toMatchObject({
      doctorId: 'u-doc-q',
    });
  });

  it("ignores a dentist's doctorId: their own gift order stays editable", async () => {
    const { service, tx } = makeService(gifted);

    await service.updateOrder('o-1', moveTo('u-doc-q'), doctor);

    expect(tx.dentalOrder.update).toHaveBeenCalledTimes(1);
    expect(tx.dentalOrder.update.mock.calls[0][0].data).not.toHaveProperty(
      'doctorId',
    );
  });
});
