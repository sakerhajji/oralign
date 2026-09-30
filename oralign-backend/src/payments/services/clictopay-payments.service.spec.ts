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
      payment: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
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

  /** `createSession` for a treatment fee, with the attempt transaction stubbed. */
  const createTreatmentFeeSession = () =>
    service.createSession(
      { orderId: 'order-1', purpose: PaymentPurpose.treatment_fee },
      admin,
      'client-key',
    );

  /** Make the attempt transaction hand back a freshly created attempt. */
  const stubFreshAttempt = (fresh: unknown) => {
    prisma.$transaction.mockImplementation(async () => ({
      payment: fresh,
      created: true,
    }));
  };

  const minutes = (n: number) => new Date(Date.now() + n * 60_000);

  it('reuses a hosted session that is still within its deadline', async () => {
    const live = payment({ expiresAt: minutes(5) });
    prisma.payment.findUnique.mockResolvedValue(null); // no idempotency replay
    prisma.payment.findFirst.mockResolvedValue(live);

    const result = await createTreatmentFeeSession();

    expect(result.paymentUrl).toBe('https://pay.example/form');
    expect(client.register).not.toHaveBeenCalled();
  });

  it('never hands back a hosted session whose deadline has passed', async () => {
    const stale = payment({ expiresAt: minutes(-5) });
    const fresh = payment({
      id: 'payment-2',
      merchantOrderNumber: 'ORA-TEST-2',
      providerOrderId: null,
      paymentUrl: null,
      expiresAt: null,
    });
    prisma.payment.findUnique.mockImplementation(async (args: any) =>
      args.where?.idempotencyKey ? null : stale,
    );
    prisma.payment.findFirst.mockResolvedValue(stale);
    // The gateway is asked before anything is retired: registered, never paid.
    client.getStatus.mockResolvedValue({
      orderStatus: 0,
      orderNumber: 'ORA-TEST-1',
      amount: 10000,
      currency: '788',
    });
    prisma.payment.update.mockResolvedValue(stale);
    stubFreshAttempt(fresh);
    client.register.mockResolvedValue({
      orderId: 'provider-2',
      formUrl: 'https://pay.example/form-2',
    });

    await createTreatmentFeeSession();

    // The dead attempt was retired and a brand-new registration was opened.
    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PaymentRecordStatus.expired }),
      }),
    );
    expect(client.register).toHaveBeenCalledTimes(1);
    expect(client.register.mock.calls[0][0].orderNumber).toBe('ORA-TEST-2');
  });

  it('settles a payment made in the final seconds instead of expiring it', async () => {
    const stale = payment({
      purpose: PaymentPurpose.treatment_fee,
      installmentId: null,
      expiresAt: minutes(-1),
    });
    prisma.payment.findUnique.mockImplementation(async (args: any) =>
      args.where?.idempotencyKey ? null : stale,
    );
    prisma.payment.findFirst.mockResolvedValue(stale);
    client.getStatus.mockResolvedValue({
      orderStatus: 2,
      orderNumber: 'ORA-TEST-1',
      amount: 10000,
      currency: '788',
    });
    prisma.payment.update.mockResolvedValue(stale);
    prisma.$transaction.mockImplementation(async () => ({
      payment: payment({ status: PaymentRecordStatus.success }),
      order: { id: 'order-1', orderCode: 'ORD-1', doctorId: 'd1', doctor: null, patient: null },
      notify: false,
    }));

    await createTreatmentFeeSession();

    // Money arrived: no second charge may be opened against it.
    expect(client.register).not.toHaveBeenCalled();
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it('does not open a second charge while a registration outcome is unknown', async () => {
    const ambiguous = payment({
      status: PaymentRecordStatus.unknown,
      providerOrderId: null,
      paymentUrl: null,
      expiresAt: null,
    });
    prisma.payment.findUnique.mockImplementation(async (args: any) =>
      args.where?.idempotencyKey ? null : ambiguous,
    );
    prisma.payment.findFirst.mockResolvedValue(ambiguous);
    client.getStatus.mockRejectedValue(
      new ClicToPayError('ambiguous', 'PAYMENT_PROVIDER_UNREACHABLE', 'unreachable'),
    );
    prisma.payment.update.mockResolvedValue(ambiguous);

    const result = await createTreatmentFeeSession();

    expect(result.status).toBe(PaymentRecordStatus.unknown);
    expect(client.register).not.toHaveBeenCalled();
  });

  it('records a deadline on every hosted session it registers', async () => {
    const fresh = payment({ providerOrderId: null, paymentUrl: null, expiresAt: null });
    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.payment.findFirst.mockResolvedValue(null);
    stubFreshAttempt(fresh);
    client.register.mockResolvedValue({
      orderId: 'provider-1',
      formUrl: 'https://pay.example/form',
    });
    prisma.payment.update.mockResolvedValue(payment());

    await createTreatmentFeeSession();

    const data = prisma.payment.update.mock.calls[0][0].data;
    expect(data.expiresAt).toBeInstanceOf(Date);
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('surfaces an expired session to the return page', async () => {
    const stale = payment({ expiresAt: minutes(-1) });
    const expired = payment({ status: PaymentRecordStatus.expired });
    prisma.payment.findUnique
      .mockResolvedValueOnce(stale) // verify() loads the attempt
      .mockResolvedValueOnce(expired); // re-read after retiring it
    client.getStatus.mockResolvedValue({
      orderStatus: 0,
      orderNumber: 'ORA-TEST-1',
      amount: 10000,
      currency: '788',
    });
    prisma.payment.update.mockResolvedValue(stale);

    const result = await service.verify('payment-1', admin);

    expect(result.status).toBe(PaymentRecordStatus.expired);
    expect(payments.handleSuccess).not.toHaveBeenCalled();
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
