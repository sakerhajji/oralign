// The default import is the real `fs` module object (esModuleInterop), the
// one the services' namespace imports read through: spying on it works.
import fs from 'fs';
import { StreamableFile } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Readable } from 'stream';
import type { Caller } from '../common/access/caller';
import { OrderAccessPolicy } from '../common/access/order-access.policy';
import type { PrismaService } from '../prisma/prisma.service';
import { ProductionFileVariant } from './dto';

// The streaming itself is the order and plan modules' (their own specs):
// here only the access, the lookups and the NAMES matter.
const mockOpenOrderFileStream = jest.fn();
const mockOpenAttachmentStream = jest.fn();
jest.mock('../orders/services/order-files.service', () => ({
  openOrderFileStream: (...args: unknown[]) =>
    mockOpenOrderFileStream(...args) as unknown,
}));
// uuid ships as ESM only: the real order-files module (requireActual below) imports it.
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));
jest.mock('../treatment-plans/services/treatment-message.service', () => ({
  openAttachmentStream: (...args: unknown[]) =>
    mockOpenAttachmentStream(...args) as unknown,
}));

import { ProductionFilesService } from './production-files.service';
import { ProductionOrderGate } from './production-order-gate';

const technician: Caller = { userId: 'u-tech', role: UserRole.technician };

/** The first argument of a mock's first call. */
const firstArg = (fn: jest.Mock): unknown =>
  (fn.mock.calls as unknown[][])[0][0];
const STORED =
  'orders/o1/front_photo/Dr-Salma_Ines-Ben-Ali_front-photo_003.JPG';

function makeService(order: unknown) {
  const prisma = {
    dentalOrder: {
      findFirst: jest.fn().mockResolvedValue(order),
      findUnique: jest.fn().mockResolvedValue({ deletedAt: null }),
    },
    treatmentMessageAttachment: { findFirst: jest.fn() },
  };
  const asPrisma = prisma as unknown as PrismaService;
  const service = new ProductionFilesService(
    asPrisma,
    new ProductionOrderGate(asPrisma, new OrderAccessPolicy(asPrisma)),
  );
  return { service, prisma };
}

const stream = () => new StreamableFile(Readable.from(['x']));
const file = {
  category: 'front_photo',
  orderIndex: 3,
  relativePath: STORED,
  mimeType: 'image/jpeg',
  variants: {},
};

beforeEach(() => {
  mockOpenOrderFileStream.mockReset();
  mockOpenAttachmentStream.mockReset();
});

