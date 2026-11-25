import { Logger } from '@nestjs/common';
import {
  ArchTreatment,
  DeliveryRecipient,
  NotificationType,
  ProductionArch,
  ProductionNoticeChannel as NoticeChannelName,
  ProductionNoticeKind,
  ProductionNoticeStatus,
} from '@prisma/client';
import type { NotificationsService } from '../../notifications/services/notifications.service';
import {
  NOTICE_MAX_ATTEMPTS,
  NOTICE_RETRY_BACKOFF_MS,
  NOTICE_SWEEP_BATCH,
  deliveredNoticeKey,
} from '../production.constants';
import type {
  ChannelOutcome,
  PreparedNotice,
  ProductionNoticeChannel,
} from './production-notice.channel';
import { ProductionNoticeDispatcher } from './production-notice.dispatcher';
import type {
  ClaimedNotice,
  ExhaustedNotice,
  NoticeEventRow,
  OriginalNotice,
  ProductionNoticeStore,
} from './production-notice.store';

const NOW = new Date('2026-11-25T12:00:00.000Z');
const PERFORMED_AT = new Date('2026-11-25T08:15:00.000Z');

const DOCTOR = {
  id: 'doc-1',
  email: 'amel@clinic.tn',
  fullName: 'Dr Amel',
  preferredLanguage: 'fr',
  deletedAt: null as Date | null,
};

const notice = (over: Partial<ClaimedNotice> = {}): ClaimedNotice =>
  ({
    id: 'n-1',
    orderId: 'o-1',
    declarationId: 'd-1',
    eventIds: ['e-up', 'e-lo'],
    kind: ProductionNoticeKind.delivered,
    channel: NoticeChannelName.email,
    attempts: 0,
    order: {
      orderCode: 'ORD-0012',
      patient: { fullName: 'Amel Ben Salah' },
      doctor: DOCTOR,
      productionProgress: {
        printedUpper: 10,
        printedLower: 10,
        thermoformedUpper: 10,
        thermoformedLower: 10,
        cutUpper: 10,
        cutLower: 10,
        deliveredUpper: 10,
        deliveredLower: 10,
        firstActionAt: PERFORMED_AT,
        lastActionAt: PERFORMED_AT,
        updatedAt: PERFORMED_AT,
      },
      archTreatment: ArchTreatment.both,
      treatBothArch: true,
      totalAligners: null,
      treatmentPlans: [{ totalUpperAligners: 24, totalLowerAligners: 20 }],
      quotation: null,
    },
    ...over,
  }) as ClaimedNotice;

const event = (
  id: string,
  arch: ProductionArch,
  cancelledAt: Date | null = null,
): NoticeEventRow => ({
  id,
  arch,
  stepFrom: 1,
  stepTo: 10,
  quantity: 10,
  performedAt: PERFORMED_AT,
  deliveredTo: DeliveryRecipient.practitioner,
  deliveredToName: null,
  cancelledAt,
});

const LIVE_EVENTS = [
  event('e-up', ProductionArch.upper),
  event('e-lo', ProductionArch.lower),
];

function channel(
  name: NoticeChannelName,
  outcome: ChannelOutcome | Error = {
    status: 'sent',
    recipientAddress:
      name === NoticeChannelName.email ? 'amel@clinic.tn' : 'doc-1',
  },
) {
  const send = jest.fn((_notice: PreparedNotice) =>
    outcome instanceof Error
      ? Promise.reject(outcome)
      : Promise.resolve(outcome),
  );
  return { channel: name, send } satisfies ProductionNoticeChannel;
}

function setup(options: {
  notices: ClaimedNotice[];
  events?: NoticeEventRow[];
  originals?: Array<[string, OriginalNotice]>;
  exhausted?: ExhaustedNotice[];
  channels?: ProductionNoticeChannel[];
}) {
  const store = {
    claimDue: jest
      .fn()
      .mockResolvedValueOnce({
        claimedIds: options.notices.map((n) => n.id),
        exhausted: options.exhausted ?? [],
      })
      .mockResolvedValue({ claimedIds: [], exhausted: [] }),
    loadClaimed: jest.fn().mockResolvedValue({
      notices: options.notices,
      events: new Map(
        (options.events ?? LIVE_EVENTS).map((e) => [e.id, e] as const),
      ),
      originals: new Map(options.originals ?? []),
    }),
    markSent: jest.fn().mockResolvedValue(undefined),
    markSkipped: jest.fn().mockResolvedValue(true),
    release: jest.fn().mockResolvedValue(true),
    markFailed: jest.fn().mockResolvedValue(true),
  };
  const email = channel(NoticeChannelName.email);
  const inApp = channel(NoticeChannelName.in_app);
  const notifications = { broadcastToAdmins: jest.fn().mockResolvedValue(2) };
  const dispatcher = new ProductionNoticeDispatcher(
    store as unknown as ProductionNoticeStore,
    notifications as unknown as NotificationsService,
    options.channels ?? [inApp, email],
  );
  return { dispatcher, store, email, inApp, notifications };
}

