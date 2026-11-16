import {
  OrderStatus,
  OrderType,
  Prisma,
  SupplementalReviewStatus,
  UserRole,
} from '@prisma/client';
import type { Cache } from 'cache-manager';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import type { TreatmentChatGateway } from '../gateways/treatment-chat.gateway';
import {
  PLAN_GATE_SELECT,
  TREATMENT_PLAN_GATE_ERROR,
  type PlanGateOrder,
} from '../treatment-plan-gate';

// uuid is ESM-only and the socket gateway pulls in socket.io; neither is
// exercised by plan creation.
jest.mock('uuid', () => ({ v4: () => 'uuid-test' }), { virtual: true });
jest.mock('../gateways/treatment-chat.gateway', () => ({
  TreatmentChatGateway: class TreatmentChatGateway {},
}));

import { TreatmentPlanService } from './treatment-plan.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };

const initialCase = (over: Partial<PlanGateOrder> = {}): PlanGateOrder => ({
  orderType: OrderType.initial,
  treatmentFeePaidAt: null,
  welcomeGiftAppliedAt: null,
  supplementalRequest: null,
  ...over,
});

const child = (
  orderType: OrderType,
  reviewStatus: SupplementalReviewStatus,
): PlanGateOrder => ({
  orderType,
  treatmentFeePaidAt: null,
  welcomeGiftAppliedAt: null,
  supplementalRequest: { reviewStatus },
});

/** A tenant charging a 300 treatment fee: the gate is live. */
function makeService(gate: PlanGateOrder) {
  const prisma = {
    dentalOrder: {
      // 1st read: the gate; 2nd read: the status nudge after creation.
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
    const { service, prisma } = makeService(
      initialCase({ welcomeGiftAppliedAt: new Date('2026-11-04') }),
    );

    await expect(service.create('o-1', {}, admin)).resolves.toMatchObject({
      id: 'plan-1',
    });
    expect(prisma.dentalOrder.findUnique).toHaveBeenNthCalledWith(1, {
      where: { id: 'o-1' },
      select: PLAN_GATE_SELECT,
    });
    // The fee is irrelevant once waived — not even read.
    expect(prisma.companyBillingSettings.findFirst).not.toHaveBeenCalled();
    expect(prisma.treatmentPlan.create).toHaveBeenCalled();
  });

  it('still refuses an unpaid order without the gift', async () => {
    const { service, prisma } = makeService(initialCase());

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
    const { service, prisma } = makeService(
      initialCase({ treatmentFeePaidAt: new Date('2026-11-01') }),
    );

    await expect(service.create('o-1', {}, admin)).resolves.toMatchObject({
      id: 'plan-1',
    });
    expect(prisma.companyBillingSettings.findFirst).not.toHaveBeenCalled();
  });
});

describe('TreatmentPlanService.create — supplemental requests', () => {
  it('plans an approved refinement with the fee gate live and nothing paid', async () => {
    const { service, prisma } = makeService(
      child(OrderType.additional_aligners, SupplementalReviewStatus.approved),
    );

    await expect(service.create('o-1', {}, admin)).resolves.toMatchObject({
      id: 'plan-1',
    });
    // The initial treatment-fee gate never applies to a child.
    expect(prisma.companyBillingSettings.findFirst).not.toHaveBeenCalled();
  });

  it.each([SupplementalReviewStatus.draft, SupplementalReviewStatus.pending])(
    'refuses a refinement still %s (400, nothing created)',
    async (reviewStatus) => {
      const { service, prisma } = makeService(
        child(OrderType.additional_aligners, reviewStatus),
      );

      await expect(service.create('o-1', {}, admin)).rejects.toMatchObject({
        statusCode: 400,
        errorCode: TREATMENT_PLAN_GATE_ERROR.REQUEST_NOT_APPROVED,
      });
      expect(prisma.treatmentPlan.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    OrderType.replacement,
    OrderType.transfer_template,
    OrderType.warranty,
  ])('refuses a %s request, even approved', async (orderType) => {
    const { service, prisma } = makeService(
      child(orderType, SupplementalReviewStatus.approved),
    );

    await expect(service.create('o-1', {}, admin)).rejects.toMatchObject({
      statusCode: 400,
      errorCode: TREATMENT_PLAN_GATE_ERROR.KIND_HAS_NO_PLAN,
    });
    expect(prisma.treatmentPlan.create).not.toHaveBeenCalled();
  });
});
