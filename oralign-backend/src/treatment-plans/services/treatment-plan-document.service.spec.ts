import { TreatmentPlanDocumentKind, UserRole } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import type { TreatmentChatGateway } from '../gateways/treatment-chat.gateway';
import { ForbiddenException } from '../../common/exceptions/app.exception';

// socket.io is not exercised here; the disk and the scanner are faked so
// the specs pin the service's own decisions.
jest.mock('../gateways/treatment-chat.gateway', () => ({
  TreatmentChatGateway: class TreatmentChatGateway {},
}));
jest.mock('../documents/plan-file-store', () => ({
  writePlanFile: jest.fn(),
  discardPlanFile: jest.fn(),
  releasePlanFile: jest.fn(),
  resolvePlanFile: jest.fn(),
}));
jest.mock('../../media/file-security', () => ({
  scanUploadContent: jest.fn(),
}));

import * as store from '../documents/plan-file-store';
import { scanUploadContent } from '../../media/file-security';
import { TreatmentPlanDocumentService } from './treatment-plan-document.service';
import { PLAN_DOCUMENT_MAX_BYTES } from '../documents/plan-document.rules';

const CBCT = TreatmentPlanDocumentKind.cbct_analysis;
const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const designer: Caller = { userId: 'u-designer', role: UserRole.designer };

const writePlanFile = store.writePlanFile as jest.Mock;
const discardPlanFile = store.discardPlanFile as jest.Mock;
const releasePlanFile = store.releasePlanFile as jest.Mock;
const resolvePlanFile = store.resolvePlanFile as jest.Mock;
const scan = scanUploadContent as jest.Mock;

const pdfFile = (over: Partial<Express.Multer.File> = {}) => {
  const buffer = Buffer.from(
    '%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n',
    'latin1',
  );
  return {
    originalname: 'Analyse CBCT.pdf',
    mimetype: 'application/pdf',
    size: buffer.length,
    buffer,
    ...over,
  } as Express.Multer.File;
};

const view = {
  kind: CBCT,
  fileName: 'Analyse CBCT.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 34,
  uploadedByName: 'Admin',
  createdAt: new Date('2026-11-26T08:00:00Z'),
  updatedAt: new Date('2026-11-26T08:00:00Z'),
};

