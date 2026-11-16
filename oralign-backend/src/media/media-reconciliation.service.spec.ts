import { MediaProcessingStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { RECONCILE_BACKFILL_BATCH } from './media.constants';
import type { MediaProcessingService } from './media-processing.service';
import { MediaReconciliationService } from './media-reconciliation.service';

interface FindArgs {
  where: {
    OR?: unknown[];
    processingStatus?: unknown;
  };
}

/**
 * A model whose findMany answers the 3D-scan query (the one with an `OR`
 * of extensions) with `scans`, the generic null-status backfill with
 * `others`, and the stuck-job recovery with nothing.
 */
function model(scans: { id: string }[], others: object[] = []) {
  return {
    findMany: jest.fn((args: FindArgs) => {
      if (args.where.OR) return Promise.resolve(scans);
      return Promise.resolve(
        args.where.processingStatus === null ? others : [],
      );
    }),
    updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
  };
}

function setup(
  orderScans: { id: string }[],
  attachmentScans: { id: string }[],
) {
  // The generic newest-first window is full of never-processable PDFs.
  const pdfs = [{ id: 'pdf', mimeType: 'application/pdf', fileName: 'a.pdf' }];
  const prisma = {
    orderFile: model(orderScans, pdfs),
    treatmentMessageAttachment: model(attachmentScans, pdfs),
    blogImage: model([]),
    supportMessage: model([]),
    sliderMedia: model([]),
  };
  const processing = { enqueue: jest.fn() };
  const service = new MediaReconciliationService(
    prisma as unknown as PrismaService,
    processing as unknown as MediaProcessingService,
  );
  return { prisma, processing, service };
}

describe('MediaReconciliationService — 3D scan backfill', () => {
  it('queues null-status scans by extension, past a window of PDFs', async () => {
    const { prisma, processing, service } = setup(
      [{ id: 'ply-1' }, { id: 'obj-1' }],
      [{ id: 'att-1' }],
    );

    await service.run();

    const scanQuery = prisma.orderFile.findMany.mock.calls
      .map(([args]) => args)
      .find((args) => args.where.OR);
    expect(scanQuery).toMatchObject({
      where: {
        deletedAt: null,
        processingStatus: null,
        OR: [
          { fileName: { endsWith: '.stl', mode: 'insensitive' } },
          { fileName: { endsWith: '.ply', mode: 'insensitive' } },
          { fileName: { endsWith: '.obj', mode: 'insensitive' } },
        ],
      },
      take: RECONCILE_BACKFILL_BATCH,
    });
    expect(prisma.orderFile.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ply-1', 'obj-1'] } },
      data: { processingStatus: MediaProcessingStatus.pending },
    });
    expect(prisma.treatmentMessageAttachment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['att-1'] } },
      data: { processingStatus: MediaProcessingStatus.pending },
    });
    expect(processing.enqueue.mock.calls).toEqual([
      ['order-file', 'ply-1'],
      ['order-file', 'obj-1'],
      ['treatment-attachment', 'att-1'],
    ]);
  });

  it('writes and enqueues nothing when no scan is waiting', async () => {
    const { prisma, processing, service } = setup([], []);

    await service.run();

    expect(prisma.orderFile.updateMany).not.toHaveBeenCalled();
    expect(prisma.treatmentMessageAttachment.updateMany).not.toHaveBeenCalled();
    expect(processing.enqueue).not.toHaveBeenCalled();
  });
});
