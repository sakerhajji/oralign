import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications/notification.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { DoctorActivityNoticesListener } from './doctor-activity-notices.listener';
import { DoctorActivityController } from './doctor-activity.controller';
import { DoctorActivityService } from './doctor-activity.service';
import { DoctorInactivitySweepService } from './doctor-inactivity-sweep.service';

/**
 * Doctor inactivity (spec §5): the daily sweep (warnings at 30 and 7 days,
 * then dormancy), the admin reactivation and the activity journal
 * (AccountActivityEvent), the notices (its own listener: e-mail through
 * the global MailModule, in-app through the exported
 * NotificationsService), and the support "run the sweep now" route.
 *
 * Registered in AppModule (P0) and imported by UsersModule, which uses
 * DoctorActivityService for the users desk (activity blocks, filter,
 * reactivate, journal, block / unblock rows). It imports nothing from
 * UsersModule, so there is no cycle.
 *
 * The ordering guard (403 ACCOUNT_DORMANT) and the public-practitioner
 * predicate are PLAIN exports of doctor-ordering.policy.ts (no DI): the
 * orders, supplemental, directory and appointments code calls them
 * without importing this module.
 *
 * Never touches User.isActive (outside the journaled block toggle),
 * DentistProfile.isListedPublicly, or deletes anything.
 */
@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [DoctorActivityController],
  providers: [
    DoctorActivityService,
    DoctorInactivitySweepService,
    DoctorActivityNoticesListener,
  ],
  exports: [DoctorActivityService],
})
export class DoctorActivityModule {}