function setup(
  options: {
    plan?: unknown;
    previous?: { storagePath: string } | null;
    existing?: { id: string; storagePath: string } | null;
    upsertError?: Error;
    canPlan?: boolean;
    canRead?: boolean;
    /** What the row lock finds: the plan, or nothing once soft-deleted. */
    lockedRows?: Array<{ id: string }>;
  } = {},
) {
  const tx = {
    $queryRaw: jest
      .fn()
      .mockResolvedValue(options.lockedRows ?? [{ id: 'plan-1' }]),
    treatmentPlanDocument: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.existing !== undefined
            ? options.existing
            : (options.previous ?? null),
        ),
      upsert: options.upsertError
        ? jest.fn().mockRejectedValue(options.upsertError)
        : jest.fn().mockResolvedValue(view),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const plan =
    options.plan === undefined
      ? {
          id: 'plan-1',
          orderId: 'o-1',
          deletedAt: null,
          order: {
            assignedDesignerId: 'u-designer',
            doctorId: 'u-doctor',
            deletedAt: null,
          },
          documents: [
            { storagePath: 'orders/o-1/x.pdf', fileName: 'Analyse CBCT.pdf' },
          ],
        }
      : options.plan;
  const prisma = {
    treatmentPlan: { findUnique: jest.fn().mockResolvedValue(plan) },
    treatmentPlanDocument: { findMany: jest.fn().mockResolvedValue([view]) },
    user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin' }) },
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const orderAccess = {
    assertCanPlan: jest.fn(() => {
      if (options.canPlan === false) throw new ForbiddenException('no');
    }),
    assertCanRead: jest.fn(() => {
      if (options.canRead === false) throw new ForbiddenException('no');
    }),
  };
  const gateway = { broadcastPlanChanged: jest.fn() };
  const service = new TreatmentPlanDocumentService(
    prisma as unknown as PrismaService,
    orderAccess as unknown as OrderAccessPolicy,
    gateway as unknown as TreatmentChatGateway,
  );
  return { service, prisma, tx, orderAccess, gateway };
}

beforeEach(() => {
  jest.clearAllMocks();
  writePlanFile.mockResolvedValue(
    'orders/o-1/treatment-plans/plan-1/documents/new.pdf',
  );
  discardPlanFile.mockResolvedValue(undefined);
  releasePlanFile.mockResolvedValue(undefined);
  scan.mockResolvedValue({ safe: true });
});

describe('TreatmentPlanDocumentService.upload', () => {
  it('stores a first PDF under the plan folder and answers its public view', async () => {
    const { service, tx, gateway } = setup();
    await expect(
      service.upload('plan-1', CBCT, pdfFile(), admin),
    ).resolves.toBe(view);

    expect(writePlanFile).toHaveBeenCalledWith(
      ['orders', 'o-1', 'treatment-plans', 'plan-1', 'documents'],
      '.pdf',
      expect.any(Buffer),
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1); // plan row lock
    const [[upsert]] = tx.treatmentPlanDocument.upsert.mock.calls as Array<
      [
        {
          where: unknown;
          create: Record<string, unknown>;
          select: Record<string, unknown>;
        },
      ]
    >;
    expect(upsert.where).toEqual({
      treatmentPlanId_kind: { treatmentPlanId: 'plan-1', kind: CBCT },
    });
    expect(upsert.create).toMatchObject({
      treatmentPlanId: 'plan-1',
      kind: CBCT,
      storagePath: 'orders/o-1/treatment-plans/plan-1/documents/new.pdf',
      fileName: 'Analyse CBCT.pdf',
      mimeType: 'application/pdf',
      uploadedById: 'u-admin',
      uploadedByName: 'Admin',
    });
    // The storage path never leaves the server.
    expect(upsert.select).not.toHaveProperty('storagePath');
    expect(releasePlanFile).not.toHaveBeenCalled();
    expect(gateway.broadcastPlanChanged).toHaveBeenCalledWith('o-1', {
      type: 'updated',
      planId: 'plan-1',
    });
  });

  it('a replace releases the superseded file after the write', async () => {
    const { service } = setup({
      previous: { storagePath: 'orders/o-1/old.pdf' },
    });
    await service.upload('plan-1', CBCT, pdfFile(), admin);
    expect(releasePlanFile).toHaveBeenCalledWith(
      expect.anything(),
      'orders/o-1/old.pdf',
      expect.any(Function),
    );
  });

  it('a failed write removes the new file and keeps the old one', async () => {
    const { service } = setup({
      previous: { storagePath: 'orders/o-1/old.pdf' },
      upsertError: new Error('db down'),
    });
    await expect(
      service.upload('plan-1', CBCT, pdfFile(), admin),
    ).rejects.toThrow('db down');
    expect(discardPlanFile).toHaveBeenCalledWith(
      'orders/o-1/treatment-plans/plan-1/documents/new.pdf',
    );
    expect(releasePlanFile).not.toHaveBeenCalled();
  });

  it.each([
    ['no file', undefined, 'DOCUMENT_FILE_REQUIRED'],
    ['an empty file', pdfFile({ size: 0 }), 'DOCUMENT_FILE_REQUIRED'],
    [
      'an oversized file',
      pdfFile({ size: PLAN_DOCUMENT_MAX_BYTES + 1 }),
      'DOCUMENT_TOO_LARGE',
    ],
    [
      'a PNG',
      pdfFile({ originalname: 'a.png', mimetype: 'image/png' }),
      'DOCUMENT_NOT_PDF',
    ],
    [
      'a scripted PDF',
      pdfFile({
        buffer: Buffer.from('%PDF-1.4 << /S /JavaScript >>', 'latin1'),
      }),
      'DOCUMENT_ACTIVE_CONTENT',
    ],
  ])('400 on %s, nothing stored', async (_label, file, errorCode) => {
    const { service, prisma } = setup();
    await expect(
      service.upload('plan-1', CBCT, file, admin),
    ).rejects.toMatchObject({ statusCode: 400, errorCode });
    expect(writePlanFile).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('400 DOCUMENT_UNSAFE when the shared scanner refuses the bytes', async () => {
    scan.mockResolvedValue({ safe: false, code: 'executable' });
    const { service } = setup();
    await expect(
      service.upload('plan-1', CBCT, pdfFile(), admin),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'DOCUMENT_UNSAFE',
    });
    expect(scan).toHaveBeenCalledWith(
      expect.objectContaining({ originalname: 'document.pdf' }),
    );
    expect(writePlanFile).not.toHaveBeenCalled();
  });

  it('404 when the plan is deleted between the check and the lock; the new file is removed', async () => {
    const { service, tx } = setup({ lockedRows: [] });
    await expect(
      service.upload('plan-1', CBCT, pdfFile(), admin),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(tx.treatmentPlanDocument.upsert).not.toHaveBeenCalled();
    expect(discardPlanFile).toHaveBeenCalledWith(
      'orders/o-1/treatment-plans/plan-1/documents/new.pdf',
    );
  });

  it('404 on a deleted plan, 403 off the planner rule, before any check of the bytes', async () => {
    const deleted = setup({
      plan: {
        id: 'plan-1',
        orderId: 'o-1',
        deletedAt: new Date(),
        order: { deletedAt: null },
      },
    });
    await expect(
      deleted.service.upload('plan-1', CBCT, pdfFile(), admin),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    const refused = setup({ canPlan: false });
    await expect(
      refused.service.upload('plan-1', CBCT, pdfFile(), designer),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(scan).not.toHaveBeenCalled();
    expect(writePlanFile).not.toHaveBeenCalled();
  });
});

describe('TreatmentPlanDocumentService.remove', () => {
  it('deletes the slot under the plan lock, then releases its file', async () => {
    const { service, tx, gateway } = setup({
      existing: { id: 'doc-1', storagePath: 'orders/o-1/x.pdf' },
    });
    await service.remove('plan-1', CBCT, admin);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.treatmentPlanDocument.delete).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
    });
    expect(releasePlanFile).toHaveBeenCalledWith(
      expect.anything(),
      'orders/o-1/x.pdf',
      expect.any(Function),
    );
    expect(gateway.broadcastPlanChanged).toHaveBeenCalled();
  });

  it('is idempotent on an empty slot (no delete, no release, no broadcast)', async () => {
    const { service, tx, gateway } = setup({ existing: null });
    await expect(
      service.remove('plan-1', CBCT, admin),
    ).resolves.toBeUndefined();
    expect(tx.treatmentPlanDocument.delete).not.toHaveBeenCalled();
    expect(releasePlanFile).not.toHaveBeenCalled();
    expect(gateway.broadcastPlanChanged).not.toHaveBeenCalled();
  });

  it('403 off the planner rule, nothing touched', async () => {
    const { service, prisma } = setup({ canPlan: false });
    await expect(
      service.remove('plan-1', CBCT, designer),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('TreatmentPlanDocumentService.open', () => {
  it('resolves the stored file of a readable plan in one query', async () => {
    resolvePlanFile.mockResolvedValue({
      absPath: '/app/uploads/orders/o-1/x.pdf',
      size: 34,
    });
    const { service, prisma, orderAccess } = setup();
    await expect(service.open('plan-1', CBCT, admin)).resolves.toEqual({
      absPath: '/app/uploads/orders/o-1/x.pdf',
      size: 34,
      fileName: 'Analyse CBCT.pdf',
    });
    expect(prisma.treatmentPlan.findUnique).toHaveBeenCalledTimes(1);
    expect(orderAccess.assertCanRead).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorId: 'u-doctor',
        assignedDesignerId: 'u-designer',
      }),
      admin,
    );
  });

  it('404 DOCUMENT_NOT_FOUND on an empty slot', async () => {
    const { service } = setup({
      plan: {
        deletedAt: null,
        order: {
          doctorId: 'u-doctor',
          assignedDesignerId: null,
          deletedAt: null,
        },
        documents: [],
      },
    });
    await expect(service.open('plan-1', CBCT, admin)).rejects.toMatchObject({
      statusCode: 404,
      errorCode: 'DOCUMENT_NOT_FOUND',
    });
  });

  it('403 for a caller who may not read the order', async () => {
    const { service } = setup({ canRead: false });
    await expect(
      service.open('plan-1', CBCT, {
        userId: 'u-other',
        role: UserRole.dentist,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(resolvePlanFile).not.toHaveBeenCalled();
  });

  it('404 for a plan of a deleted order', async () => {
    const { service } = setup({
      plan: {
        deletedAt: null,
        order: {
          doctorId: 'u-doctor',
          assignedDesignerId: null,
          deletedAt: new Date(),
        },
        documents: [],
      },
    });
    await expect(service.open('plan-1', CBCT, admin)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
