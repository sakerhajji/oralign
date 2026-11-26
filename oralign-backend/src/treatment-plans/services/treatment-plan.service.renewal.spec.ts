import {
  ArchTreatment,
  TreatmentPlanDocumentKind,
  TreatmentPlanStatus,
  UserRole,
} from '@prisma/client';
import type { Cache } from 'cache-manager';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import type { TreatmentChatGateway } from '../gateways/treatment-chat.gateway';

jest.mock('uuid', () => ({ v4: () => 'uuid-test' }), { virtual: true });
jest.mock('../gateways/treatment-chat.gateway', () => ({
  TreatmentChatGateway: class TreatmentChatGateway {},
}));
jest.mock('../documents/plan-file-store', () => ({
  releasePlanFile: jest.fn().mockResolvedValue(undefined),
}));

import { releasePlanFile } from '../documents/plan-file-store';
import { TreatmentPlanService } from './treatment-plan.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };

const documents = [
  {
    kind: TreatmentPlanDocumentKind.cbct_analysis,
    storagePath: 'orders/o-1/treatment-plans/plan-1/documents/a.pdf',
    fileName: 'Analyse CBCT.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1200,
    uploadedById: 'u-designer',
    uploadedByName: 'Designer',
  },
  {
    kind: TreatmentPlanDocumentKind.cephalometric_analysis,
    storagePath: 'orders/o-1/treatment-plans/plan-1/documents/b.pdf',
    fileName: 'Ceph.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 900,
    uploadedById: null,
    uploadedByName: null,
  },
];

function makeRenewal(rows: typeof documents) {
  const calls: string[] = [];
  const tx = {
    $queryRaw: jest.fn(() => {
      calls.push('lock');
      return Promise.resolve([]);
    }),
    treatmentPlanDocument: {
      findMany: jest.fn(() => {
        calls.push('read documents');
        return Promise.resolve(rows);
      }),
      createMany: jest.fn().mockResolvedValue({ count: rows.length }),
    },
    treatmentPlan: { create: jest.fn().mockResolvedValue({ id: 'plan-2' }) },
    treatmentPlanIpr: { createMany: jest.fn() },
    dentalOrder: { update: jest.fn().mockResolvedValue({}) },
    treatmentMessage: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    treatmentPlan: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'plan-1',
          orderId: 'o-1',
          deletedAt: null,
          order: { assignedDesignerId: null, deletedAt: null },
        })
        .mockResolvedValueOnce({
          id: 'plan-1',
          status: TreatmentPlanStatus.rejected,
          orderId: 'o-1',
          name: 'Treatment Plan 1',
          resultViewUrl: null,
          totalUpperAligners: 20,
          totalLowerAligners: 20,
          movementTableImagePath: null,
          movementTableImageName: null,
          movementTableImageMimeType: null,
          movementTableImageSizeBytes: null,
          dentalTreatmentTableImagePath: null,
          dentalTreatmentTableImageName: null,
          dentalTreatmentTableImageMimeType: null,
          dentalTreatmentTableImageSizeBytes: null,
          iprEntries: [],
          order: { archTreatment: ArchTreatment.both, treatBothArch: true },
        }),
      findFirst: jest.fn().mockResolvedValue({ version: 1 }),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin' }) },
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const service = new TreatmentPlanService(
    prisma as unknown as PrismaService,
    { assertCanPlan: jest.fn() } as unknown as OrderAccessPolicy,
    {} as Cache,
    { broadcastPlanChanged: jest.fn() } as unknown as TreatmentChatGateway,
    { emit: jest.fn() } as unknown as EventEmitter2,
  );
  return { service, tx, calls };
}

describe('TreatmentPlanService.markReady — renewal keeps the analyses', () => {
  it('copies both analysis rows to the new version, sharing the files', async () => {
    const { service, tx } = makeRenewal(documents);
    await expect(service.markReady('plan-1', admin)).resolves.toEqual({
      id: 'plan-2',
    });
    expect(tx.treatmentPlanDocument.createMany).toHaveBeenCalledWith({
      data: documents.map((document) => ({
        ...document,
        treatmentPlanId: 'plan-2',
      })),
    });
    // No bytes are copied and nothing is released by a renewal.
    expect(releasePlanFile).not.toHaveBeenCalled();
  });

  it('reads the analyses under the plan row lock', async () => {
    const { service, calls } = makeRenewal(documents);
    await service.markReady('plan-1', admin);
    expect(calls).toEqual(['lock', 'read documents']);
  });

  it('a plan without analyses renews without a document write', async () => {
    const { service, tx } = makeRenewal([]);
    await service.markReady('plan-1', admin);
    expect(tx.treatmentPlanDocument.createMany).not.toHaveBeenCalled();
  });
});
