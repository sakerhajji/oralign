import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrderController } from './controllers/order.controller';
import { ChunkedUploadService } from './services/chunked-upload.service';
import { OrderPdfService } from './services/order-pdf.service';
import { OrderService } from './services/order.service';
import { UploadCleanupService } from './services/upload-cleanup.service';

@Module({
  imports: [PrismaModule],
  controllers: [OrderController],
  providers: [
    OrderService,
    OrderPdfService,
    ChunkedUploadService,
    UploadCleanupService,
  ],
  exports: [OrderService],
})
export class OrderModule {}
