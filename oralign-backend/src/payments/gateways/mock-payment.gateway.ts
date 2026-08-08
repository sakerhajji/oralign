import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ChargeInput,
  ChargeResult,
  ChargeStatus,
  PaymentGateway,
} from './payment-gateway.interface';

/**
 * Mock implementation of `PaymentGateway`. Default behaviour: simulate
 * a small processing delay then return SUCCESS. When the environment
 * variable `MOCK_PAYMENT_CONTROLLABLE` is `'true'`, a request can
 * override the outcome via the `X-Mock-Outcome` header so QA can
 * exercise the FAILED + PENDING branches without code changes.
 *
 * MOCK_PAYMENT_CONTROLLABLE defaults to `false` so it is OFF in
 * production — even if this gateway is mistakenly bound there, the
 * outcome will be deterministic and the controllable surface
 * disappears.
 */
@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  private readonly logger = new Logger(MockPaymentGateway.name);
  private readonly controllable: boolean;

  constructor() {
    this.controllable = process.env.MOCK_PAYMENT_CONTROLLABLE === 'true';
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    // SECURITY (audit H-1): this mock collects no money and always returns
    // SUCCESS. Allowing it to "succeed" in production would let a doctor
    // unlock paid treatment for free. Fail closed here (not at boot, so the
    // rest of the backend stays up): in production, refuse to charge unless
    // an operator has knowingly opted in via ALLOW_MOCK_PAYMENTS=true. The
    // pending Payment row is created before this call, so a throw leaves the
    // payment un-settled rather than fake-succeeding.
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.ALLOW_MOCK_PAYMENTS !== 'true'
    ) {
      this.logger.error(
        'Refusing mock card charge in production (no real payment gateway configured; set ALLOW_MOCK_PAYMENTS=true to override in a non-billing environment).',
      );
      throw new ServiceUnavailableException(
        'Card payments are not available right now. Please use another payment method or contact support.',
      );
    }

    const status = this.resolveStatus(input.headers);
    const transactionId = `mock_tx_${randomUUID()}`;

    // Simulate processor latency — 200 ms is enough to expose
    // race-condition tests that fire concurrent payments without
    // making the integration tests noticeably slower.
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Do not log the raw idempotency key (audit L-5) — it is a
    // client-supplied credential-like value; the installment id is enough
    // to correlate.
    this.logger.debug(
      `Mock charge installment=${input.installmentId} amount=${input.amount.toString()} → ${status}`,
    );

    return {
      status,
      transactionId,
      rawResponse: { provider: 'mock', controllable: this.controllable },
    };
  }

  private resolveStatus(
    headers: Record<string, string | undefined> | undefined,
  ): ChargeStatus {
    if (!this.controllable) return 'SUCCESS';
    const override = headers?.['x-mock-outcome']?.toLowerCase();
    switch (override) {
      case 'failed':
        return 'FAILED';
      case 'pending':
        return 'PENDING';
      case 'success':
      default:
        return 'SUCCESS';
    }
  }
}
