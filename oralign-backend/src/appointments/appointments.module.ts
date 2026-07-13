import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { PrismaModule } from '../prisma/prisma.module';

// MailModule is @Global (see mail/mail.module.ts), so MailService is already
// injectable everywhere without importing it here — same as OrderService,
// which pulls MailService/OrderNotificationService straight from the global
// provider. We only need PrismaModule locally.
@Module({
  imports: [PrismaModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
