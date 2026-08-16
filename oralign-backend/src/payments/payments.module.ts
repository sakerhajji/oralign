import { Module } from '@nestjs/common';
import { DevController } from './controllers/dev.controller';
import { PaymentsController } from './controllers/payments.controller';
import { MockPaymentGateway } from './gateways/mock-payment.gateway';
import { PAYMENT_GATEWAY } from './gateways/payment-gateway.interface';
import { PaymentsService } from './services/payments.service';
import { env } from '../common/config/env';

/**
 * Payments module — owns the unified Payment table, the gateway
 * strategy, and the dev-only test helpers.
 *
 * Gateway binding: `MockPaymentGateway` ships today. To plug in a
 * real processor (Stripe / Konnect / Flouci / …) provide it here.
 *
 * SECURITY (audit H-1): MockPaymentGateway ALWAYS returns SUCCESS — it
 * collects no money, so in production it would let a doctor mark
 * installments paid and unlock fabrication for free. Rather than refuse
 * to BOOT (which would take the whole backend down), the gateway itself
 * fails closed at CHARGE time: in production it throws instead of
 * returning a fake success, unless an operator has knowingly set
 * ALLOW_MOCK_PAYMENTS=true (dev/test/staging). The app stays up; only
 * the un-backed card charge is blocked. Wire a real processor before
 * enabling card payments in production. See MockPaymentGateway.charge.
 *
 * `DevController` is registered ONLY when NODE_ENV !== production.
 * Its OnModuleInit also throws as a belt-and-braces guard.
 */
const controllers = [
  PaymentsController,
  ...(!env.isProd ? [DevController] : []),
];

@Module({
  controllers,
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_GATEWAY,
      useClass: MockPaymentGateway,
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
