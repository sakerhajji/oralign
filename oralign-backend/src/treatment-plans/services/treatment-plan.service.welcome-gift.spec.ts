import { OrderStatus, Prisma, UserRole } from '@prisma/client';
import type { Cache } from 'cache-manager';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import type { TreatmentChatGateway } from '../gateways/treatment-chat.gateway';

// uuid is ESM-only and the socket gateway pulls in socket.io; neither is
// exercised by plan creation.
jest.mock('uuid', () => ({ v4: () => 'uuid-test' }), { virtual: true });
jest.mock('../gateways/treatment-chat.gateway', () => ({
  TreatmentChatGateway: class TreatmentChatGateway {},
}));

import { TreatmentPlanService } from './treatment-plan.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };

function makeService(gate: {
  treatmentFeePaidAt: Date | null;
  welcomeGiftAppliedAt: Date | null;
}) {
  const prisma = {
    dentalOrder: {
      // 1st read: the fee gate; 2nd read: the status nudge after creation.
      findUnique: jest
        .fn()
        .mockResolvedValueOnce(gate)
        .mockResolvedValueOnce({ status: OrderStatus.submitted }),
      update: jest.fn().mockResolvedValue({}),
    },
    companyBillingSettings: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ defaultTreatmentFee: new Prisma.Decimal(300) }),
    },
    treatmentPlan: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'plan-1', version: 1 }),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin' }) },
  };
  const service = new TreatmentPlanService(
    prisma as unknown as PrismaService,
    {
      requireReadable: jest.fn().mockResolvedValue({ id: 'o-1' }),
    } as unknown as OrderAccessPolicy,
    {} as Cache,
    { broadcastPlanChanged: jest.fn() } as unknown as TreatmentChatGateway,
    { emit: jest.fn() } as unknown as EventEmitter2,
  );
  return { service, prisma };
}

describe('TreatmentPlanService.create — treatment-fee gate', () => {
  it('is satisfied by the welcome gift: no payment needed', async () => {
    const { service, prisma } = makeService({
      treatmentFeePaidAt: null,
      welcomeGiftAppliedAt: new Date('2026-11-04'),
    });

    await expect(service.create('o-1', {}, admin)).resolves.toMatchObject({
      id: 'plan-1',
    });
    const gateRead = (
      prisma.dentalOrder.findUnique.mock.calls as unknown[][]
    )[0][0];
    expect(gateRead).toEqual({
      where: { id: 'o-1' },
      select: { treatmentFeePaidAt: true, welcomeGiftAppliedAt: true },
    });
    // The fee is irrelevant once waived — not even read.
    expect(prisma.companyBillingSettings.findFirst).not.toHaveBeenCalled();
    expect(prisma.treatmentPlan.create).toHaveBeenCalled();
  });

  it('still refuses an unpaid order without the gift', async () => {
    const { service, prisma } = makeService({
      treatmentFeePaidAt: null,
      welcomeGiftAppliedAt: null,
    });

    await expect(service.create('o-1', {}, admin)).rejects.toMatchObject({
      statusCode: 400,
    });
    // Active settings row, newest first — like every other settings read.
    expect(prisma.companyBillingSettings.findFirst).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: { defaultTreatmentFee: true },
    });
    expect(prisma.treatmentPlan.create).not.toHaveBeenCalled();
  });

  it('lets a paid order through as before', async () => {
    const { service, prisma } = makeService({
      treatmentFeePaidAt: new Date('2026-11-01'),
      welcomeGiftAppliedAt: null,
    });

    await expect(service.create('o-1', {}, admin)).resolves.toMatchObject({
      id: 'plan-1',
    });
    expect(prisma.companyBillingSettings.findFirst).not.toHaveBeenCalled();
  });
});
