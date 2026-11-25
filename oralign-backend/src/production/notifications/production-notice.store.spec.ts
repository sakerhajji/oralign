import {
  ProductionNoticeChannel as NoticeChannelName,
  ProductionNoticeKind,
  ProductionNoticeStatus,
} from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  NOTICE_MAX_ATTEMPTS,
  NOTICE_SENDING_STALE_MS,
  NOTICE_SWEEP_BATCH,
  deliveredNoticeKey,
} from '../production.constants';
import { ProductionNoticeStore } from './production-notice.store';

const NOW = new Date('2026-11-25T12:00:00.000Z');

function makeStore() {
  const tx = {
    $queryRaw: jest.fn(),
    productionNotice: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    productionEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  };
  // The model getters and the transaction client share the mocks: a test
  // asserts the statements, and separately whether a transaction wraps them.
  const prisma = {
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    productionNotice: tx.productionNotice,
    productionEvent: tx.productionEvent,
  };
  return {
    store: new ProductionNoticeStore(prisma as unknown as PrismaService),
    tx,
    prisma,
  };
}

/** The SQL text and the bound values of one tagged $queryRaw call. */
function rawCall(mock: jest.Mock, index: number) {
  const [strings, ...values] = mock.mock.calls[index] as [
    TemplateStringsArray,
    ...unknown[],
  ];
  return { sql: strings.join('?'), values };
}

describe('ProductionNoticeStore.claimDue', () => {
  it('recovers stale claims then claims due rows, in one transaction, with the APP clock bound', async () => {
    const { store, tx, prisma } = makeStore();
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'n-1' }, { id: 'n-2' }]);

    await expect(store.claimDue(NOW)).resolves.toEqual({
      claimedIds: ['n-1', 'n-2'],
      exhausted: [],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);

    const stale = rawCall(tx.$queryRaw, 0);
    expect(stale.sql).toContain(`n.status = 'sending'`);
    expect(stale.sql).toContain(`SET status = 'failed'`);
    expect(stale.sql).toContain(`"lastError" = 'interrupted'`);
    // Never waits on notices a concurrent cancel holds.
    expect(stale.sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(stale.values).toEqual([
      NOW,
      new Date(NOW.getTime() - NOTICE_SENDING_STALE_MS),
    ]);

    const claim = rawCall(tx.$queryRaw, 1);
    expect(claim.sql).toContain(`status IN ('pending', 'failed')`);
    expect(claim.sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(claim.sql).toContain(`SET status = 'sending'`);
    expect(claim.values).toEqual([
      NOW,
      NOW,
      NOTICE_MAX_ATTEMPTS,
      NOTICE_SWEEP_BATCH,
    ]);

    // Never the DB clock: timestamptz against timestamp(3) shifts by the
    // session TimeZone.
    for (const sql of [stale.sql, claim.sql]) {
      expect(sql.toLowerCase()).not.toMatch(/now\(\)|current_timestamp/);
    }
  });

  it('reports only the recovered rows that just ran out of attempts', async () => {
    const { store, tx } = makeStore();
    const recovered = (id: string, attempts: number) => ({
      id,
      orderId: 'o-1',
      orderCode: 'ORD-1',
      kind: ProductionNoticeKind.delivered,
      channel: NoticeChannelName.email,
      attempts,
    });
    tx.$queryRaw
      .mockResolvedValueOnce([
        recovered('n-1', NOTICE_MAX_ATTEMPTS),
        recovered('n-2', 2),
      ])
      .mockResolvedValueOnce([]);

    const { exhausted } = await store.claimDue(NOW);
    expect(exhausted).toEqual([
      {
        id: 'n-1',
        orderId: 'o-1',
        orderCode: 'ORD-1',
        kind: 'delivered',
        channel: 'email',
      },
    ]);
  });
});

