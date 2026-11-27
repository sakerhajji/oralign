import { OrderStatus, OrderType, UserRole } from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import type { CreateOrderDto } from '../dto/order.dto';
import type { OrderAuditService } from './order-audit.service';
import type { WelcomeGiftService } from './welcome-gift.service';
import { OrderService } from './order.service';

jest.mock('./order-storage', () => ({
  purgeStoredMedia: jest.fn(),
  removeFileFromDisk: jest.fn(),
  purgeOrderDirectory: jest.fn(),
}));
jest.mock('./order.mapper', () => ({
  orderInclude: {},
  mapOrderToDto: (order: unknown) => order,
}));

/**
 * Doctor inactivity (spec §5): a dormant doctor gets no new order and
 * cannot submit a draft, also when an admin acts for him (403
 * ACCOUNT_DORMANT). Nothing is written when refused.
 */

const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };
const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const DORMANT_SINCE = new Date('2026-11-01T00:00:00Z');

function makeService(inactiveSince: Date | null) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ inactiveSince }]),
    dentalOrder: {
      create: jest.fn().mockResolvedValue({ id: 'o-new', doctorId: 'u-doc' }),
      update: jest.fn().mockResolvedValue({ id: 'o-1', doctorId: 'u-doc' }),
    },
    orderAuditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    ...tx,
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: 'u-doc', inactiveSince }),
    },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const applyOnSubmit = jest.fn().mockResolvedValue(false);
  const service = new OrderService(
    prisma as unknown as PrismaService,
    {} as OrderAccessPolicy,
    { emit: jest.fn() } as unknown as EventEmitter2,
    {
      entry: jest.fn().mockResolvedValue({ action: 'x' }),
    } as unknown as OrderAuditService,
    { applyOnSubmit } as unknown as WelcomeGiftService,
  );
  const internals = service as unknown as Record<string, jest.Mock>;
  jest
    .spyOn(internals, 'ensurePatientBelongsToDoctor')
    .mockResolvedValue(undefined);
  jest.spyOn(internals, 'generateOrderCode').mockResolvedValue('ORD-1');
  jest.spyOn(service, 'findAccessibleOrder').mockResolvedValue({
    id: 'o-1',
    orderCode: 'ORD-1',
    doctorId: 'u-doc',
    orderType: OrderType.initial,
    status: OrderStatus.draft,
    submittedAt: null,
    useCbctWithScans: false,
    files: [],
  } as never);
  return { service, tx, prisma, applyOnSubmit };
}

describe('OrderService — dormant doctor (ACCOUNT_DORMANT)', () => {
  it('refuses to create an order for a dormant doctor, whoever asks', async () => {
    for (const caller of [doctor, admin]) {
      const { service, tx } = makeService(DORMANT_SINCE);
      await expect(
        service.createOrder(
          { patientId: 'p-1', doctorId: 'u-doc' } as CreateOrderDto,
          caller,
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'ACCOUNT_DORMANT',
      });
      expect(tx.dentalOrder.create).not.toHaveBeenCalled();
    }
  });

  it('creates normally for an active doctor', async () => {
    const { service, tx } = makeService(null);
    await expect(
      service.createOrder({ patientId: 'p-1' } as CreateOrderDto, doctor),
    ).resolves.toMatchObject({ id: 'o-new' });
    expect(tx.dentalOrder.create).toHaveBeenCalledTimes(1);
  });

  it("refuses the submission of a dormant doctor's draft, under the row lock", async () => {
    for (const caller of [doctor, admin]) {
      const { service, tx, applyOnSubmit } = makeService(DORMANT_SINCE);
      await expect(
        service.submitOrder('o-1', { termsAccepted: true }, caller),
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'ACCOUNT_DORMANT',
      });
      const sql = (tx.$queryRaw.mock.calls[0] as unknown[])[0] as string[];
      expect(sql.join('?')).toContain('FOR KEY SHARE');
      expect(tx.dentalOrder.update).not.toHaveBeenCalled();
      expect(applyOnSubmit).not.toHaveBeenCalled();
    }
  });
});
