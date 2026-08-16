import { Module } from '@nestjs/common';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationsListener } from './listeners/notifications.listener';
import { NotificationsService } from './services/notifications.service';

/**
 * Self-contained notifications module.
 *
 * Wires the service (writes + reads), the recipient-facing REST
 * controller, and the event listener that turns domain events into
 * persisted Notification rows. Exports the service so any other
 * module that wants to write a notification directly (rare — most
 * code should emit an event instead) can inject it.
 *
 * The listener auto-registers its `@OnEvent` handlers as soon as the
 * provider is instantiated — no extra wiring required.
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsListener],
  exports: [NotificationsService],
})
export class NotificationsModule {}
