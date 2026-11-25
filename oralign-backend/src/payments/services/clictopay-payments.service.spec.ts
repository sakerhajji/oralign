import {
  InstallmentStatus,
  OrderType,
  PaymentMethod,
  PaymentProvider,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
  QuotationStatus,
  UserRole,
} from '@prisma/client';
import { env } from '../../common/config/env';
import { NotificationEvents } from '../../notifications/events/notification-events';
import { ClicToPayError } from '../clictopay/clictopay.types';

// QuotationService's production module imports the Puppeteer PDF renderer,
// which is ESM-only. This unit suite needs only the injected method mock.
jest.mock('../../quotations/services/quotation.service', () => ({
  QuotationService: class QuotationService {},
}));

import { ClicToPayPaymentsService } from './clictopay-payments.service';

/**
 * A ClicToPay attempt. The defaults are a 10 TND installment charged
 * without a retenue or a stamp; the settings mocked below price it the
 * same, so it is resumable unless a test says otherwise.
 */
const payment = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'payment-1',
    orderId: 'order-1',
    quotationId: 'quote-1',
    installmentId: 'installment-1',
    amount: new Prisma.Decimal('10.000'),
    withholdingRate: null,
    withholdingAmount: new Prisma.Decimal('0'),
    stampAmount: new Prisma.Decimal('0'),
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
      // What a live attempt is compared with before it is handed back: a
      // 10 TND installment, or a 10 TND fee without CBCT, no stamp.
      quoteInstallment: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ amount: new Prisma.Decimal('10.000') }),
      },
      dentalOrder: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ doctorId: 'doctor-1', cbctFeeAmount: null }),
      },
      companyBillingSettings: {
        findFirst: jest.fn().mockResolvedValue({
          defaultTreatmentFee: new Prisma.Decimal('10.000'),
          defaultCurrency: 'TND',
          withholdingRate: new Prisma.Decimal('1'),
          stampDuty: new Prisma.Decimal('0'),
        }),
      },
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

  /** The attempt transaction, run for real against one locked order row. */
  const runAttemptAgainst = (order: Record<string, unknown>) => {
    prisma.payment.findUnique.mockResolvedValue(null); // no idempotency replay
    prisma.payment.findFirst.mockResolvedValue(null); // nothing to resume
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      dentalOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          doctorId: 'doctor-1',
          orderType: OrderType.initial,
          deletedAt: null,
          treatmentFeePaidAt: null,
          welcomeGiftAppliedAt: null,
          cbctFeeAmount: new Prisma.Decimal('50.000'),
          ...order,
        }),
      },
      payment: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn() },
      companyBillingSettings: { findFirst: jest.fn() },
    };
    prisma.$transaction.mockImplementation(
      (run: (client: typeof tx) => unknown) => run(tx),
    );
    return tx;
  };

  it.each([
    [
      'whose fee the welcome gift waived',
      { welcomeGiftAppliedAt: new Date('2026-11-04') },
      'WELCOME_GIFT_NOTHING_DUE',
    ],
    [
      'that is a supplemental request',
      { orderType: OrderType.replacement },
      'TREATMENT_FEE_INITIAL_ONLY',
    ],
  ])('refuses a card session for an order %s', async (_l, order, errorCode) => {
    const tx = runAttemptAgainst(order);

    await expect(createTreatmentFeeSession()).rejects.toMatchObject({
      statusCode: 400,
      errorCode,
    });
    // Refused under the row lock, before any amount or attempt exists.
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.companyBillingSettings.findFirst).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(client.register).not.toHaveBeenCalled();
  });
  // ─── Retenue à la source and "one payment at a time" ────────────

  /** The installment attempt transaction, run for real. */
  const runInstallmentAttempt = (options: {
    inFlight?: { paymentMethod: PaymentMethod } | null;
    live?: unknown;
    withholdingRate?: string;
    /** settings.stampDuty: the 1 TND droit de timbre by default. */
    stampDuty?: string;
  } = {}) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      quoteInstallment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'installment-1',
          amount: new Prisma.Decimal('1000.000'),
          status: InstallmentStatus.pending,
          availableFrom: new Date('2026-01-01'),
          quotationId: 'quote-1',
          quotation: {
            orderId: 'order-1',
            currency: 'TND',
            status: QuotationStatus.approved,
            deletedAt: null,
            order: { doctorId: 'doctor-1', deletedAt: null },
          },
        }),
      },
      payment: {
        // The guard asks by method; the live-attempt lookup by provider.
        findFirst: jest.fn((args: { where: { provider?: unknown } }) =>
          Promise.resolve(
            args.where.provider ? (options.live ?? null) : (options.inFlight ?? null),
          ),
        ),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(
            payment({ ...data, id: 'payment-new', paymentUrl: null, providerOrderId: null }),
          ),
        ),
      },
      companyBillingSettings: {
        findFirst: jest.fn().mockResolvedValue({
          withholdingRate: new Prisma.Decimal(options.withholdingRate ?? '1'),
          stampDuty: new Prisma.Decimal(options.stampDuty ?? '1'),
        }),
      },
    };
    prisma.$transaction.mockImplementation(
      (run: (client: typeof tx) => unknown) => run(tx),
    );
    // Priced the same outside the lock (the live-attempt comparison).
    prisma.quoteInstallment.findUnique.mockResolvedValue({
      amount: new Prisma.Decimal('1000.000'),
    });
    prisma.companyBillingSettings.findFirst.mockResolvedValue({
      withholdingRate: new Prisma.Decimal(options.withholdingRate ?? '1'),
      stampDuty: new Prisma.Decimal(options.stampDuty ?? '1'),
    });
    client.register.mockResolvedValue({
      orderId: 'provider-new',
      formUrl: 'https://pay.example/new',
    });
    prisma.payment.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(payment({ ...tx.payment.create.mock.calls[0]?.[0].data, ...data })),
    );
    return tx;
  };

  const installmentSession = (applyWithholding?: boolean) =>
    service.createSession(
      {
        orderId: 'order-1',
        purpose: PaymentPurpose.installment,
        installmentId: 'installment-1',
        applyWithholding,
      },
      admin,
      'client-key',
    );

  it('charges the card 1 000 + 1 stamp - 10 retenue = 991 when the practitioner applies the retenue', async () => {
    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.payment.findFirst.mockResolvedValue(null);
    const tx = runInstallmentAttempt({ withholdingRate: '1' });

    const session = await installmentSession(true);

    const data = tx.payment.create.mock.calls[0][0].data;
    expect((data.amount as Prisma.Decimal).toFixed(3)).toBe('991.000');
    expect((data.withholdingAmount as Prisma.Decimal).toFixed(3)).toBe('10.000');
    expect((data.stampAmount as Prisma.Decimal).toFixed(3)).toBe('1.000');
    expect(client.register.mock.calls[0][0].amount).toBe(991000);
    expect(session).toMatchObject({
      amount: '991',
      withholdingRate: 1,
      withholdingAmount: 10,
      stampAmount: 1,
      grossAmount: 1001,
      settledAmount: 1000,
    });
  });

  it('charges the installment + the stamp (1 001) without the retenue', async () => {
    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.payment.findFirst.mockResolvedValue(null);
    const tx = runInstallmentAttempt();

    const session = await installmentSession(false);

    const data = tx.payment.create.mock.calls[0][0].data;
    expect((data.amount as Prisma.Decimal).toFixed(3)).toBe('1001.000');
    expect((data.stampAmount as Prisma.Decimal).toFixed(3)).toBe('1.000');
    expect(data.withholdingRate).toBeNull();
    expect(client.register.mock.calls[0][0].amount).toBe(1001000);
    expect(session).toMatchObject({
      amount: '1001',
      stampAmount: 1,
      grossAmount: 1001,
      settledAmount: 1000,
    });
  });

  it('refuses the retenue when the company rate is 0 (400), before any charge', async () => {
    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.payment.findFirst.mockResolvedValue(null);
    const tx = runInstallmentAttempt({ withholdingRate: '0' });

    await expect(installmentSession(true)).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'WITHHOLDING_DISABLED',
    });
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(client.register).not.toHaveBeenCalled();
  });

  it('refuses a card attempt while a transfer awaits confirmation (409), under the lock', async () => {
    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.payment.findFirst.mockResolvedValue(null);
    const tx = runInstallmentAttempt({
      inFlight: { paymentMethod: PaymentMethod.bank_transfer },
    });

    await expect(installmentSession(false)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'PAYMENT_ATTEMPT_IN_PROGRESS',
    });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(client.register).not.toHaveBeenCalled();
  });

  /** The 409 of a live attempt opened with the other retenue choice. */
  const withholdingChoiceConflict = {
    statusCode: 409,
    // Its own code: the client explains this one, and leaves a transfer
    // in flight (PAYMENT_ATTEMPT_IN_PROGRESS) to the server message.
    errorCode: 'WITHHOLDING_CHOICE_CONFLICT',
    message: expect.stringContaining(
      'déjà ouvert pour ce montant avec un autre choix de retenue',
    ),
  };

  it('never hands back a live session opened with the other retenue choice (409 WITHHOLDING_CHOICE_CONFLICT)', async () => {
    const live = payment({ expiresAt: minutes(5), withholdingRate: null });
    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.payment.findFirst.mockResolvedValue(live);

    await expect(installmentSession(true)).rejects.toMatchObject(
      withholdingChoiceConflict,
    );
    // Alive: neither expired nor doubled.
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    expect(client.register).not.toHaveBeenCalled();
  });

  it('an undecided attempt with the other choice is the same 409, never a second charge', async () => {
    // Past its deadline locally, but the gateway cannot tell: unknown.
    const undecided = payment({
      expiresAt: minutes(-5),
      withholdingRate: null,
    });
    prisma.payment.findUnique.mockImplementation(
      (args: { where?: { idempotencyKey?: string } }) =>
        Promise.resolve(args.where?.idempotencyKey ? null : undecided),
    );
    prisma.payment.findFirst.mockResolvedValue(undecided);
    client.getStatus.mockRejectedValue(new Error('socket hang up'));
    prisma.payment.update.mockResolvedValue(
      payment({
        ...(undecided as object),
        status: PaymentRecordStatus.unknown,
      }),
    );

    await expect(installmentSession(true)).rejects.toMatchObject(
      withholdingChoiceConflict,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(client.register).not.toHaveBeenCalled();
  });

  it('the double-click backstop under the lock answers the same 409 WITHHOLDING_CHOICE_CONFLICT', async () => {
    prisma.payment.findUnique.mockResolvedValue(null);
    // Nothing to resume before the lock; the sibling request's attempt,
    // still being registered (no deadline yet), is found under it.
    prisma.payment.findFirst.mockResolvedValue(null);
    const tx = runInstallmentAttempt({
      live: payment({
        expiresAt: null,
        paymentUrl: null,
        withholdingRate: null,
      }),
    });

    await expect(installmentSession(true)).rejects.toMatchObject(
      withholdingChoiceConflict,
    );
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(client.register).not.toHaveBeenCalled();
  });

  it('a treatment-fee attempt opened with the other choice is a 409 WITHHOLDING_CHOICE_CONFLICT too', async () => {
    const tx = runAttemptAgainst({});
    tx.payment.findFirst.mockResolvedValue(
      payment({
        purpose: PaymentPurpose.treatment_fee,
        installmentId: null,
        quotationId: null,
        expiresAt: null,
        paymentUrl: null,
        withholdingRate: new Prisma.Decimal('1'),
        withholdingAmount: new Prisma.Decimal('3.500'),
      }),
    );

    await expect(
      service.createSession(
        { orderId: 'order-1', purpose: PaymentPurpose.treatment_fee },
        admin,
        'fee-key',
      ),
    ).rejects.toMatchObject(withholdingChoiceConflict);
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(client.register).not.toHaveBeenCalled();
  });

  /** A 1 000 TND installment priced with the 1 TND stamp and a 1 % retenue. */
  const priceInstallmentAt = (stampDuty: string) => {
    prisma.quoteInstallment.findUnique.mockResolvedValue({
      amount: new Prisma.Decimal('1000.000'),
    });
    prisma.companyBillingSettings.findFirst.mockResolvedValue({
      withholdingRate: new Prisma.Decimal('1'),
      stampDuty: new Prisma.Decimal(stampDuty),
    });
  };

  it('still resumes a live session opened with the same choice and the same charge', async () => {
    const live = payment({
      expiresAt: minutes(5),
      amount: new Prisma.Decimal('991.000'),
      withholdingRate: new Prisma.Decimal('1'),
      withholdingAmount: new Prisma.Decimal('10.000'),
      stampAmount: new Prisma.Decimal('1.000'),
    });
    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.payment.findFirst.mockResolvedValue(live);
    priceInstallmentAt('1');

    await expect(installmentSession(true)).resolves.toMatchObject({
      paymentUrl: 'https://pay.example/form',
      stampAmount: 1,
      grossAmount: 1001,
      settledAmount: 1000,
    });
    expect(prisma.quoteInstallment.findUnique).toHaveBeenCalledWith({
      where: { id: 'installment-1' },
      select: { amount: true },
    });
    expect(client.register).not.toHaveBeenCalled();
  });

  /** The 409 of a live attempt that charges another amount than a new one would. */
  const chargeChanged = {
    statusCode: 409,
    errorCode: 'PAYMENT_CHARGE_CHANGED',
    message: expect.stringContaining('à un tarif qui a changé depuis'),
  };

  it('never hands back a live session opened before the stamp was added (409 PAYMENT_CHARGE_CHANGED)', async () => {
    // Opened at 990 (1 000 - 10), before the stamp: a new one charges 991.
    const live = payment({
      expiresAt: minutes(5),
      amount: new Prisma.Decimal('990.000'),
      withholdingRate: new Prisma.Decimal('1'),
      withholdingAmount: new Prisma.Decimal('10.000'),
      stampAmount: new Prisma.Decimal('0'),
    });
    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.payment.findFirst.mockResolvedValue(live);
    priceInstallmentAt('1');

    await expect(installmentSession(true)).rejects.toMatchObject(chargeChanged);
    // Alive: neither expired nor doubled.
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(client.register).not.toHaveBeenCalled();
  });

  it('nor one opened before the stamp changed, without a retenue', async () => {
    const live = payment({
      expiresAt: minutes(5),
      amount: new Prisma.Decimal('1001.000'),
      stampAmount: new Prisma.Decimal('1.000'),
    });
    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.payment.findFirst.mockResolvedValue(live);
    priceInstallmentAt('2');

    await expect(installmentSession(false)).rejects.toMatchObject(chargeChanged);
    expect(client.register).not.toHaveBeenCalled();
  });

  it('an undecided attempt whose charge changed is the same 409, never a second charge', async () => {
    const undecided = payment({
      expiresAt: minutes(-5),
      amount: new Prisma.Decimal('1000.000'),
      stampAmount: new Prisma.Decimal('0'),
    });
    prisma.payment.findUnique.mockImplementation(
      (args: { where?: { idempotencyKey?: string } }) =>
        Promise.resolve(args.where?.idempotencyKey ? null : undecided),
    );
    prisma.payment.findFirst.mockResolvedValue(undecided);
    client.getStatus.mockRejectedValue(new Error('socket hang up'));
    prisma.payment.update.mockResolvedValue(
      payment({ ...(undecided as object), status: PaymentRecordStatus.unknown }),
    );
    priceInstallmentAt('1');

    await expect(installmentSession(false)).rejects.toMatchObject(chargeChanged);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(client.register).not.toHaveBeenCalled();
  });

  it('the double-click backstop under the lock compares the charge too', async () => {
    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.payment.findFirst.mockResolvedValue(null);
    // The sibling request's attempt, still being registered, priced
    // before the stamp went from 1 to 2.
    const tx = runInstallmentAttempt({
      stampDuty: '2',
      live: payment({
        expiresAt: null,
        paymentUrl: null,
        amount: new Prisma.Decimal('1001.000'),
        stampAmount: new Prisma.Decimal('1.000'),
      }),
    });

    await expect(installmentSession(false)).rejects.toMatchObject(chargeChanged);
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(client.register).not.toHaveBeenCalled();
  });

  it('the backstop reuses the sibling attempt when it charges the same', async () => {
    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.payment.findFirst.mockResolvedValue(null);
    const tx = runInstallmentAttempt({
      live: payment({
        id: 'payment-sibling',
        expiresAt: null,
        paymentUrl: null,
        amount: new Prisma.Decimal('1001.000'),
        stampAmount: new Prisma.Decimal('1.000'),
      }),
    });

    const session = await installmentSession(false);

    expect(session.paymentId).toBe('payment-sibling');
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(client.register).not.toHaveBeenCalled();
  });

  it('retires an attempt the gateway proves dead, then opens one with the new choice', async () => {
    const stale = payment({ expiresAt: minutes(-5), withholdingRate: null });
    prisma.payment.findUnique.mockImplementation(async (args: any) =>
      args.where?.idempotencyKey ? null : stale,
    );
    prisma.payment.findFirst.mockResolvedValue(stale);
    client.getStatus.mockResolvedValue({
      orderStatus: 0,
      orderNumber: 'ORA-TEST-1',
      amount: 10000,
      currency: '788',
    });
    const tx = runInstallmentAttempt({ withholdingRate: '1' });
    prisma.payment.update.mockResolvedValueOnce(stale).mockResolvedValueOnce(stale);

    await installmentSession(true);

    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PaymentRecordStatus.expired }),
      }),
    );
    const data = tx.payment.create.mock.calls[0][0].data;
    expect((data.amount as Prisma.Decimal).toFixed(3)).toBe('991.000');
    expect(client.register).toHaveBeenCalledTimes(1);
  });

  it('an idempotency key replayed with the other choice is a conflict, not a replay', async () => {
    prisma.payment.findUnique.mockResolvedValue(payment());
    await expect(installmentSession(true)).rejects.toMatchObject({
      errorCode: 'PAYMENT_IDEMPOTENCY_CONFLICT',
    });
  });

  /** A treatment-fee card attempt the gateway reports paid, settled for real. */
  const settleFeeAttempt = (attempt: ReturnType<typeof payment>) => {
    prisma.payment.findUnique.mockResolvedValue(attempt);
    prisma.payment.update.mockResolvedValue(attempt);
    client.getStatus.mockResolvedValue({
      orderStatus: 2,
      orderNumber: 'ORA-TEST-1',
      amount: Math.round(
        Number((attempt as unknown as { amount: Prisma.Decimal }).amount) * 1000,
      ),
      currency: '788',
    });
    const order = {
      id: 'order-1',
      orderCode: 'ORD-1',
      doctorId: 'doctor-1',
      treatmentFeePaidAt: null,
      doctor: { fullName: 'Dr Salma' },
      patient: { fullName: 'Ines' },
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      payment: {
        findUnique: jest.fn((args: { select?: unknown }) =>
          Promise.resolve(args.select ? { orderId: 'order-1' } : attempt),
        ),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...(attempt as object), ...data }),
        ),
      },
      dentalOrder: {
        findUnique: jest.fn().mockResolvedValue(order),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...order, ...data }),
        ),
      },
    };
    prisma.$transaction.mockImplementation(
      (run: (client: typeof tx) => unknown) => run(tx),
    );
    return tx;
  };

  it('a treatment fee by card: 350 + 1 stamp - 3.500 charged, the order stamped with cash, retenue and stamp', async () => {
    const attempt = payment({
      purpose: PaymentPurpose.treatment_fee,
      installmentId: null,
      quotationId: null,
      amount: new Prisma.Decimal('347.500'),
      withholdingRate: new Prisma.Decimal('1'),
      withholdingAmount: new Prisma.Decimal('3.500'),
      stampAmount: new Prisma.Decimal('1.000'),
    });
    const tx = settleFeeAttempt(attempt);

    await service.verify('payment-1', admin);

    expect(tx.dentalOrder.update.mock.calls[0][0].data).toMatchObject({
      treatmentFeeAmount: new Prisma.Decimal('347.500'),
      treatmentFeeWithholdingRate: new Prisma.Decimal('1'),
      treatmentFeeWithholdingAmount: new Prisma.Decimal('3.500'),
      treatmentFeeStampAmount: new Prisma.Decimal('1.000'),
      treatmentFeePaymentMethod: PaymentMethod.card,
    });
    expect(events.emit).toHaveBeenCalledWith(
      NotificationEvents.TreatmentFeePaid,
      expect.objectContaining({
        paymentId: 'payment-1',
        amount: '347.5',
        withholdingAmount: '3.5',
        stampAmount: '1',
        method: PaymentMethod.card,
      }),
    );
  });

  it('a fee attempt opened before the stamp (stampAmount 0) settles with stamp 0 on the order', async () => {
    const tx = settleFeeAttempt(
      payment({
        purpose: PaymentPurpose.treatment_fee,
        installmentId: null,
        quotationId: null,
        amount: new Prisma.Decimal('350.000'),
      }),
    );

    await service.verify('payment-1', admin);

    const data = tx.dentalOrder.update.mock.calls[0][0].data;
    expect((data.treatmentFeeAmount as Prisma.Decimal).toFixed(3)).toBe(
      '350.000',
    );
    expect((data.treatmentFeeStampAmount as Prisma.Decimal).toFixed(3)).toBe(
      '0.000',
    );
    expect(data.treatmentFeeWithholdingAmount).toBeNull();
  });

  /** The fee settings: 300 TND fee, 1 % retenue, 1 TND stamp. */
  const FEE_SETTINGS = {
    defaultTreatmentFee: new Prisma.Decimal('300.000'),
    defaultCurrency: 'TND',
    withholdingRate: new Prisma.Decimal('1'),
    stampDuty: new Prisma.Decimal('1.000'),
  };

  it.each([
    // (300 + 50 CBCT) + 1 stamp - 3.500 (1 % of 350, stamp excluded)
    [true, '347.500', '3.500', 347500],
    // (300 + 50 CBCT) + 1 stamp
    [false, '351.000', '0.000', 351000],
  ])(
    'a treatment fee attempt charges the fee + CBCT + the stamp (retenue %p)',
    async (applyWithholding, cash, withheld, millimes) => {
      const tx = runAttemptAgainst({});
      tx.companyBillingSettings.findFirst.mockResolvedValue(FEE_SETTINGS);
      tx.payment.findFirst.mockResolvedValue(null);
      tx.payment.count.mockResolvedValue(0);
      tx.payment.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(payment({ ...data, paymentUrl: null, providerOrderId: null })),
      );
      client.register.mockResolvedValue({ orderId: 'p', formUrl: 'https://pay.example/f' });
      prisma.payment.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(payment({ ...tx.payment.create.mock.calls[0][0].data, ...data })),
      );

      const session = await service.createSession(
        { orderId: 'order-1', purpose: PaymentPurpose.treatment_fee, applyWithholding },
        admin,
        'fee-key',
      );

      const data = tx.payment.create.mock.calls[0][0].data;
      expect((data.amount as Prisma.Decimal).toFixed(3)).toBe(cash);
      expect((data.withholdingAmount as Prisma.Decimal).toFixed(3)).toBe(withheld);
      expect((data.stampAmount as Prisma.Decimal).toFixed(3)).toBe('1.000');
      expect(client.register.mock.calls[0][0].amount).toBe(millimes);
      expect(tx.companyBillingSettings.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({ stampDuty: true }),
        }),
      );
      // What it settles is always the fee due.
      expect(session.settledAmount).toBe(350);
    },
  );

  it('never hands back a live fee session opened before the stamp was added (409 PAYMENT_CHARGE_CHANGED)', async () => {
    const live = payment({
      purpose: PaymentPurpose.treatment_fee,
      installmentId: null,
      quotationId: null,
      expiresAt: minutes(5),
      // 350 - 3.500: priced before the stamp.
      amount: new Prisma.Decimal('346.500'),
      withholdingRate: new Prisma.Decimal('1'),
      withholdingAmount: new Prisma.Decimal('3.500'),
      stampAmount: new Prisma.Decimal('0'),
    });
    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.payment.findFirst.mockResolvedValue(live);
    prisma.dentalOrder.findUnique.mockResolvedValue({
      cbctFeeAmount: new Prisma.Decimal('50.000'),
    });
    prisma.companyBillingSettings.findFirst.mockResolvedValue(FEE_SETTINGS);

    await expect(
      service.createSession(
        { orderId: 'order-1', purpose: PaymentPurpose.treatment_fee, applyWithholding: true },
        admin,
        'fee-key',
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'PAYMENT_CHARGE_CHANGED',
    });
    expect(prisma.dentalOrder.findUnique).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      select: { cbctFeeAmount: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(client.register).not.toHaveBeenCalled();
  });

  it('resumes a live fee session that charges what a new one would', async () => {
    const live = payment({
      purpose: PaymentPurpose.treatment_fee,
      installmentId: null,
      quotationId: null,
      expiresAt: minutes(5),
      amount: new Prisma.Decimal('347.500'),
      withholdingRate: new Prisma.Decimal('1'),
      withholdingAmount: new Prisma.Decimal('3.500'),
      stampAmount: new Prisma.Decimal('1.000'),
    });
    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.payment.findFirst.mockResolvedValue(live);
    prisma.dentalOrder.findUnique.mockResolvedValue({
      cbctFeeAmount: new Prisma.Decimal('50.000'),
    });
    prisma.companyBillingSettings.findFirst.mockResolvedValue(FEE_SETTINGS);

    await expect(
      service.createSession(
        { orderId: 'order-1', purpose: PaymentPurpose.treatment_fee, applyWithholding: true },
        admin,
        'fee-key',
      ),
    ).resolves.toMatchObject({
      paymentUrl: 'https://pay.example/form',
      amount: '347.5',
      stampAmount: 1,
      grossAmount: 351,
      settledAmount: 350,
    });
    expect(client.register).not.toHaveBeenCalled();
  });
});
