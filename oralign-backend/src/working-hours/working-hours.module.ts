import { Module } from '@nestjs/common';
import { WorkingHoursService } from './services/working-hours.service';
import { WorkingHoursRepository } from './repositories/working-hours.repository';
import { WorkingHoursController } from './controllers/working-hours.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WorkingHoursController],
  providers: [WorkingHoursService, WorkingHoursRepository],
  exports: [WorkingHoursService, WorkingHoursRepository],
})
export class WorkingHoursModule {}
