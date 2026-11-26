import * as fs from 'fs';
import * as path from 'path';

// uuid is ESM-only; the name of a written file is not under test.
jest.mock('uuid', () => ({ v4: () => 'uuid-test' }), { virtual: true });

import {
  isPlanFileReferenced,
  releasePlanFile,
  resolvePlanFile,
  writePlanFile,
} from './plan-file-store';

const ROOT = path.join(process.cwd(), 'uploads');

function prismaWith(refs: { document?: boolean; plan?: boolean }) {
  return {
    treatmentPlanDocument: {
      findFirst: jest
        .fn()
        .mockResolvedValue(refs.document ? { id: 'd' } : null),
    },
    treatmentPlan: {
      findFirst: jest.fn().mockResolvedValue(refs.plan ? { id: 'p' } : null),
    },
  };
}

describe('plan file store', () => {
  let unlink: jest.SpyInstance;

  beforeEach(() => {
    unlink = jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('isPlanFileReferenced', () => {
    it('looks at the documents and at both image columns of the plans', async () => {
      const prisma = prismaWith({});
      await expect(
        isPlanFileReferenced(prisma as never, 'orders/o/x.png'),
      ).resolves.toBe(false);
      expect(prisma.treatmentPlanDocument.findFirst).toHaveBeenCalledWith({
        where: { storagePath: 'orders/o/x.png' },
        select: { id: true },
      });
      expect(prisma.treatmentPlan.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { movementTableImagePath: 'orders/o/x.png' },
            { dentalTreatmentTableImagePath: 'orders/o/x.png' },
          ],
        },
        select: { id: true },
      });
    });
  });

  describe('releasePlanFile', () => {
    it.each([
      ['another document row', { document: true }],
      ['a plan image column', { plan: true }],
    ])('keeps a file still referenced by %s', async (_label, refs) => {
      await releasePlanFile(prismaWith(refs) as never, 'orders/o/x.pdf');
      expect(unlink).not.toHaveBeenCalled();
    });

    it('removes an unreferenced file inside the uploads root', async () => {
      await releasePlanFile(prismaWith({}) as never, 'orders/o/x.pdf');
      expect(unlink).toHaveBeenCalledWith(path.resolve(ROOT, 'orders/o/x.pdf'));
    });

    it('never touches a path outside the uploads root', async () => {
      await releasePlanFile(prismaWith({}) as never, '../../etc/passwd');
      expect(unlink).not.toHaveBeenCalled();
    });

    it('reports a failure instead of throwing', async () => {
      const prisma = prismaWith({});
      prisma.treatmentPlan.findFirst.mockRejectedValue(new Error('db down'));
      const onError = jest.fn();
      await expect(
        releasePlanFile(prisma as never, 'orders/o/x.pdf', onError),
      ).resolves.toBeUndefined();
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(unlink).not.toHaveBeenCalled();
    });
  });

  describe('path guards', () => {
    it('writePlanFile refuses segments that climb out of the root', async () => {
      const mkdir = jest.spyOn(fs.promises, 'mkdir');
      await expect(
        writePlanFile(['..', '..', 'tmp'], '.pdf', Buffer.from('x')),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(mkdir).not.toHaveBeenCalled();
    });

    it('writePlanFile names the file itself and refuses to overwrite', async () => {
      jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
      const write = jest
        .spyOn(fs.promises, 'writeFile')
        .mockResolvedValue(undefined);
      await expect(
        writePlanFile(['orders', 'o-1', 'documents'], '.pdf', Buffer.from('x')),
      ).resolves.toBe('orders/o-1/documents/uuid-test.pdf');
      expect(write).toHaveBeenCalledWith(
        path.join(ROOT, 'orders', 'o-1', 'documents', 'uuid-test.pdf'),
        expect.any(Buffer),
        { flag: 'wx' },
      );
    });

    it('resolvePlanFile: 403 outside the root, 404 when the file is gone', async () => {
      await expect(resolvePlanFile('../secret.pdf')).rejects.toMatchObject({
        statusCode: 403,
      });
      await expect(
        resolvePlanFile('orders/does-not-exist/none.pdf'),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
