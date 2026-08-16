import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrderController } from './controllers/order.controller';
import { ChunkedUploadService } from './services/chunked-upload.service';
import { OrderPdfService } from './services/order-pdf.service';
import { OrderService } from './services/order.service';
import { OrderFilesService } from './services/order-files.service';
import { OrderExportService } from './services/order-export.service';
import { TreatmentFeeService } from './services/treatment-fee.service';
import { UploadCleanupService } from './services/upload-cleanup.service';

@Module({
  imports: [PrismaModule],
  controllers: [OrderController],
  providers: [
    // Order domain, one concern per service (see each file's header):
    //   OrderService        - lifecycle: create / submit / status / bulk / odontogram + access guards
    //   OrderFilesService   - blob storage: upload / list / delete / download / chunked registration
    //   OrderExportService  - streaming lab ZIP + order-sheet PDF
    //   TreatmentFeeService - the flat treatment fee (pay / proof / confirm / admin lists)
    OrderService,
    OrderFilesService,
    OrderExportService,
    TreatmentFeeService,
    OrderPdfService,
    ChunkedUploadService,
    UploadCleanupService,
  ],
  exports: [OrderService, OrderFilesService, TreatmentFeeService],
})
export class OrderModule {}