const sentNotice = (send: jest.Mock): PreparedNotice =>
  (send.mock.calls as PreparedNotice[][])[0][0];

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  // Failures are logged on purpose; keep the test output readable.
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('ProductionNoticeDispatcher — delivered notices', () => {
  it('renders at send time, hands the notice to its channel and records the send', async () => {
    const n = notice();
    const { dispatcher, store, email, inApp } = setup({ notices: [n] });

    await dispatcher.sweep();

    expect(inApp.send).not.toHaveBeenCalled();
    expect(email.send).toHaveBeenCalledTimes(1);
    const prepared = sentNotice(email.send);
    expect(prepared).toMatchObject({
      noticeId: 'n-1',
      kind: ProductionNoticeKind.delivered,
      orderId: 'o-1',
      declarationId: 'd-1',
      eventIds: ['e-up', 'e-lo'],
      recipient: {
        id: 'doc-1',
        email: 'amel@clinic.tn',
        fullName: 'Dr Amel',
        lang: 'fr',
      },
    });
    expect(prepared.facts.rows.map((r) => r.arch)).toEqual(['upper', 'lower']);
    // Progress from the projection and the approved plan, per treated arch.
    expect(prepared.facts.progress).toEqual([
      {
        arch: 'upper',
        state: 'partial',
        delivered: 10,
        total: 24,
        remaining: 14,
      },
      {
        arch: 'lower',
        state: 'partial',
        delivered: 10,
        total: 20,
        remaining: 10,
      },
    ]);
    expect(store.markSent).toHaveBeenCalledWith(n, 'amel@clinic.tn', NOW);
    expect(store.markSkipped).not.toHaveBeenCalled();
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it('while one arch stays live, the notice reports that arch only', async () => {
    const { dispatcher, email } = setup({
      notices: [notice()],
      events: [
        event('e-up', ProductionArch.upper),
        event('e-lo', ProductionArch.lower, NOW),
      ],
    });
    await dispatcher.sweep();
    expect(sentNotice(email.send).facts.rows.map((r) => r.arch)).toEqual([
      'upper',
    ]);
  });

  it('every row cancelled: skipped (cancelled_before_send), nothing sent', async () => {
    const { dispatcher, store, email } = setup({
      notices: [notice()],
      events: [
        event('e-up', ProductionArch.upper, NOW),
        event('e-lo', ProductionArch.lower, NOW),
      ],
    });
    await dispatcher.sweep();
    expect(email.send).not.toHaveBeenCalled();
    expect(store.markSkipped).toHaveBeenCalledWith(
      'n-1',
      'cancelled_before_send',
    );
  });

  it('records a channel skip with its reason (SMTP not configured)', async () => {
    const email = channel(NoticeChannelName.email, {
      status: 'skipped',
      reason: 'not_configured',
    });
    const { dispatcher, store } = setup({
      notices: [notice()],
      channels: [email],
    });
    await dispatcher.sweep();
    expect(store.markSkipped).toHaveBeenCalledWith('n-1', 'not_configured');
    expect(store.markSent).not.toHaveBeenCalled();
  });

  it('an archived practitioner: the channel gets no recipient', async () => {
    const n = notice();
    const archived = notice({
      order: { ...n.order, doctor: { ...DOCTOR, deletedAt: NOW } },
    });
    const { dispatcher, email } = setup({ notices: [archived] });
    await dispatcher.sweep();
    expect(sentNotice(email.send).recipient).toBeNull();
  });

  it('a channel without an implementation is skipped as not configured', async () => {
    const { dispatcher, store } = setup({
      notices: [notice({ channel: NoticeChannelName.in_app })],
      channels: [channel(NoticeChannelName.email)],
    });
    await dispatcher.sweep();
    expect(store.markSkipped).toHaveBeenCalledWith('n-1', 'not_configured');
  });
});

describe('ProductionNoticeDispatcher — corrections', () => {
  const correction = () =>
    notice({
      id: 'c-1',
      kind: ProductionNoticeKind.correction,
      eventIds: ['e-up'],
    });
  const cancelled = [
    event('e-up', ProductionArch.upper, NOW),
    event('e-lo', ProductionArch.lower),
  ];
  const originalKey = deliveredNoticeKey('d-1', NoticeChannelName.email);

  it('sends once the original was sent, reporting the cancelled rows', async () => {
    const { dispatcher, store, email } = setup({
      notices: [correction()],
      events: cancelled,
      originals: [
        [originalKey, { status: ProductionNoticeStatus.sent, attempts: 1 }],
      ],
    });
    await dispatcher.sweep();
    const prepared = sentNotice(email.send);
    expect(prepared.kind).toBe(ProductionNoticeKind.correction);
    expect(prepared.facts.rows.map((r) => r.arch)).toEqual(['upper']);
    expect(store.markSent).toHaveBeenCalled();
  });

  it('waits for an original still in flight, without spending an attempt', async () => {
    const { dispatcher, store, email } = setup({
      notices: [correction()],
      events: cancelled,
      originals: [
        [originalKey, { status: ProductionNoticeStatus.pending, attempts: 0 }],
      ],
    });
    await dispatcher.sweep();
    expect(email.send).not.toHaveBeenCalled();
    expect(store.release).toHaveBeenCalledWith(
      'c-1',
      new Date(NOW.getTime() + NOTICE_RETRY_BACKOFF_MS[0]),
    );
    expect(store.markFailed).not.toHaveBeenCalled();
  });

  it('is skipped (original_not_sent) when the original never reached the practitioner', async () => {
    const { dispatcher, store, email } = setup({
      notices: [correction()],
      events: cancelled,
      originals: [
        [originalKey, { status: ProductionNoticeStatus.skipped, attempts: 0 }],
      ],
    });
    await dispatcher.sweep();
    expect(email.send).not.toHaveBeenCalled();
    expect(store.markSkipped).toHaveBeenCalledWith('c-1', 'original_not_sent');
  });
});

describe('ProductionNoticeDispatcher — failures', () => {
  it('a provider error spends an attempt, stores the error and backs off', async () => {
    const email = channel(NoticeChannelName.email, new Error('421 try later'));
    const { dispatcher, store, notifications } = setup({
      notices: [notice({ attempts: 1 })],
      channels: [email],
    });
    await dispatcher.sweep();
    expect(store.markFailed).toHaveBeenCalledWith('n-1', {
      attempts: 2,
      lastError: '421 try later',
      notBefore: new Date(NOW.getTime() + NOTICE_RETRY_BACKOFF_MS[1]),
    });
    expect(store.markSent).not.toHaveBeenCalled();
    expect(notifications.broadcastToAdmins).not.toHaveBeenCalled();
  });

  it('the last attempt tells the admins, once', async () => {
    const email = channel(NoticeChannelName.email, new Error('550 refused'));
    const { dispatcher, store, notifications } = setup({
      notices: [notice({ attempts: NOTICE_MAX_ATTEMPTS - 1 })],
      channels: [email],
    });
    await dispatcher.sweep();
    expect(store.markFailed).toHaveBeenCalledWith(
      'n-1',
      expect.objectContaining({ attempts: NOTICE_MAX_ATTEMPTS }),
    );
    expect(notifications.broadcastToAdmins).toHaveBeenCalledTimes(1);
    const broadcast = (
      notifications.broadcastToAdmins.mock.calls as unknown[][]
    )[0][0] as {
      type: NotificationType;
      message: { en: string; fr: string };
      link: string;
      metadata: Record<string, unknown>;
    };
    expect(broadcast.type).toBe(NotificationType.system_message);
    expect(broadcast.message.fr).toContain('ORD-0012');
    expect(broadcast.link).toBe('/dashboard/production/pilotage?view=notices');
    expect(broadcast.metadata).toEqual({
      noticeId: 'n-1',
      orderId: 'o-1',
      kind: 'delivered',
      channel: 'email',
    });
  });

  it('no broadcast when the failure could not be written (another instance took the row back)', async () => {
    const email = channel(NoticeChannelName.email, new Error('550 refused'));
    const { dispatcher, store, notifications } = setup({
      notices: [notice({ attempts: NOTICE_MAX_ATTEMPTS - 1 })],
      channels: [email],
    });
    store.markFailed.mockResolvedValue(false);
    await dispatcher.sweep();
    expect(notifications.broadcastToAdmins).not.toHaveBeenCalled();
  });

  it('one failing row never blocks the others', async () => {
    const email = channel(NoticeChannelName.email);
    email.send
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        status: 'sent',
        recipientAddress: 'amel@clinic.tn',
      });
    const first = notice({ id: 'n-1' });
    const second = notice({ id: 'n-2', declarationId: 'd-2' });
    const { dispatcher, store } = setup({
      notices: [first, second],
      channels: [email],
    });
    await dispatcher.sweep();
    expect(store.markFailed).toHaveBeenCalledWith(
      'n-1',
      expect.objectContaining({ attempts: 1 }),
    );
    expect(store.markSent).toHaveBeenCalledWith(second, 'amel@clinic.tn', NOW);
  });

  it('a notice whose events do not exist is a failure, not a silent send', async () => {
    const { dispatcher, store, email } = setup({
      notices: [notice()],
      events: [],
    });
    await dispatcher.sweep();
    expect(email.send).not.toHaveBeenCalled();
    expect(store.markFailed).toHaveBeenCalledWith(
      'n-1',
      expect.objectContaining({ attempts: 1 }),
    );
  });

  it('rows a stale recovery just exhausted are reported to the admins', async () => {
    const { dispatcher, notifications } = setup({
      notices: [],
      exhausted: [
        {
          id: 'n-9',
          orderId: 'o-9',
          orderCode: 'ORD-0099',
          kind: ProductionNoticeKind.correction,
          channel: NoticeChannelName.in_app,
        },
      ],
    });
    await dispatcher.sweep();
    expect(notifications.broadcastToAdmins).toHaveBeenCalledTimes(1);
    expect(
      (
        (notifications.broadcastToAdmins.mock.calls as unknown[][])[0][0] as {
          message: { en: string };
        }
      ).message.en,
    ).toContain('ORD-0099');
  });

  it('the admin alert names each channel by its own label', async () => {
    const exhausted = (channel: NoticeChannelName): ExhaustedNotice => ({
      id: `n-${channel}`,
      orderId: 'o-9',
      orderCode: 'ORD-0099',
      kind: ProductionNoticeKind.delivered,
      channel,
    });
    const { dispatcher, notifications } = setup({
      notices: [],
      exhausted: [
        exhausted(NoticeChannelName.in_app),
        exhausted(NoticeChannelName.email),
      ],
    });
    await dispatcher.sweep();
    const messages = (
      notifications.broadcastToAdmins.mock.calls as unknown[][]
    ).map(
      ([args]) => (args as { message: { en: string; fr: string } }).message,
    );
    expect(messages).toHaveLength(2);
    expect(messages[0].en).toContain('notice (in-app)');
    expect(messages[0].fr).toContain('(dans l’application)');
    expect(messages[1].en).toContain('notice (e-mail)');
    expect(messages[1].fr).toContain('(e-mail)');
    expect(messages[1].fr).not.toContain('application');
  });
});

