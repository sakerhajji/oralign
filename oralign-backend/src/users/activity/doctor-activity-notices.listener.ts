import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { env } from '../../common/config/env';
import { pickLang } from '../../common/i18n/lang';
import { MailService } from '../../mail/mail.service';
import {
  NotificationEvents,
  type AccountActivityNoticeEvent,
} from '../../notifications/events/notification-events';
import { NotificationsService } from '../../notifications/services/notifications.service';
import {
  DASHBOARD_PATH,
  deactivatedNotice,
  doctorDeactivatedAdminNotice,
  NEW_ORDER_PATH,
  reactivatedNotice,
  SUPPORT_PATH,
  warningNotice,
  type NoticeCopy,
} from './doctor-activity.copy';

/**
 * Delivers the inactivity notices (spec §5) once the journal row has
 * committed: e-mail (FR/EN, to User.email) + in-app row for the doctor,
 * and an in-app row for every active admin when the sweep deactivates
 * someone. Its own listener (notifications.listener.ts belongs to the
 * notifications package). Each channel fails alone and is only logged:
 * the journal row is the record, a lost notice never undoes it.
 */
@Injectable()
export class DoctorActivityNoticesListener {
  private readonly logger = new Logger(DoctorActivityNoticesListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  @OnEvent(NotificationEvents.AccountInactivityWarning, { async: true })
  async onWarning(event: AccountActivityNoticeEvent): Promise<void> {
    const lang = pickLang(event.preferredLanguage);
    const daysLeft = event.daysLeft ?? 0;
    await Promise.all([
      this.safe('warning e-mail', event, () =>
        this.mail.sendInactivityWarningEmail({
          to: event.email,
          lang,
          fullName: event.fullName,
          deadlineAt: event.deadlineAt,
          anchorAt: event.anchorAt,
          daysLeft,
          newOrderUrl: absolute(NEW_ORDER_PATH),
        }),
      ),
      this.safe('warning in-app', event, () =>
        this.inApp(
          event,
          NotificationType.account_inactivity_warning,
          warningNotice({ deadlineAt: event.deadlineAt, daysLeft }),
        ),
      ),
    ]);
  }

  @OnEvent(NotificationEvents.AccountDeactivated, { async: true })
  async onDeactivated(event: AccountActivityNoticeEvent): Promise<void> {
    const lang = pickLang(event.preferredLanguage);
    const admin = doctorDeactivatedAdminNotice({
      fullName: event.fullName,
      anchorAt: event.anchorAt,
    });
    await Promise.all([
      this.safe('deactivation e-mail', event, () =>
        this.mail.sendAccountDeactivatedEmail({
          to: event.email,
          lang,
          fullName: event.fullName,
          dashboardUrl: absolute(DASHBOARD_PATH),
          supportUrl: absolute(SUPPORT_PATH),
        }),
      ),
      this.safe('deactivation in-app', event, () =>
        this.inApp(
          event,
          NotificationType.account_deactivated,
          deactivatedNotice(),
        ),
      ),
      this.safe('deactivation admin in-app', event, () =>
        this.notifications.broadcastToAdmins({
          type: NotificationType.doctor_deactivated_inactivity,
          title: admin.title,
          message: admin.message,
          link: admin.link,
          metadata: { userId: event.userId, eventId: event.eventId },
        }),
      ),
    ]);
  }

  @OnEvent(NotificationEvents.AccountReactivated, { async: true })
  async onReactivated(event: AccountActivityNoticeEvent): Promise<void> {
    const lang = pickLang(event.preferredLanguage);
    await Promise.all([
      this.safe('reactivation e-mail', event, () =>
        this.mail.sendAccountReactivatedEmail({
          to: event.email,
          lang,
          fullName: event.fullName,
          newOrderUrl: absolute(NEW_ORDER_PATH),
        }),
      ),
      this.safe('reactivation in-app', event, () =>
        this.inApp(
          event,
          NotificationType.account_reactivated,
          reactivatedNotice(),
        ),
      ),
    ]);
  }

  private inApp(
    event: AccountActivityNoticeEvent,
    type: NotificationType,
    copy: NoticeCopy,
  ) {
    return this.notifications.create({
      recipientId: event.userId,
      type,
      title: copy.title,
      message: copy.message,
      link: copy.link,
      lang: pickLang(event.preferredLanguage),
      metadata: {
        eventId: event.eventId,
        kind: event.kind,
        deadlineAt: event.deadlineAt,
      },
    });
  }

  private async safe(
    what: string,
    event: AccountActivityNoticeEvent,
    run: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(
        `Inactivity ${what} failed for user ${event.userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

/** A dashboard path as an absolute link for an e-mail. */
function absolute(path: string): string {
  return `${env.frontendUrl.replace(/\/$/, '')}${path}`;
}
