import { Logger } from '@nestjs/common';
import { AccountActivityEventKind, NotificationType } from '@prisma/client';
import type { MailService } from '../../mail/mail.service';
import type { AccountActivityNoticeEvent } from '../../notifications/events/notification-events';
import type { NotificationsService } from '../../notifications/services/notifications.service';
import { DoctorActivityNoticesListener } from './doctor-activity-notices.listener';

const event = (
  over: Partial<AccountActivityNoticeEvent> = {},
): AccountActivityNoticeEvent => ({
  eventId: 'ev-1',
  userId: 'u-doc',
  fullName: 'Dr Amel',
  email: 'amel@test.tn',
  preferredLanguage: 'fr',
  kind: AccountActivityEventKind.warning_30d,
  anchorAt: '2026-05-01T09:00:00.000Z',
  deadlineAt: '2026-12-31T09:00:00.000Z',
  daysLeft: 30,
  ...over,
});

function makeListener() {
  const mail = {
    sendInactivityWarningEmail: jest.fn().mockResolvedValue(true),
    sendAccountDeactivatedEmail: jest.fn().mockResolvedValue(true),
    sendAccountReactivatedEmail: jest.fn().mockResolvedValue(true),
  };
  const notifications = {
    create: jest.fn().mockResolvedValue({}),
    broadcastToAdmins: jest.fn().mockResolvedValue(2),
  };
  const listener = new DoctorActivityNoticesListener(
    notifications as unknown as NotificationsService,
    mail as unknown as MailService,
  );
  return { listener, mail, notifications };
}

describe('DoctorActivityNoticesListener', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('a warning goes by e-mail (doctor language) and in-app, linking to a new order', async () => {
    const { listener, mail, notifications } = makeListener();

    await listener.onWarning(event());

    expect(mail.sendInactivityWarningEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'amel@test.tn',
        lang: 'fr',
        daysLeft: 30,
        newOrderUrl: expect.stringMatching(
          /\/dashboard\/orders\/new$/,
        ) as unknown as string,
      }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'u-doc',
        type: NotificationType.account_inactivity_warning,
        link: '/dashboard/orders/new',
        lang: 'fr',
      }),
    );
  });

  it('a failing channel never stops the other one', async () => {
    const { listener, mail, notifications } = makeListener();
    mail.sendInactivityWarningEmail.mockRejectedValue(new Error('smtp down'));

    await expect(listener.onWarning(event())).resolves.toBeUndefined();
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });

  it('a deactivation also tells every admin, without personal data in the link', async () => {
    const { listener, mail, notifications } = makeListener();

    await listener.onDeactivated(
      event({ kind: AccountActivityEventKind.deactivated, daysLeft: null }),
    );

    expect(mail.sendAccountDeactivatedEmail).toHaveBeenCalledTimes(1);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: NotificationType.account_deactivated }),
    );
    const broadcast = (
      notifications.broadcastToAdmins.mock.calls as unknown[][]
    )[0][0] as {
      type: NotificationType;
      link: string;
      metadata: Record<string, unknown>;
    };
    expect(broadcast.type).toBe(NotificationType.doctor_deactivated_inactivity);
    expect(broadcast.link).not.toContain('amel');
    expect(broadcast.metadata).toEqual({ userId: 'u-doc', eventId: 'ev-1' });
  });

  it('a reactivation notifies the doctor, never with the admin reason', async () => {
    const { listener, mail, notifications } = makeListener();

    await listener.onReactivated(
      event({
        kind: AccountActivityEventKind.reactivated,
        preferredLanguage: 'en',
        reason: 'Internal note',
        actorName: 'Admin',
      }),
    );

    expect(mail.sendAccountReactivatedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'en' }),
    );
    const row = (notifications.create.mock.calls as unknown[][])[0][0] as {
      type: NotificationType;
      message: { en: string; fr: string };
    };
    expect(row.type).toBe(NotificationType.account_reactivated);
    expect(JSON.stringify(row)).not.toContain('Internal note');
  });
});
