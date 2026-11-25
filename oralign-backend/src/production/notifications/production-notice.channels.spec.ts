import {
  DeliveryRecipient,
  NotificationType,
  ProductionArch,
  ProductionNoticeKind,
} from '@prisma/client';
import { env } from '../../common/config/env';
import type { MailService } from '../../mail/mail.service';
import type { NotificationsService } from '../../notifications/services/notifications.service';
import { EmailChannel } from './email.channel';
import { InAppChannel } from './in-app.channel';
import type { PreparedNotice } from './production-notice.channel';
import { buildNoticeFacts } from './production-notice.renderer';

const prepared = (over: Partial<PreparedNotice> = {}): PreparedNotice => ({
  noticeId: 'n-1',
  kind: ProductionNoticeKind.delivered,
  orderId: 'o-1',
  declarationId: 'd-1',
  eventIds: ['e-up'],
  recipient: {
    id: 'doc-1',
    email: 'amel@clinic.tn',
    fullName: 'Dr Amel',
    lang: 'fr',
  },
  facts: buildNoticeFacts({
    kind: over.kind ?? ProductionNoticeKind.delivered,
    orderCode: 'ORD-0012',
    patientName: 'Amel Ben Salah',
    rows: [
      {
        arch: ProductionArch.upper,
        stepFrom: 1,
        stepTo: 10,
        quantity: 10,
        performedAt: new Date('2026-11-25T13:30:00.000Z'),
        deliveredTo: DeliveryRecipient.practitioner,
        deliveredToName: null,
      },
    ],
    planned: {
      upper: { total: 24, source: 'approved_plan', provisional: false },
      lower: null,
    },
    counters: {
      upper: { printed: 10, thermoformed: 10, cut: 10, delivered: 10 },
      lower: { printed: 0, thermoformed: 0, cut: 0, delivered: 0 },
    },
  }),
  ...over,
});

describe('InAppChannel', () => {
  const make = () => {
    const create = jest.fn().mockResolvedValue({ id: 'notif-1' });
    const channel = new InAppChannel({
      create,
    } as unknown as NotificationsService);
    return { channel, create };
  };

  it('writes one bell row for the practitioner, in their language, without a second lookup', async () => {
    const { channel, create } = make();
    await expect(channel.send(prepared())).resolves.toEqual({
      status: 'sent',
      recipientAddress: 'doc-1',
    });
    expect(create).toHaveBeenCalledTimes(1);
    const args = (create.mock.calls as unknown[][])[0][0] as Record<
      string,
      unknown
    >;
    expect(args).toMatchObject({
      recipientId: 'doc-1',
      type: NotificationType.production_delivered,
      link: '/dashboard/orders/o-1',
      metadata: { orderId: 'o-1', declarationId: 'd-1', eventIds: ['e-up'] },
      lang: 'fr',
    });
    expect((args.title as { fr: string }).fr).toBe(
      'Aligneurs livrés — ORD-0012',
    );
    expect((args.message as { fr: string }).fr).toContain(
      'livraison partielle : 10 sur 24, reste 14',
    );
  });

  it('a correction uses the cancelled type', async () => {
    const { channel, create } = make();
    await channel.send(prepared({ kind: ProductionNoticeKind.correction }));
    expect((create.mock.calls as unknown[][])[0][0]).toMatchObject({
      type: NotificationType.production_delivery_cancelled,
    });
  });

  it('no practitioner account: skipped (no_recipient), nothing written', async () => {
    const { channel, create } = make();
    await expect(channel.send(prepared({ recipient: null }))).resolves.toEqual({
      status: 'skipped',
      reason: 'no_recipient',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('a database error propagates (the dispatcher retries)', async () => {
    const { channel, create } = make();
    create.mockRejectedValueOnce(new Error('deadlock'));
    await expect(channel.send(prepared())).rejects.toThrow('deadlock');
  });
});

describe('EmailChannel', () => {
  const make = (result: boolean | Error = true) => {
    const reply = () =>
      result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve(result);
    const mail = {
      sendProductionDeliveredToDoctor: jest.fn(reply),
      sendProductionDeliveryCancelledToDoctor: jest.fn(reply),
    };
    return {
      channel: new EmailChannel(mail as unknown as MailService),
      mail,
    };
  };

  it('mails the account address in the practitioner language and reports the address', async () => {
    const { channel, mail } = make(true);
    await expect(channel.send(prepared())).resolves.toEqual({
      status: 'sent',
      recipientAddress: 'amel@clinic.tn',
    });
    expect(mail.sendProductionDeliveredToDoctor).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'amel@clinic.tn',
        lang: 'fr',
        doctorName: 'Dr Amel',
        orderCode: 'ORD-0012',
        stepsLabel: '1 à 10',
        dashboardUrl: `${env.frontendUrl.replace(/\/$/, '')}/dashboard/orders/o-1`,
      }),
    );
    expect(mail.sendProductionDeliveryCancelledToDoctor).not.toHaveBeenCalled();
  });

  it('a correction goes through the cancellation e-mail', async () => {
    const { channel, mail } = make(true);
    await channel.send(prepared({ kind: ProductionNoticeKind.correction }));
    expect(mail.sendProductionDeliveryCancelledToDoctor).toHaveBeenCalledTimes(
      1,
    );
    expect(mail.sendProductionDeliveredToDoctor).not.toHaveBeenCalled();
  });

  it('SMTP not configured: skipped (not_configured), never stamped as sent', async () => {
    const { channel } = make(false);
    await expect(channel.send(prepared())).resolves.toEqual({
      status: 'skipped',
      reason: 'not_configured',
    });
  });

  it('no practitioner or no address: skipped (no_recipient), no send', async () => {
    const { channel, mail } = make(true);
    await expect(channel.send(prepared({ recipient: null }))).resolves.toEqual({
      status: 'skipped',
      reason: 'no_recipient',
    });
    await expect(
      channel.send(
        prepared({
          recipient: {
            id: 'doc-1',
            email: '  ',
            fullName: 'Dr Amel',
            lang: 'en',
          },
        }),
      ),
    ).resolves.toEqual({ status: 'skipped', reason: 'no_recipient' });
    expect(mail.sendProductionDeliveredToDoctor).not.toHaveBeenCalled();
  });

  it('an SMTP error propagates (the dispatcher retries)', async () => {
    const { channel } = make(new Error('421 try later'));
    await expect(channel.send(prepared())).rejects.toThrow('421 try later');
  });
});
