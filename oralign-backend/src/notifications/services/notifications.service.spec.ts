import { NotificationType, UserRole } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import type { Caller } from '../../common/access/caller';
import type { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/** The first argument of a mock's call, as the queries read it. */
interface CallArg {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
  take?: number;
}
const argOf = (fn: jest.Mock, call = 0): CallArg =>
  (fn.mock.calls as unknown[][])[call][0] as CallArg;

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const KEY = 'installment:2b9c1f9e-6a43-4c1e-8a57-0b1c1d2e3f40';

function makeService() {
  const updateMany = jest.fn().mockResolvedValue({ count: 2 });
  const createMany = jest.fn().mockResolvedValue({ count: 2 });
  const create = jest
    .fn()
    .mockImplementation((args: { data: unknown }) => args.data);
  const findMany = jest.fn().mockResolvedValue([
    { id: 'a-1', preferredLanguage: 'fr' },
    { id: 'a-2', preferredLanguage: 'en' },
  ]);
  const findUnique = jest.fn().mockResolvedValue({ preferredLanguage: 'fr' });
  const prisma = {
    notification: { updateMany, createMany, create },
    user: { findMany, findUnique },
  } as unknown as PrismaService;
  return {
    service: new NotificationsService(prisma),
    updateMany,
    createMany,
    create,
  };
}

describe('NotificationsService subjects', () => {
  it('marks only MY unread rows of a subject read, and says how many', async () => {
    const { service, updateMany } = makeService();

    await expect(service.markSubjectRead(admin, KEY)).resolves.toEqual({
      updated: 2,
    });
    const { where, data } = argOf(updateMany);
    expect(where).toEqual({
      recipientId: 'u-admin',
      subjectKey: KEY,
      readAt: null,
    });
    expect(data.readAt).toBeInstanceOf(Date);
  });

  it.each([
    '',
    'order:1',
    'installment:a:b',
    'installment:../x',
    'x'.repeat(200),
  ])(
    'answers 400 NOTIFICATION_SUBJECT_INVALID on %p and writes nothing',
    async (key) => {
      const { service, updateMany } = makeService();

      const error: unknown = await service
        .markSubjectRead(admin, key)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).statusCode).toBe(400);
      expect((error as AppException).errorCode).toBe(
        'NOTIFICATION_SUBJECT_INVALID',
      );
      expect(updateMany).not.toHaveBeenCalled();
    },
  );

  it("resolves every recipient's unread rows of a closed subject", async () => {
    const { service, updateMany } = makeService();

    await expect(service.resolveSubject(KEY)).resolves.toBe(2);
    expect(argOf(updateMany).where).toEqual({
      subjectKey: KEY,
      readAt: null,
    });
  });

  it('ignores a malformed key on resolve (listener input)', async () => {
    const { service, updateMany } = makeService();

    await expect(service.resolveSubject('nope')).resolves.toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('falls back to every open fee subject of an order, by prefix', async () => {
    const { service, updateMany } = makeService();

    await service.resolveTreatmentFeeSubjects('order-1');

    expect(argOf(updateMany).where).toEqual({
      type: NotificationType.treatment_fee_declared,
      subjectKey: { startsWith: 'treatment_fee:order-1:' },
      readAt: null,
    });
  });

  it('never lets a LIKE wildcard into the prefix', async () => {
    const { service, updateMany } = makeService();

    await expect(service.resolveTreatmentFeeSubjects('%')).resolves.toBe(0);
    await expect(service.resolveTreatmentFeeSubjects('a_b')).resolves.toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('NotificationsService writes carry the subject', () => {
  it('puts the subject on every admin row of a broadcast', async () => {
    const { service, createMany } = makeService();

    await service.broadcastToAdmins({
      type: NotificationType.payment_declared,
      title: { en: 'T', fr: 'T' },
      message: { en: 'M', fr: 'M' },
      subjectKey: KEY,
    });

    const rows = argOf(createMany).data as unknown as { subjectKey: string }[];
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.subjectKey === KEY)).toBe(true);
  });

  it('stores null when a row is about nothing actionable', async () => {
    const { service, create } = makeService();

    await service.create({
      recipientId: 'u-doc',
      type: NotificationType.payment_confirmed,
      title: 'T',
      message: 'M',
    });

    expect(argOf(create).data.subjectKey).toBeNull();
  });
});
