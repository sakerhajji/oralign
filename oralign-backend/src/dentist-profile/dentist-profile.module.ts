import { Module } from '@nestjs/common';
import { DentistProfileService } from './services/dentist-profile.service';
import { DentistProfileRepository } from './repositories/dentist-profile.repository';
import { DentistProfileController } from './controllers/dentist-profile.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DentistProfileController],
  providers: [DentistProfileService, DentistProfileRepository],
  exports: [DentistProfileService, DentistProfileRepository],
})
export class DentistProfileModule {}