describe('ProductionNoticeStore.loadClaimed — one batched load, whatever the row count', () => {
  const claimed = (
    id: string,
    kind: ProductionNoticeKind,
    eventIds: string[],
    declarationId = 'd-1',
  ) => ({
    id,
    kind,
    eventIds,
    declarationId,
    channel: NoticeChannelName.email,
  });

  it('rows, events and the corrections’ originals: three calls', async () => {
    const { store, tx, prisma } = makeStore();
    tx.productionNotice.findMany
      .mockResolvedValueOnce([
        claimed('n-1', ProductionNoticeKind.delivered, ['e-1', 'e-2']),
        claimed('c-1', ProductionNoticeKind.correction, ['e-1'], 'd-1'),
        claimed('c-2', ProductionNoticeKind.correction, ['e-3'], 'd-2'),
      ])
      .mockResolvedValueOnce([
        {
          dedupeKey: deliveredNoticeKey('d-1', NoticeChannelName.email),
          status: ProductionNoticeStatus.sent,
          attempts: 1,
        },
      ]);
    tx.productionEvent.findMany.mockResolvedValueOnce([
      { id: 'e-1' },
      { id: 'e-2' },
      { id: 'e-3' },
    ]);

    const batch = await store.loadClaimed(['n-1', 'c-1', 'c-2']);

    // Plain reads: no transaction (and no connection held) around them.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.productionNotice.findMany).toHaveBeenCalledTimes(2);
    expect(tx.productionEvent.findMany).toHaveBeenCalledTimes(1);
    // Event ids deduplicated across the notices.
    expect(
      (tx.productionEvent.findMany.mock.calls as unknown[][])[0][0],
    ).toMatchObject({
      where: { id: { in: ['e-1', 'e-2', 'e-3'] } },
    });
    expect(
      (tx.productionNotice.findMany.mock.calls as unknown[][])[1][0],
    ).toMatchObject({
      where: {
        dedupeKey: {
          in: [
            deliveredNoticeKey('d-1', NoticeChannelName.email),
            deliveredNoticeKey('d-2', NoticeChannelName.email),
          ],
        },
      },
    });
    expect(batch.events.size).toBe(3);
    expect(
      batch.originals.get(deliveredNoticeKey('d-1', NoticeChannelName.email)),
    ).toEqual({ status: 'sent', attempts: 1 });
  });

  it('no correction: no originals lookup', async () => {
    const { store, tx } = makeStore();
    tx.productionNotice.findMany.mockResolvedValueOnce([
      claimed('n-1', ProductionNoticeKind.delivered, ['e-1']),
    ]);
    await store.loadClaimed(['n-1']);
    expect(tx.productionNotice.findMany).toHaveBeenCalledTimes(1);
    expect(tx.productionEvent.findMany).toHaveBeenCalledTimes(1);
  });

  it('loads no cancel reason, no note and nothing about money', async () => {
    const { store, tx } = makeStore();
    tx.productionNotice.findMany.mockResolvedValueOnce([
      claimed('n-1', ProductionNoticeKind.delivered, ['e-1']),
    ]);
    await store.loadClaimed(['n-1']);
    const eventSelect = (
      (tx.productionEvent.findMany.mock.calls as unknown[][])[0][0] as {
        select: object;
      }
    ).select;
    expect(Object.keys(eventSelect)).not.toEqual(
      expect.arrayContaining(['cancelReason']),
    );
    expect(Object.keys(eventSelect)).not.toEqual(
      expect.arrayContaining(['note']),
    );
    const noticeSelect = JSON.stringify(
      (
        (tx.productionNotice.findMany.mock.calls as unknown[][])[0][0] as {
          select: object;
        }
      ).select,
    );
    expect(noticeSelect).not.toMatch(
      /fee|price|amount|payment|invoice|cancelReason/i,
    );
  });
});

describe('ProductionNoticeStore — outcomes', () => {
  it('markSent: the row and the events’ notifiedAt, atomically', async () => {
    const { store, tx, prisma } = makeStore();
    await store.markSent(
      { id: 'n-1', eventIds: ['e-1', 'e-2'] },
      'amel@clinic.tn',
      NOW,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.productionNotice.update).toHaveBeenCalledWith({
      where: { id: 'n-1' },
      data: {
        status: 'sent',
        sentAt: NOW,
        recipientAddress: 'amel@clinic.tn',
        skipReason: null,
      },
    });
    expect(tx.productionEvent.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['e-1', 'e-2'] }, notifiedAt: null },
      data: { notifiedAt: NOW },
    });
  });

  it('skip, release and failure only touch a row still claimed by us', async () => {
    const { store, tx, prisma } = makeStore();
    const later = new Date(NOW.getTime() + 60_000);

    await expect(store.markSkipped('n-1', 'no_recipient')).resolves.toBe(true);
    await store.release('n-2', later);
    await store.markFailed('n-3', {
      attempts: 2,
      lastError: 'timeout',
      notBefore: later,
    });

    expect(tx.productionNotice.updateMany.mock.calls).toEqual([
      [
        {
          where: { id: 'n-1', status: 'sending' },
          data: { status: 'skipped', skipReason: 'no_recipient' },
        },
      ],
      [
        {
          where: { id: 'n-2', status: 'sending' },
          data: { status: 'pending', notBefore: later },
        },
      ],
      [
        {
          where: { id: 'n-3', status: 'sending' },
          data: {
            status: 'failed',
            attempts: 2,
            lastError: 'timeout',
            notBefore: later,
          },
        },
      ],
    ]);
    // One conditional statement each, without a transaction around it.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reports false when the row was no longer ours', async () => {
    const { store, tx } = makeStore();
    tx.productionNotice.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      store.markFailed('n-1', {
        attempts: 1,
        lastError: 'x',
        notBefore: NOW,
      }),
    ).resolves.toBe(false);
  });
});
