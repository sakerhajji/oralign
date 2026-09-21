import {
  PaymentProvider,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { env } from '../../common/config/env';
import { ClicToPayError } from '../clictopay/clictopay.types';

// QuotationService's production module imports the Puppeteer PDF renderer,
// which is ESM-only. This unit suite needs only the injected method mock.
jest.mock('../../quotations/services/quotation.service', () => ({
  QuotationService: class QuotationService {},
}));

import { ClicToPayPaymentsService } from './clictopay-payments.service';

const payment = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'payment-1',
    orderId: 'order-1',
    quotationId: 'quote-1',
    installmentId: 'installment-1',
    amount: new Prisma.Decimal('10.000'),
    currency: 'TND',
    purpose: PaymentPurpose.installment,
    provider: PaymentProvider.clictopay,
    status: PaymentRecordStatus.pending,
    providerStatus: null,
    merchantOrderNumber: 'ORA-TEST-1',
    providerOrderId: 'provider-1',
    paymentUrl: 'https://pay.example/form',
    providerErrorCode: null,
    providerErrorMessage: null,
    ...overrides,
  }) as never;

describe('ClicToPayPaymentsService', () => {
  let prisma: any;
  let client: any;
  let payments: any;
  let quotations: any;
  let events: any;
  let service: ClicToPayPaymentsService;
  const admin = { userId: 'admin-1', role: UserRole.admin };

  beforeEach(() => {
    Object.assign(env.clicToPay, {
      apiUrl: 'https://test.example/payment/rest',
      username: 'merchant-user',
      password: 'merchant-password',
      currency: '788',
      returnUrl: 'https://app.example/payment/return',
      failUrl: 'https://app.example/payment/fail',
    });
    prisma = {
      payment: { findUnique: jest.fn(), update: jest.fn() },
      dentalOrder: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    client = { register: jest.fn(), getStatus: jest.fn() };
    payments = { handleSuccess: jest.fn() };
    quotations = { approveOnFirstPayment: jest.fn() };
    events = { emit: jest.fn() };
    service = new ClicToPayPaymentsService(
      prisma,
      client,
      payments,
      quotations,
      events,
    );
  });

  it('does not treat a browser return as payment success without provider status 2', async () => {
    const pending = payment();
    prisma.payment.findUnique.mockResolvedValue(pending);
    client.getStatus.mockResolvedValue({ orderStatus: 0, amount: 10000, currency: '788' });
    prisma.payment.update
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(pending);
    const result = await service.verify('payment-1', admin);
    expect(result.status).toBe(PaymentRecordStatus.pending);
    expect(payments.handleSuccess).not.toHaveBeenCalled();
  });

  it('settles an installment only after provider status 2', async () => {
    const pending = payment();
    const succeeded = payment({ status: PaymentRecordStatus.success });
    prisma.payment.findUnique.mockResolvedValue(pending);
    prisma.payment.update.mockResolvedValue(pending);
    client.getStatus.mockResolvedValue({
      orderStatus: 2,
      orderNumber: 'ORA-TEST-1',
      amount: 10000,
      currency: '788',
    });
    payments.handleSuccess.mockResolvedValue(succeeded);
    const result = await service.verify('payment-1', admin);
    expect(payments.handleSuccess).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(PaymentRecordStatus.success);
  });

  it('maps a provider refusal to failed without business side effects', async () => {
    const pending = payment();
    const failed = payment({ status: PaymentRecordStatus.failed, providerStatus: 6 });
    prisma.payment.findUnique.mockResolvedValue(pending);
    client.getStatus.mockResolvedValue({ orderStatus: 6, amount: 10000, currency: '788' });
    prisma.payment.update.mockResolvedValueOnce(pending).mockResolvedValueOnce(failed);
    await expect(service.verify('payment-1', admin)).resolves.toMatchObject({
      status: PaymentRecordStatus.failed,
    });
    expect(payments.handleSuccess).not.toHaveBeenCalled();
  });

  it('maps provider cancellation and refund states to cancelled', () => {
    expect((service as any).mapProviderStatus(3)).toBe(PaymentRecordStatus.cancelled);
    expect((service as any).mapProviderStatus(4)).toBe(PaymentRecordStatus.cancelled);
  });

  it('keeps technical verification failures recoverable as unknown', async () => {
    const pending = payment();
    const unknown = payment({ status: PaymentRecordStatus.unknown });
    prisma.payment.findUnique.mockResolvedValue(pending);
    client.getStatus.mockRejectedValue(
      new ClicToPayError('ambiguous', 'PAYMENT_PROVIDER_UNREACHABLE', 'Unavailable'),
    );
    prisma.payment.update.mockResolvedValue(unknown);
    await expect(service.verify('payment-1', admin)).resolves.toMatchObject({
      status: PaymentRecordStatus.unknown,
    });
  });

  it('rejects amount mismatches and never settles them', async () => {
    const pending = payment();
    const unknown = payment({ status: PaymentRecordStatus.unknown });
    prisma.payment.findUnique.mockResolvedValue(pending);
    client.getStatus.mockResolvedValue({ orderStatus: 2, amount: 9999, currency: '788' });
    prisma.payment.update.mockResolvedValue(unknown);
    const result = await service.verify('payment-1', admin);
    expect(result.status).toBe(PaymentRecordStatus.unknown);
    expect(payments.handleSuccess).not.toHaveBeenCalled();
  });

  it('rejects currency and merchant-reference mismatches', () => {
    const row = payment();
    expect(
      (service as any).validateProviderIdentity(row, {
        orderStatus: 2,
        amount: 10000,
        currency: '840',
      }),
    ).toContain('currency');
    expect(
      (service as any).validateProviderIdentity(row, {
        orderStatus: 2,
        orderNumber: 'OTHER',
        amount: 10000,
        currency: '788',
      }),
    ).toContain('reference');
  });

  it('returns terminal success idempotently without another provider call', async () => {
    prisma.payment.findUnique.mockResolvedValue(
      payment({ status: PaymentRecordStatus.success }),
    );
    await expect(service.verify('payment-1', admin)).resolves.toMatchObject({
      status: PaymentRecordStatus.success,
    });
    expect(client.getStatus).not.toHaveBeenCalled();
  });

  it('blocks a doctor from reading another doctor payment', async () => {
    prisma.payment.findUnique.mockResolvedValue(payment());
    prisma.dentalOrder.findUnique.mockResolvedValue({ doctorId: 'doctor-owner' });
    await expect(
      service.verify('payment-1', { userId: 'doctor-other', role: UserRole.dentist }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(client.getStatus).not.toHaveBeenCalled();
  });

  it('reuses an idempotent registration result without calling ClicToPay twice', async () => {
    const existing = payment();
    prisma.payment.findUnique.mockResolvedValue(existing);
    const result = await service.createSession(
      {
        orderId: 'order-1',
        purpose: PaymentPurpose.installment,
        installmentId: 'installment-1',
      },
      admin,
      'same-key',
    );
    expect(result.paymentId).toBe('payment-1');
    expect(client.register).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key for a different target', async () => {
    prisma.payment.findUnique.mockResolvedValue(payment());
    await expect(
      service.createSession(
        {
          orderId: 'different-order',
          purpose: PaymentPurpose.installment,
          installmentId: 'installment-1',
        },
        admin,
        'same-key',
      ),
    ).rejects.toMatchObject({ errorCode: 'PAYMENT_IDEMPOTENCY_CONFLICT' });
  });
});
