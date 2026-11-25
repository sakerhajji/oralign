import { Injectable } from '@nestjs/common';
import {
  NotificationType,
  ProductionNoticeChannel as NoticeChannelName,
  ProductionNoticeKind,
} from '@prisma/client';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { NOTICE_SKIP_REASON } from '../production.constants';
import type {
  ChannelOutcome,
  PreparedNotice,
  ProductionNoticeChannel,
} from './production-notice.channel';
import { renderInAppNotice } from './production-notice.renderer';

/** The practitioner's bell: one Notification row, through the one service that writes them. */
@Injectable()
export class InAppChannel implements ProductionNoticeChannel {
  readonly channel = NoticeChannelName.in_app;

  constructor(private readonly notifications: NotificationsService) {}

  async send(notice: PreparedNotice): Promise<ChannelOutcome> {
    if (!notice.recipient) {
      return { status: 'skipped', reason: NOTICE_SKIP_REASON.NO_RECIPIENT };
    }
    const { title, message } = renderInAppNotice(notice.facts);
    await this.notifications.create({
      recipientId: notice.recipient.id,
      type:
        notice.kind === ProductionNoticeKind.delivered
          ? NotificationType.production_delivered
          : NotificationType.production_delivery_cancelled,
      title,
      message,
      link: `/dashboard/orders/${notice.orderId}`,
      metadata: {
        orderId: notice.orderId,
        declarationId: notice.declarationId,
        eventIds: [...notice.eventIds],
      },
      lang: notice.recipient.lang,
    });
    return { status: 'sent', recipientAddress: notice.recipient.id };
  }
}
