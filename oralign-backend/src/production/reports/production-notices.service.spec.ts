import { Logger } from '@nestjs/common';
import {
  ProductionNoticeChannel,
  ProductionNoticeKind,
  ProductionNoticeStatus,
  UserRole,
} from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import { AppException } from '../../common/exceptions/app.exception';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ProductionNoticeDispatcher } from '../notifications/production-notice.dispatcher';
import { NOTICE_MAX_ATTEMPTS } from '../production.constants';
import { ProductionNoticesService } from './production-notices.service';
import {
  exhaustedNoticeWhere,
  isRetryableNotice,
  NOTICE_ORDER_BY,
  NOTICE_VIEW_SELECT,
  noticeListWhere,
  noticeViewOf,
  retryableNoticeWhere,
  type NoticeViewRow,
} from './production-notices.view';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const ID = '4f6b7c1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e';

function noticeRow(over: Partial<NoticeViewRow> = {}): NoticeViewRow {
  return {
    id: ID,
    orderId: 'o1',
    declarationId: 'd1',
    eventIds: ['e1', 'e2'],
    kind: ProductionNoticeKind.delivered,
    channel: ProductionNoticeChannel.email,
    status: ProductionNoticeStatus.failed,
    skipReason: null,
    recipientAddress: 'dr@example.test',
    attempts: 5,
    lastError: 'SMTP 550',
    notBefore: new Date('2026-11-03T09:10:00.000Z'),
    sentAt: null,
    createdAt: new Date('2026-11-03T09:00:00.000Z'),
    updatedAt: new Date('2026-11-03T10:00:00.000Z'),
    order: { orderCode: 'ORD-001' },
    ...over,
  };
}

function makeService(
  options: {
    updated?: number;
    exists?: boolean;
    view?: NoticeViewRow | null;
    rows?: NoticeViewRow[];
    total?: number;
  } = {},
) {
  const updateMany = jest.fn((_args: unknown) =>
    Promise.resolve({ count: options.updated ?? 1 }),
  );
  const findUnique = jest.fn(
    (args: { where: { id: string }; select: Record<string, unknown> }) => {
      if (args.select === NOTICE_VIEW_SELECT) {
        return Promise.resolve(
          options.view === undefined ? noticeRow() : options.view,
        );
      }
      return Promise.resolve(options.exists === false ? null : { id: ID });
    },
  );
  const count = jest.fn((_args: unknown) =>
    Promise.resolve(options.total ?? 0),
  );
  const findMany = jest.fn((_args: unknown) =>
    Promise.resolve(options.rows ?? []),
  );
  const kick = jest.fn();
  const prisma = {
    productionNotice: { updateMany, findUnique, count, findMany },
  } as unknown as PrismaService;
  const dispatcher = { kick } as unknown as ProductionNoticeDispatcher;
  return {
    service: new ProductionNoticesService(prisma, dispatcher),
    updateMany,
    findUnique,
    count,
    findMany,
    kick,
  };
}

async function errorOf(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('expected an AppException');
}

describe('retryable notices', () => {
  it.each([
    [ProductionNoticeStatus.failed, null, true],
    [ProductionNoticeStatus.skipped, 'not_configured', true],
    [ProductionNoticeStatus.skipped, 'no_recipient', true],
    [ProductionNoticeStatus.skipped, 'cancelled_before_send', false],
    [ProductionNoticeStatus.skipped, 'original_not_sent', false],
    [ProductionNoticeStatus.skipped, null, false],
    [ProductionNoticeStatus.sent, null, false],
    [ProductionNoticeStatus.sending, null, false],
    [ProductionNoticeStatus.pending, null, false],
  ])('%s / %p → %p', (status, skipReason, expected) => {
    expect(isRetryableNotice({ status, skipReason })).toBe(expected);
  });

  it('the where says the same thing', () => {
    expect(retryableNoticeWhere()).toEqual({
      OR: [
        { status: ProductionNoticeStatus.failed },
        {
          status: ProductionNoticeStatus.skipped,
          skipReason: { in: ['not_configured', 'no_recipient'] },
        },
      ],
    });
  });

  it('the view flattens the order code and serialises the instants', () => {
    expect(noticeViewOf(noticeRow())).toEqual({
      id: ID,
      orderId: 'o1',
      orderCode: 'ORD-001',
      declarationId: 'd1',
      eventIds: ['e1', 'e2'],
      kind: ProductionNoticeKind.delivered,
      channel: ProductionNoticeChannel.email,
      status: ProductionNoticeStatus.failed,
      skipReason: null,
      recipientAddress: 'dr@example.test',
      attempts: 5,
      lastError: 'SMTP 550',
      notBefore: '2026-11-03T09:10:00.000Z',
      sentAt: null,
      createdAt: '2026-11-03T09:00:00.000Z',
      updatedAt: '2026-11-03T10:00:00.000Z',
      retryable: true,
    });
  });
});

