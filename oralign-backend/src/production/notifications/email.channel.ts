import { Injectable } from '@nestjs/common';
import {
  ProductionNoticeChannel as NoticeChannelName,
  ProductionNoticeKind,
} from '@prisma/client';
import { env } from '../../common/config/env';
import { MailService } from '../../mail/mail.service';
import { NOTICE_SKIP_REASON } from '../production.constants';
import type {
  ChannelOutcome,
  PreparedNotice,
  ProductionNoticeChannel,
} from './production-notice.channel';
import { renderEmailNotice } from './production-notice.renderer';

/**
 * The practitioner's e-mail, at the ACCOUNT address like every practitioner
 * mail (never the clinic's), in their preferredLanguage. MailService
 * answers whether SMTP actually accepted it: `false` means mail is not
 * configured here, so the row is skipped (an admin may retry it once SMTP
 * is set up), never stamped as sent.
 */
@Injectable()
export class EmailChannel implements ProductionNoticeChannel {
  readonly channel = NoticeChannelName.email;

  constructor(private readonly mail: MailService) {}

  async send(notice: PreparedNotice): Promise<ChannelOutcome> {
    const to = notice.recipient?.email.trim();
    if (!notice.recipient || !to) {
      return { status: 'skipped', reason: NOTICE_SKIP_REASON.NO_RECIPIENT };
    }
    const { lang } = notice.recipient;
    const args = {
      to,
      lang,
      ...renderEmailNotice(notice.facts, lang, {
        doctorName: notice.recipient.fullName,
        dashboardUrl: `${env.frontendUrl.replace(/\/$/, '')}/dashboard/orders/${notice.orderId}`,
      }),
    };
    const accepted =
      notice.kind === ProductionNoticeKind.delivered
        ? await this.mail.sendProductionDeliveredToDoctor(args)
        : await this.mail.sendProductionDeliveryCancelledToDoctor(args);
    return accepted
      ? { status: 'sent', recipientAddress: to }
      : { status: 'skipped', reason: NOTICE_SKIP_REASON.NOT_CONFIGURED };
  }
}
