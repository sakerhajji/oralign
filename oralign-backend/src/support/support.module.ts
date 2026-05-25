import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SupportService } from './services/support.service';
import { SupportController } from './controllers/support.controller';
import { SupportChatGateway } from './gateways/support-chat.gateway';

/**
 * Support chat module — doctor ↔ admin direct messaging with image
 * attachments.
 *
 * Exports the service so future modules (e.g. notifications) can
 * call into it for cross-cutting concerns. Gateway is local-only.
 */
@Module({
  imports: [PrismaModule],
  controllers: [SupportController],
  providers: [SupportService, SupportChatGateway],
  exports: [SupportService],
})
export class SupportModule {}
