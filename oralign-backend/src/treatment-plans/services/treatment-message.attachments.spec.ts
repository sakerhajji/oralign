// uuid ships as ESM only; the stored name's uuid is irrelevant here.
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));
// The gateway and the media pipeline are not under test (and pull socket /
// image dependencies): constructor stand-ins are enough.
jest.mock('../gateways/treatment-chat.gateway', () => ({
  TreatmentChatGateway: class {},
}));
jest.mock('../../media/media-processing.service', () => ({
  MediaProcessingService: class {},
}));

// The default import is the real `fs` module object (esModuleInterop), the
// one the service's namespace import reads through: spying on it works.
import fs from 'fs';
import { Readable } from 'stream';
import { MediaProcessingStatus, UserRole } from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { MediaProcessingService } from '../../media/media-processing.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TreatmentChatGateway } from '../gateways/treatment-chat.gateway';
import {
  TreatmentMessageService,
  openAttachmentStream,
} from './treatment-message.service';

const STORED = 'orders/o1/treatment-plans/p1/attachments/file.bin';

beforeEach(() => {
  jest.spyOn(fs, 'existsSync').mockReturnValue(true);
  jest
    .spyOn(fs, 'createReadStream')
    .mockImplementation(() => Readable.from(['x']) as unknown as fs.ReadStream);
});
afterEach(() => jest.restoreAllMocks());

const attachment = (mimeType: string | null, variants: unknown = {}) => ({
  fileName: 'drawing.svg',
  filePath: STORED,
  mimeType,
  variants,
});

describe('openAttachmentStream: the type an original is served with (SEC-02)', () => {
  it.each([
    'image/svg+xml',
    'text/html',
    'application/xml',
    'application/pdf',
    null,
  ])(
    'a variant request on a %p original falls back to an octet-stream attachment',
    (mime) => {
      expect(openAttachmentStream(attachment(mime), 'lg')).toMatchObject({
        mimeType: 'application/octet-stream',
        inline: false,
      });
    },
  );

  it('a raster original keeps its type and stays inline while its variant is not ready', () => {
    expect(
      openAttachmentStream(attachment('image/PNG'), 'thumb'),
    ).toMatchObject({
      mimeType: 'image/png',
      inline: true,
    });
  });

  it('a ready variant is served inline under its own type', () => {
    const opened = openAttachmentStream(
      attachment('image/jpeg', {
        md: { path: 'orders/o1/v/md.webp', format: 'webp' },
      }),
      'md',
    );
    expect(opened).toMatchObject({
      mimeType: 'image/webp',
      inline: true,
      fileName: 'md.webp',
    });
  });

  it('a plain download is unchanged: the declared type, as an attachment', () => {
    expect(openAttachmentStream(attachment('application/pdf'))).toMatchObject({
      mimeType: 'application/pdf',
      inline: false,
    });
  });
});

describe('TreatmentMessageService.create: the mimeType stored for an upload', () => {
  const dentist: Caller = { userId: 'u-doc', role: UserRole.dentist };

  function makeService() {
    const tx = {
      treatmentMessage: {
        create: jest.fn().mockResolvedValue({ id: 'm1' }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      treatmentMessageAttachment: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      treatmentPlan: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p1',
          orderId: 'o1',
          deletedAt: null,
          status: 'ready',
          order: {
            id: 'o1',
            doctorId: dentist.userId,
            assignedDesignerId: null,
            deletedAt: null,
            status: 'design',
          },
        }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Dr X' }) },
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const access = { assertCanRead: jest.fn() };
    const service = new TreatmentMessageService(
      prisma as unknown as PrismaService,
      access as unknown as OrderAccessPolicy,
      {} as TreatmentChatGateway,
      {} as MediaProcessingService,
    );
    return { service, tx };
  }

  const upload = (originalname: string, mimetype: string) =>
    ({
      originalname,
      mimetype,
      size: 6,
      buffer: Buffer.from('<svg/>'),
    }) as Express.Multer.File;

  beforeEach(() => {
    jest.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
  });

  it.each([
    ['drawing.svg', 'image/svg+xml'],
    ['page.html', 'text/html'],
    ['feed.xml', 'application/xml'],
  ])(
    '%s declared %p is stored as octet-stream, outside the media pipeline',
    async (name, mime) => {
      const { service, tx } = makeService();
      await service.create('p1', { files: [upload(name, mime)] }, dentist);
      expect(tx.treatmentMessageAttachment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          mimeType: 'application/octet-stream',
          processingStatus: null,
        }) as unknown,
      });
    },
  );

  it('a raster upload keeps its type and enters the media pipeline', async () => {
    const { service, tx } = makeService();
    await service.create(
      'p1',
      { files: [upload('photo.png', 'image/png')] },
      dentist,
    );
    expect(tx.treatmentMessageAttachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mimeType: 'image/png',
        processingStatus: MediaProcessingStatus.pending,
      }) as unknown,
    });
  });

  it('an upload without a declared type still stores null', async () => {
    const { service, tx } = makeService();
    await service.create('p1', { files: [upload('notes.bin', '')] }, dentist);
    expect(tx.treatmentMessageAttachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mimeType: null,
        processingStatus: null,
      }) as unknown,
    });
  });
});
