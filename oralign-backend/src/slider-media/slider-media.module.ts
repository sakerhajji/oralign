import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SliderMediaController } from './controllers/slider-media.controller';
import { SliderMediaService } from './services/slider-media.service';

/**
 * Doctor-dashboard slider media — admin-managed image/video carousel
 * shown above the available packs.
 */
@Module({
  imports: [PrismaModule],
  controllers: [SliderMediaController],
  providers: [SliderMediaService],
  exports: [SliderMediaService],
})
export class SliderMediaModule {}