describe('ProductionNoticesService.list', () => {
  it('2 calls: count + rows with the order code, newest first, paged', async () => {
    const mocks = makeService({ rows: [noticeRow()], total: 41 });
    const page = await mocks.service.list({
      status: ProductionNoticeStatus.failed,
      page: 2,
      limit: 20,
    });
    expect(mocks.count).toHaveBeenCalledTimes(1);
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.count).toHaveBeenCalledWith({
      where: { status: ProductionNoticeStatus.failed },
    });
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { status: ProductionNoticeStatus.failed },
      select: NOTICE_VIEW_SELECT,
      orderBy: NOTICE_ORDER_BY,
      skip: 20,
      take: 20,
    });
    expect(NOTICE_ORDER_BY).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(page).toMatchObject({
      total: 41,
      page: 2,
      limit: 20,
      totalPages: 3,
    });
    expect(page.data[0].orderCode).toBe('ORD-001');
  });

  it('no status filter lists every notice', async () => {
    const mocks = makeService();
    await mocks.service.list({});
    expect(mocks.count).toHaveBeenCalledWith({ where: {} });
  });

  it('exhausted: the failed rows the dispatcher no longer retries, the same where on count and rows', async () => {
    const mocks = makeService();
    await mocks.service.list({
      status: ProductionNoticeStatus.failed,
      exhausted: true,
      page: 1,
      limit: 1,
    });
    const where = {
      AND: [
        { status: ProductionNoticeStatus.failed },
        {
          status: ProductionNoticeStatus.failed,
          attempts: { gte: NOTICE_MAX_ATTEMPTS },
        },
      ],
    };
    expect(mocks.count).toHaveBeenCalledWith({ where });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 0, take: 1 }),
    );
  });
});

describe('noticeListWhere', () => {
  const exhausted = {
    status: ProductionNoticeStatus.failed,
    attempts: { gte: NOTICE_MAX_ATTEMPTS },
  };

  it('exhausted alone stays flat', () => {
    expect(exhaustedNoticeWhere()).toEqual(exhausted);
    expect(noticeListWhere({ exhausted: true })).toEqual(exhausted);
  });

  it('exhausted false keeps every other row (a failed row with a retry scheduled included)', () => {
    expect(noticeListWhere({ exhausted: false })).toEqual({ NOT: exhausted });
  });

  it('a status never overrides the exhausted rule: both apply', () => {
    expect(
      noticeListWhere({
        status: ProductionNoticeStatus.pending,
        exhausted: true,
      }),
    ).toEqual({
      AND: [{ status: ProductionNoticeStatus.pending }, exhausted],
    });
  });

  it('status alone, or nothing', () => {
    expect(noticeListWhere({ status: ProductionNoticeStatus.sent })).toEqual({
      status: ProductionNoticeStatus.sent,
    });
    expect(noticeListWhere({})).toEqual({});
  });
});

describe('ProductionNoticesService.retry', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-11-03T11:00:00.000Z') });
    // Keep the audit line and the kick warning out of the test output.
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterAll(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('ONE conditional write (never read-then-update), then the view, then a non-blocking kick: 2 calls', async () => {
    const queued = noticeRow({
      status: ProductionNoticeStatus.pending,
      attempts: 0,
    });
    const mocks = makeService({ updated: 1, view: queued });

    const view = await mocks.service.retry(ID, admin);

    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: ID,
        OR: [
          { status: ProductionNoticeStatus.failed },
          {
            status: ProductionNoticeStatus.skipped,
            skipReason: { in: ['not_configured', 'no_recipient'] },
          },
        ],
      },
      // lastError is kept for the history.
      data: {
        status: ProductionNoticeStatus.pending,
        attempts: 0,
        notBefore: new Date('2026-11-03T11:00:00.000Z'),
      },
    });
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: ID },
      select: NOTICE_VIEW_SELECT,
    });
    expect(mocks.kick).toHaveBeenCalledTimes(1);
    expect(view).toMatchObject({ id: ID, status: 'pending', retryable: false });
  });

  it('nothing matched and the id is unknown: 404, no kick', async () => {
    const mocks = makeService({ updated: 0, exists: false });
    const error = await errorOf(mocks.service.retry(ID, admin));
    expect(error.statusCode).toBe(404);
    expect(error.errorCode).toBeUndefined();
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: ID },
      select: { id: true },
    });
    expect(mocks.kick).not.toHaveBeenCalled();
  });

  it('nothing matched on an existing notice (sent, sending, pending, cancelled delivery): 409 NOTICE_NOT_RETRYABLE, no kick', async () => {
    const mocks = makeService({ updated: 0, exists: true });
    const error = await errorOf(mocks.service.retry(ID, admin));
    expect(error.statusCode).toBe(409);
    expect(error.errorCode).toBe('NOTICE_NOT_RETRYABLE');
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.kick).not.toHaveBeenCalled();
  });

  it('a kick that throws never fails the retry: the sweep picks the row up anyway', async () => {
    const mocks = makeService({ updated: 1 });
    mocks.kick.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(mocks.service.retry(ID, admin)).resolves.toMatchObject({
      id: ID,
    });
  });
});
