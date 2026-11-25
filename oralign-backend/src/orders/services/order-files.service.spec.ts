// uuid ships as ESM only; the collision salt is never reached here.
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));

// The default import is the real `fs` module object (esModuleInterop), the
// one the service's namespace import reads through: spying on it works.
import fs from 'fs';
import { Readable } from 'stream';
import {
  MediaProcessingStatus,
  OrderFileCategory,
  UserRole,
} from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import type { MediaProcessingService } from '../../media/media-processing.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderAuditService } from './order-audit.service';
import type { OrderWithRelations } from './order.mapper';
import type { OrderService } from './order.service';
import { OrderFilesService, openOrderFileStream } from './order-files.service';

const STORED = 'orders/o1/image/Dr-X_Patient_image_001';

let exists: jest.SpyInstance;
let createReadStream: jest.SpyInstance;
beforeEach(() => {
  exists = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
  createReadStream = jest
    .spyOn(fs, 'createReadStream')
    .mockImplementation(() => Readable.from(['x']) as unknown as fs.ReadStream);
});
afterEach(() => jest.restoreAllMocks());

const original = (mimeType: string, variants: unknown = {}) => ({
  relativePath: STORED,
  mimeType,
  variants: variants as never,
});

describe('openOrderFileStream: the type an original is served with', () => {
  it('a variant request on an SVG original falls back to an octet-stream attachment', () => {
    const opened = openOrderFileStream(original('image/svg+xml'), 'md');
    expect(opened).toMatchObject({
      contentType: 'application/octet-stream',
      inline: false,
      servedVariant: null,
      storedPath: STORED,
    });
  });

  it.each([
    'text/html',
    'text/html; charset=utf-8',
    'application/xhtml+xml',
    'text/xml',
    'application/xml',
    'image/heic',
    'application/pdf',
    'video/mp4',
    '',
  ])('a declared %p is never echoed back on the inline fallback', (mime) => {
    const opened = openOrderFileStream(original(mime), 'thumb');
    expect(opened.contentType).toBe('application/octet-stream');
    expect(opened.inline).toBe(false);
  });

  it('a raster original keeps its type and stays inline while its variant is not ready', () => {
    expect(openOrderFileStream(original('image/jpeg'), 'md')).toMatchObject({
      contentType: 'image/jpeg',
      inline: true,
      servedVariant: null,
    });
    // Case and parameters do not matter; the served type is the bare essence.
    expect(
      openOrderFileStream(original('IMAGE/PNG; charset=binary'), 'lg'),
    ).toMatchObject({ contentType: 'image/png', inline: true });
  });

  it('without a variant the original is always an octet-stream attachment', () => {
    expect(openOrderFileStream(original('image/jpeg'))).toMatchObject({
      contentType: 'application/octet-stream',
      inline: false,
    });
  });

  it('a ready variant is served inline with its own type, whatever the original declared', () => {
    const opened = openOrderFileStream(
      original('image/svg+xml', {
        md: { path: 'orders/o1/image/x__md.webp', format: 'webp' },
      }),
      'md',
    );
    expect(opened).toMatchObject({
      contentType: 'image/webp',
      inline: true,
      servedVariant: 'md',
      storedPath: 'orders/o1/image/x__md.webp',
    });
  });

  it('opens nothing until the caller sends the bytes: a route that sends by path never holds a descriptor', () => {
    const opened = openOrderFileStream(original('application/pdf'));
    expect(createReadStream).not.toHaveBeenCalled();

    opened.openStream();
    expect(createReadStream).toHaveBeenCalledTimes(1);
    expect(createReadStream).toHaveBeenCalledWith(opened.absolutePath);
  });

  it('404 when the stored blob is gone', () => {
    exists.mockReturnValue(false);
    expect(() => openOrderFileStream(original('image/jpeg'), 'md')).toThrow(
      expect.objectContaining({ statusCode: 404 }) as Error,
    );
  });
});

