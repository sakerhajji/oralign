import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../../notifications/notification.module';
import { EmailChannel } from './email.channel';
import { InAppChannel } from './in-app.channel';
import {
  PRODUCTION_NOTICE_CHANNELS,
  type ProductionNoticeChannel,
} from './production-notice.channel';
import { ProductionNoticeDispatcher } from './production-notice.dispatcher';
import { ProductionNoticeStore } from './production-notice.store';

/**
 * Lab production, PRACTITIONER NOTICES: the ProductionNotice outbox
 * dispatcher (60 s sweep, conditional claim, send-time rendering, retries)
 * and its two channels (in-app through NotificationsService, e-mail
 * through the global MailService).
 *
 * Reads Prisma and the production kernel only; never imports
 * ProductionModule (core writes the outbox rows, this module sends them).
 * Exports ProductionNoticeDispatcher, which ProductionReportsModule's
 * "retry" endpoint kicks.
 */
@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [
    ProductionNoticeStore,
    InAppChannel,
    EmailChannel,
    {
      // A new channel needs more than an entry here: see the checklist on
      // the ProductionNoticeChannel interface (production-notice.channel.ts).
      provide: PRODUCTION_NOTICE_CHANNELS,
      useFactory: (
        inApp: InAppChannel,
        email: EmailChannel,
      ): ProductionNoticeChannel[] => [inApp, email],
      inject: [InAppChannel, EmailChannel],
    },
    ProductionNoticeDispatcher,
  ],
  exports: [ProductionNoticeDispatcher],
})
export class ProductionNotificationsModule {}
