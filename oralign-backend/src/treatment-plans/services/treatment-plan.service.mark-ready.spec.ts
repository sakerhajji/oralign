import { type ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { ArchTreatment, TreatmentPlanStatus, UserRole } from '@prisma/client';
import type { Cache } from 'cache-manager';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import type { TreatmentChatGateway } from '../gateways/treatment-chat.gateway';
import { UpdateTreatmentPlanDto } from '../dto/treatment-plan.dto';

// uuid is ESM-only and the socket gateway pulls in socket.io; neither is
// exercised by mark-ready.
jest.mock('uuid', () => ({ v4: () => 'uuid-test' }), { virtual: true });
jest.mock('../gateways/treatment-chat.gateway', () => ({
  TreatmentChatGateway: class TreatmentChatGateway {},
}));

import { TreatmentPlanService } from './treatment-plan.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };

/** A pending plan as markReady's second read returns it. */
const pendingPlan = (over: {
  totalUpperAligners?: number | null;
  totalLowerAligners?: number | null;
  archTreatment?: ArchTreatment | null;
  treatBothArch?: boolean;
}) => ({
  id: 'plan-1',
  status: TreatmentPlanStatus.pending,
  orderId: 'o-1',
  name: 'Treatment Plan 1',
  resultViewUrl: null,
  totalUpperAligners: over.totalUpperAligners ?? null,
  totalLowerAligners: over.totalLowerAligners ?? null,
  movementTableImagePath: null,
  movementTableImageName: null,
  movementTableImageMimeType: null,
  movementTableImageSizeBytes: null,
  dentalTreatmentTableImagePath: null,
  dentalTreatmentTableImageName: null,
  dentalTreatmentTableImageMimeType: null,
  dentalTreatmentTableImageSizeBytes: null,
  iprEntries: [],
  order: {
    archTreatment: over.archTreatment ?? ArchTreatment.both,
    treatBothArch: over.treatBothArch ?? true,
  },
});

function makeService(plan: ReturnType<typeof pendingPlan>) {
  const tx = {
    treatmentPlan: { update: jest.fn().mockResolvedValue({ id: 'plan-1' }) },
    dentalOrder: { update: jest.fn().mockResolvedValue({}) },
    treatmentMessage: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    treatmentPlan: {
      findUnique: jest
        .fn()
        // 1st read: assertCanPlan; 2nd: the plan markReady sends.
        .mockResolvedValueOnce({
          id: 'plan-1',
          orderId: 'o-1',
          deletedAt: null,
          order: { assignedDesignerId: null, deletedAt: null },
        })
        .mockResolvedValueOnce(plan),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin' }) },
    // The bell event's enrichment read: not under test.
    dentalOrder: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const service = new TreatmentPlanService(
    prisma as unknown as PrismaService,
    { assertCanPlan: jest.fn() } as unknown as OrderAccessPolicy,
    {} as Cache,
    { broadcastPlanChanged: jest.fn() } as unknown as TreatmentChatGateway,
    { emit: jest.fn() } as unknown as EventEmitter2,
  );
  return { service, prisma, tx };
}

describe('TreatmentPlanService.markReady — planned totals per treated arch (D4)', () => {
  it('sends a plan whose treated arches all have a total', async () => {
    const { service, tx } = makeService(
      pendingPlan({ totalUpperAligners: 24, totalLowerAligners: 20 }),
    );
    await service.markReady('plan-1', admin);
    expect(tx.treatmentPlan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: { status: TreatmentPlanStatus.ready },
    });
  });

  it('400 PLAN_TOTALS_REQUIRED with the missing arches, nothing written', async () => {
    const { service, prisma } = makeService(
      pendingPlan({ totalUpperAligners: 24 }),
    );
    await expect(service.markReady('plan-1', admin)).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'PLAN_TOTALS_REQUIRED',
      details: { missing: ['lower'] },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('an upper-only case needs the upper total only', async () => {
    const { service, tx } = makeService(
      pendingPlan({
        totalUpperAligners: 18,
        archTreatment: ArchTreatment.upper,
        treatBothArch: false,
      }),
    );
    await service.markReady('plan-1', admin);
    expect(tx.treatmentPlan.update).toHaveBeenCalled();
  });

  it('reads the order arches in the same call as the plan (no extra query)', async () => {
    const { service, prisma } = makeService(
      pendingPlan({ totalUpperAligners: 24, totalLowerAligners: 20 }),
    );
    await service.markReady('plan-1', admin);
    expect(prisma.treatmentPlan.findUnique).toHaveBeenCalledTimes(2);
    expect(
      (
        (prisma.treatmentPlan.findUnique.mock.calls as unknown[][])[1][0] as {
          select: { order: unknown };
        }
      ).select.order,
    ).toEqual({ select: { archTreatment: true, treatBothArch: true } });
  });
});

describe('UpdateTreatmentPlanDto — PUT treatment-plans/:id totals', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const body: ArgumentMetadata = {
    type: 'body',
    metatype: UpdateTreatmentPlanDto,
  };
  const parse = (raw: Record<string, unknown>) =>
    pipe.transform(raw, body) as Promise<UpdateTreatmentPlanDto>;

  it('accepts 1..200 per arch, and null to clear', async () => {
    await expect(
      parse({ totalUpperAligners: 1, totalLowerAligners: 200 }),
    ).resolves.toMatchObject({
      totalUpperAligners: 1,
      totalLowerAligners: 200,
    });
    await expect(parse({ totalUpperAligners: null })).resolves.toMatchObject({
      totalUpperAligners: null,
    });
  });

  it.each([
    ['0', { totalUpperAligners: 0 }],
    ['201', { totalLowerAligners: 201 }],
    ['a fraction', { totalUpperAligners: 2.5 }],
    ['text', { totalLowerAligners: 'twelve' }],
  ])('rejects %s with a 400', async (_label, raw) => {
    await expect(parse(raw)).rejects.toMatchObject({ status: 400 });
  });
});