describe('OrderFilesService: the stored mimeType of an upload', () => {
  const caller: Caller = { userId: 'u-doc', role: UserRole.dentist };
  const order = {
    id: 'o1',
    doctor: { fullName: 'Dr X' },
    patient: { fullName: 'Patient' },
  } as unknown as OrderWithRelations;

  function makeService() {
    const create = jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'f1',
        createdAt: new Date('2026-11-25T08:00:00Z'),
        width: null,
        height: null,
        variants: null,
        mediaMetadata: null,
        ...data,
      }),
    );
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      orderFile: { create, createMany },
      orderAuditLog: { create: jest.fn() },
    };
    const prisma = {
      orderFile: {
        aggregate: jest.fn().mockResolvedValue({ _max: { orderIndex: 2 } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const orders = {
      ensureCanCreateOrModify: jest.fn(),
      findAccessibleOrder: jest.fn().mockResolvedValue(order),
      ensureOrderNotLockedByPayment: jest.fn(),
    };
    const mediaProcessing = { enqueue: jest.fn() };
    const orderAudit = { entry: jest.fn().mockResolvedValue({}) };
    const service = new OrderFilesService(
      prisma as unknown as PrismaService,
      orders as unknown as OrderService,
      mediaProcessing as unknown as MediaProcessingService,
      orderAudit as unknown as OrderAuditService,
    );
    return { service, create, createMany, mediaProcessing };
  }

  beforeEach(() => {
    // No name collision on disk; the moves and writes are no-ops.
    exists.mockReturnValue(false);
    jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    jest.spyOn(fs.promises, 'rename').mockResolvedValue(undefined);
    jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
  });

  it.each([
    'image/svg+xml',
    'Image/SVG+XML; charset=utf-8',
    'text/html',
    'application/xhtml+xml',
    'text/xml',
    'application/xml',
  ])(
    'a chunked upload declared %p is accepted and stored as application/octet-stream',
    async (mimeType) => {
      const { service, create, mediaProcessing } = makeService();
      await service.registerAssembledFile(
        order,
        OrderFileCategory.image,
        { originalName: 'photo', mimeType, sizeBytes: 120 },
        '/tmp/assembled',
        caller,
      );
      const { data } = (create.mock.calls as unknown[][])[0][0] as {
        data: { mimeType: string; processingStatus: unknown };
      };
      expect(data.mimeType).toBe('application/octet-stream');
      expect(data.processingStatus).toBeNull();
      expect(mediaProcessing.enqueue).not.toHaveBeenCalled();
    },
  );

  it('a raster upload keeps its declared type and enters the media pipeline', async () => {
    const { service, create, mediaProcessing } = makeService();
    await service.registerAssembledFile(
      order,
      OrderFileCategory.image,
      { originalName: 'photo.png', mimeType: 'image/png', sizeBytes: 120 },
      '/tmp/assembled',
      caller,
    );
    const { data } = (create.mock.calls as unknown[][])[0][0] as {
      data: { mimeType: string; processingStatus: unknown };
    };
    expect(data.mimeType).toBe('image/png');
    expect(data.processingStatus).toBe(MediaProcessingStatus.pending);
    expect(mediaProcessing.enqueue).toHaveBeenCalledWith('order-file', 'f1');
  });

  it('a multipart upload declared image/svg+xml is stored as application/octet-stream too', async () => {
    const { service, createMany } = makeService();
    await service.uploadFiles(
      'o1',
      [
        {
          originalname: 'photo',
          mimetype: 'image/svg+xml',
          size: 5,
          buffer: Buffer.from('hello'),
        } as Express.Multer.File,
      ],
      OrderFileCategory.image,
      caller,
    );
    const { data } = (createMany.mock.calls as unknown[][])[0][0] as {
      data: Array<{ mimeType: string }>;
    };
    expect(data.map((row) => row.mimeType)).toEqual([
      'application/octet-stream',
    ]);
  });
});
