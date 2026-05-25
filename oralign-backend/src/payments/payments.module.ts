import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DevController } from './controllers/dev.controller';
import { PaymentsController } from './controllers/payments.controller';
import { MockPaymentGateway } from './gateways/mock-payment.gateway';
import { PAYMENT_GATEWAY } from './gateways/payment-gateway.interface';
import { PaymentsService } from './services/payments.service';

/**
 * Payments module — owns the unified Payment table, the gateway
 * strategy, and the dev-only test helpers.
 *
 * Gateway binding: `MockPaymentGateway` ships today. To plug in a
 * real processor (Stripe / Konnect / Flouci / …) replace the
 * `useClass` below; nothing else in PaymentsService changes.
 *
 * `DevController` is registered ONLY when NODE_ENV !== production.
 * Its OnModuleInit also throws as a belt-and-braces guard.
 */
const controllers = [
  PaymentsController,
  ...(process.env.NODE_ENV !== 'production' ? [DevController] : []),
];

@Module({
  controllers,
  providers: [
    PaymentsService,
    PrismaService,
    {
      provide: PAYMENT_GATEWAY,
      useClass: MockPaymentGateway,
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
