import { Prisma } from '@prisma/client';

/**
 * Provider-neutral interface for online card processing.
 *
 * The CARD payment path goes through this interface so a real
 * processor (Stripe, Konnect, Flouci, ClickToPay …) can be plugged
 * in later by:
 *   1. Implementing `PaymentGateway` against the real SDK.
 *   2. Switching the `PaymentsModule` provider binding from
 *      `MockPaymentGateway` to the new implementation.
 *
 * The `PaymentsService` does NOT need to change — the contract here
 * is the only stable surface.
 *
 * BANK_TRANSFER + CASH bypass this interface entirely; those flows
 * call `PaymentsService.handleSuccess()` directly (admin confirm /
 * admin record-cash).
 */
export interface PaymentGateway {
  /**
   * Charge an amount against the installment's payment.
   *
   * The implementation receives a precise Decimal `amount` already
   * read from the DB under FOR UPDATE — it MUST NOT round, scale or
   * otherwise mutate the value. The processor's API typically takes
   * a smallest-unit integer (cents / millimes); convert at the
   * boundary, never inside this service.
   *
   * Returns `status: SUCCESS | FAILED | PENDING`. The `PENDING`
   * branch exists so a future async-settlement provider can be
   * supported without an interface change — the processor calls
   * back via webhook and `PaymentsService.handleProviderCallback`
   * promotes the row to SUCCESS or FAILED.
   */
  charge(input: ChargeInput): Promise<ChargeResult>;
}

export interface ChargeInput {
  installmentId: string;
  amount: Prisma.Decimal;
  /**
   * Unique key the caller supplies so repeat invocations (re-posted
   * forms, network retries, real-world webhooks) resolve to the
   * same outcome. Stored on Payment as `idempotencyKey @unique`.
   */
  idempotencyKey: string;
  /** Free-form metadata passed to the processor for traceability. */
  metadata: Record<string, unknown>;
  /** Forwarded HTTP headers — used by the mock to honour testing overrides. */
  headers?: Record<string, string | undefined>;
}

export type ChargeStatus = 'SUCCESS' | 'FAILED' | 'PENDING';

export interface ChargeResult {
  status: ChargeStatus;
  transactionId: string;
  rawResponse?: unknown;
}

/**
 * DI token. Using a symbol means a real-gateway swap is one line
 * in the module (`{ provide: PAYMENT_GATEWAY, useClass: ... }`) and
 * the call sites import the interface type rather than a concrete
 * class — no churn.
 */
export const PAYMENT_GATEWAY = Symbol.for('PaymentGateway');