describe('ProductionNoticeDispatcher — sweep mechanics', () => {
  it('claims nothing more and loads nothing when nothing is due', async () => {
    const { dispatcher, store } = setup({ notices: [] });
    await dispatcher.sweep();
    expect(store.claimDue).toHaveBeenCalledTimes(1);
    expect(store.claimDue).toHaveBeenCalledWith(NOW);
    expect(store.loadClaimed).not.toHaveBeenCalled();
  });

  it('a full batch runs another pass straight away', async () => {
    const ids = Array.from({ length: NOTICE_SWEEP_BATCH }, (_, i) => `n-${i}`);
    const { dispatcher, store } = setup({ notices: [] });
    store.claimDue.mockReset();
    store.claimDue
      .mockResolvedValueOnce({ claimedIds: ids, exhausted: [] })
      .mockResolvedValue({ claimedIds: [], exhausted: [] });
    store.loadClaimed.mockResolvedValue({
      notices: [],
      events: new Map(),
      originals: new Map(),
    });
    await dispatcher.sweep();
    expect(store.claimDue).toHaveBeenCalledTimes(2);
  });

  it('re-entrancy: a sweep during a sweep only asks for one more pass', async () => {
    const { dispatcher, store } = setup({ notices: [] });
    let release!: () => void;
    store.claimDue.mockReset();
    store.claimDue
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ claimedIds: [], exhausted: [] });
          }),
      )
      .mockResolvedValue({ claimedIds: [], exhausted: [] });

    const first = dispatcher.sweep();
    await dispatcher.sweep(); // returns at once: one is running
    expect(store.claimDue).toHaveBeenCalledTimes(1);
    release();
    await first;
    // The kick that arrived meanwhile got its pass.
    expect(store.claimDue).toHaveBeenCalledTimes(2);
  });

  it('kick() never throws, even when the database is down', async () => {
    const { dispatcher, store } = setup({ notices: [] });
    store.claimDue.mockReset();
    store.claimDue.mockRejectedValue(new Error('connection refused'));
    expect(() => dispatcher.kick()).not.toThrow();
    await expect(dispatcher.sweep()).resolves.toBeUndefined();
  });

  it('starts no timer under test, and kicks nothing once destroyed', () => {
    const spy = jest.spyOn(global, 'setInterval');
    const { dispatcher, store } = setup({ notices: [] });
    dispatcher.onModuleInit();
    expect(spy).not.toHaveBeenCalled();
    dispatcher.onModuleDestroy();
    dispatcher.kick();
    expect(store.claimDue).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
