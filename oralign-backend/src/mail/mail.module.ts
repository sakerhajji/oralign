import { Module, Global } from '@nestjs/common';
import { MailService } from './mail.service';
import { OrderNotificationService } from './order-notification.service';

@Global()
@Module({
  providers: [MailService, OrderNotificationService],
  exports: [MailService, OrderNotificationService],
})
export class MailModule {}