describe('ProductionFilesService', () => {
  it('an original downloads as an attachment named <category>-<NNN><ext>, one call', async () => {
    const { service, prisma } = makeService({ id: 'o1', files: [file] });
    mockOpenOrderFileStream.mockReturnValue({
      openStream: stream,
      inline: false,
      contentType: 'application/octet-stream',
      storedPath: STORED,
      servedVariant: null,
    });

    const sent = await service.orderFile('o1', 'f1', technician);

    expect(prisma.dentalOrder.findFirst).toHaveBeenCalledTimes(1);
    expect(sent.disposition).toBe(
      `attachment; filename="front-photo-003.jpg"; filename*=UTF-8''front-photo-003.jpg`,
    );
    expect(sent.disposition).not.toMatch(/Salma|Ines/);
    expect(sent.cacheControl).toBeNull();
  });

  it('a variant is inline, named after it, cached a day', async () => {
    const { service } = makeService({ id: 'o1', files: [file] });
    mockOpenOrderFileStream.mockReturnValue({
      openStream: stream,
      inline: true,
      contentType: 'image/webp',
      storedPath:
        'orders/o1/front_photo/Dr-Salma_Ines-Ben-Ali_front-photo_003__md.webp',
      servedVariant: 'md',
    });

    const sent = await service.orderFile(
      'o1',
      'f1',
      technician,
      ProductionFileVariant.md,
    );

    expect(mockOpenOrderFileStream).toHaveBeenCalledWith(file, 'md');
    expect(sent).toMatchObject({
      contentType: 'image/webp',
      disposition: 'inline; filename="front-photo-003-md.webp"',
      cacheControl: 'private, max-age=86400',
    });
  });

  it('404 for a file of another order (or deleted): it is not in the scoped query', async () => {
    const { service } = makeService({ id: 'o1', files: [] });
    await expect(
      service.orderFile('o1', 'f9', technician),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(mockOpenOrderFileStream).not.toHaveBeenCalled();
  });

  it('a plan attachment must belong to the LATEST approved plan, in a deliverable category', async () => {
    const { service, prisma } = makeService({
      id: 'o1',
      treatmentPlans: [{ id: 'tp2' }],
    });
    prisma.treatmentMessageAttachment.findFirst.mockResolvedValue({
      fileName: 'result.stl',
      filePath: 'orders/o1/treatment-plans/tp2/results/result.stl',
      mimeType: 'model/stl',
      variants: null,
    });
    mockOpenAttachmentStream.mockReturnValue({
      stream: Readable.from(['x']),
      fileName: 'result.stl',
      mimeType: 'model/stl',
      inline: false,
    });

    const sent = await service.planAttachment('o1', 'att1', technician);

    const { where } = firstArg(prisma.treatmentMessageAttachment.findFirst) as {
      where: Record<string, unknown>;
    };
    expect(where).toEqual({
      id: 'att1',
      deletedAt: null,
      category: { in: ['treatment_result', 'treatment_file', 'container'] },
      message: { treatmentPlanId: 'tp2', deletedAt: null },
    });
    expect(sent.disposition).toContain('attachment; filename="result.stl"');
  });

  it('404 without an approved plan, without reading attachments', async () => {
    const { service, prisma } = makeService({ id: 'o1', treatmentPlans: [] });
    await expect(
      service.planAttachment('o1', 'att1', technician),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.treatmentMessageAttachment.findFirst).not.toHaveBeenCalled();
  });

  describe('an uploader-declared type is echoed only when inline-safe', () => {
    beforeEach(() => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest
        .spyOn(fs, 'createReadStream')
        .mockImplementation(
          () => Readable.from(['x']) as unknown as fs.ReadStream,
        );
    });
    afterEach(() => jest.restoreAllMocks());

    it('an SVG photo asked as ?variant=md (no variant built) leaves as an octet-stream attachment', async () => {
      // The REAL stream opener: the fallback rule lives there.
      const actual = jest.requireActual<
        typeof import('../orders/services/order-files.service')
      >('../orders/services/order-files.service');
      mockOpenOrderFileStream.mockImplementation(actual.openOrderFileStream);
      const svg = { ...file, mimeType: 'image/svg+xml', variants: {} };
      const { service } = makeService({ id: 'o1', files: [svg] });

      const sent = await service.orderFile(
        'o1',
        'f1',
        technician,
        ProductionFileVariant.md,
      );

      expect(sent.contentType).toBe('application/octet-stream');
      expect(sent.disposition).toMatch(/^attachment; /);
      expect(sent.cacheControl).toBeNull();
    });

    const plan = (mimeType: string | null) => ({
      id: 'o1',
      treatmentPlans: [
        {
          movementTableImagePath: 'treatment-plans/tp2/movement.png',
          movementTableImageMimeType: mimeType,
          dentalTreatmentTableImagePath: null,
          dentalTreatmentTableImageMimeType: null,
        },
      ],
    });

    it('a raster table image is inline under its own type', async () => {
      const { service } = makeService(plan('image/png'));
      await expect(
        service.planImage('o1', 'movement', technician),
      ).resolves.toMatchObject({
        contentType: 'image/png',
        disposition: 'inline; filename="movement-table.png"',
      });
    });

    it.each(['image/svg+xml', 'text/html', null])(
      'a table image declared %p is an octet-stream attachment',
      async (mimeType) => {
        const { service } = makeService(plan(mimeType));
        const sent = await service.planImage('o1', 'movement', technician);
        expect(sent.contentType).toBe('application/octet-stream');
        expect(sent.disposition).toMatch(
          /^attachment; filename="movement-table\.png"/,
        );
      },
    );

    it('a plan attachment declared image/svg+xml is sent as application/octet-stream', async () => {
      const { service, prisma } = makeService({
        id: 'o1',
        treatmentPlans: [{ id: 'tp2' }],
      });
      prisma.treatmentMessageAttachment.findFirst.mockResolvedValue({
        fileName: 'result.svg',
        filePath: 'orders/o1/treatment-plans/tp2/results/result.svg',
        mimeType: 'image/svg+xml',
        variants: null,
      });
      mockOpenAttachmentStream.mockReturnValue({
        stream: Readable.from(['x']),
        fileName: 'result.svg',
        mimeType: 'image/svg+xml',
        inline: false,
      });

      const sent = await service.planAttachment('o1', 'att1', technician);

      expect(sent.contentType).toBe('application/octet-stream');
      expect(sent.disposition).toContain('attachment; filename="result.svg"');
    });
  });

  it('404 when the approved plan has no such table image', async () => {
    const { service } = makeService({
      id: 'o1',
      treatmentPlans: [
        {
          movementTableImagePath: null,
          movementTableImageMimeType: null,
          dentalTreatmentTableImagePath: null,
          dentalTreatmentTableImageMimeType: null,
        },
      ],
    });
    await expect(
      service.planImage('o1', 'movement', technician),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
