import {
  InstallmentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentRecordStatus,
  Prisma,
  QuotationPaymentStatus,
  QuotationStatus,
  UserRole,
} from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Caller } from '../../common/access/caller';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PaymentGateway } from '../gateways/payment-gateway.interface';

// QuotationService's production module imports the Puppeteer PDF renderer,
// which is ESM-only. These flows only need approveOnFirstPayment.
jest.mock('../../quotations/services/quotation.service', () => ({
  QuotationService: class QuotationService {},
}));

import type { QuotationService } from '../../quotations/services/quotation.service';
import { NotificationEvents } from '../../notifications/events/notification-events';
import { PaymentsService, settledTotal } from './payments.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };
const d = (value: string) => new Prisma.Decimal(value);
const past = new Date('2026-01-01T00:00:00.000Z');

interface Setup {
  /** The installment due (TTC). */
  installmentAmount?: string;
  totalPrice?: string;
  installmentStatus?: InstallmentStatus;
  /** settings.withholdingRate */
  withholdingRate?: string;
  /** settings.stampDuty (1 TND by default, as the column default). */
  stampDuty?: string;
  /** An open payment of another kind on the installment. */
  inFlight?: { paymentMethod: PaymentMethod } | null;
  /** The payment handleSuccess settles (confirm / card paths). */
  payment?: Record<string, unknown>;
  /** What the success aggregate sums, this payment included. */
  settledSum?: {
    amount: string;
    withholdingAmount: string;
    stampAmount?: string;
  };
  /** The order's status before the payment (payment_pending by default). */
  orderStatus?: OrderStatus;
}

function setup(options: Setup = {}) {
  const installment = {
    id: 'i-1',
    installmentNumber: 1,
    amount: d(options.installmentAmount ?? '1000.000'),
    status: options.installmentStatus ?? InstallmentStatus.pending,
    availableFrom: past,
    quotationId: 'q-1',
    quotation: {
      id: 'q-1',
      status: QuotationStatus.approved,
      orderId: 'o-1',
      totalPrice: d(options.totalPrice ?? '1000.000'),
      currency: 'TND',
      deletedAt: null,
      order: {
        id: 'o-1',
        orderCode: 'ORD-1',
        doctorId: 'u-doc',
        deletedAt: null,
        doctor: { fullName: 'Dr Salma' },
        patient: { fullName: 'Ines' },
      },
    },
    stepBatch: null,
  };
  const order = {
    id: 'o-1',
    doctorId: 'u-doc',
    orderCode: 'ORD-1',
    status: options.orderStatus ?? OrderStatus.payment_pending,
    doctor: { fullName: 'Dr Salma' },
    patient: { fullName: 'Ines' },
  };
  let payment: Record<string, unknown> | null = options.payment
    ? {
        installmentId: 'i-1',
        quotationId: 'q-1',
        orderId: 'o-1',
        notes: null,
        // The column defaults of a real row.
        withholdingRate: null,
        withholdingAmount: d('0'),
        stampAmount: d('0'),
        ...options.payment,
      }
    : null;

  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    quoteInstallment: {
      findUnique: jest.fn().mockResolvedValue(installment),
      update: jest.fn(),
    },
    quoteStepBatch: { update: jest.fn() },
    companyBillingSettings: {
      findFirst: jest.fn().mockResolvedValue({
        withholdingRate: d(options.withholdingRate ?? '1'),
        stampDuty: d(options.stampDuty ?? '1'),
      }),
    },
    payment: {
      findFirst: jest.fn().mockResolvedValue(options.inFlight ?? null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        payment = { id: 'p-new', notes: null, ...data };
        return Promise.resolve(payment);
      }),
      findUnique: jest.fn((args: { select?: unknown }) =>
        Promise.resolve(
          args.select ? { installmentId: payment ? 'i-1' : null } : payment,
        ),
      ),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...payment, ...data }),
      ),
      aggregate: jest.fn(() =>
        Promise.resolve({
          _sum: options.settledSum
            ? {
                amount: d(options.settledSum.amount),
                withholdingAmount: d(options.settledSum.withholdingAmount),
                stampAmount: d(options.settledSum.stampAmount ?? '0'),
              }
            : {
                amount: (payment?.amount as Prisma.Decimal) ?? null,
                withholdingAmount:
                  (payment?.withholdingAmount as Prisma.Decimal) ?? null,
                stampAmount: (payment?.stampAmount as Prisma.Decimal) ?? null,
              },
        }),
      ),
    },
    quotation: { update: jest.fn() },
    // A stateful order row: the writes only land when their where matches,
    // as Postgres would apply them, so a test reads the status it ends in.
    dentalOrder: {
      findUnique: jest.fn(() => Promise.resolve({ ...order })),
      update: jest.fn(({ data }: { data: Partial<typeof order> }) => {
        Object.assign(order, data);
        return Promise.resolve({ ...order });
      }),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; status?: { in: OrderStatus[] } };
          data: Partial<typeof order>;
        }) => {
          const hit =
            where.id === order.id &&
            (!where.status || where.status.in.includes(order.status));
          if (hit) Object.assign(order, data);
          return Promise.resolve({ count: hit ? 1 : 0 });
        },
      ),
    },
  };
  const prisma = {
    quoteInstallment: { findUnique: jest.fn().mockResolvedValue(installment) },
    payment: {
      findUnique: jest.fn(() => Promise.resolve(payment)),
    },
    companyBillingSettings: {
      // Bank details for the transfer path.
      findFirst: jest.fn().mockResolvedValue({
        bankDetails: { rib: '123', bankName: 'Bank' },
      }),
    },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const events = { emit: jest.fn() };
  const quotations = { approveOnFirstPayment: jest.fn() };
  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    events as unknown as EventEmitter2,
    {} as PaymentGateway,
    quotations as unknown as QuotationService,
  );
  return { service, prisma, tx, events, order };
}

const createdData = (tx: ReturnType<typeof setup>['tx']) =>
  (tx.payment.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0]
    .data;
const quoteUpdate = (tx: ReturnType<typeof setup>['tx']) =>
  (tx.quotation.update.mock.calls[0] as [{ data: Record<string, unknown> }])[0]
    .data;

describe('settledTotal', () => {
  it('cash + retenue - stamp, missing sums count as 0', () => {
    expect(
      settledTotal({
        amount: d('991'),
        withholdingAmount: d('10'),
        stampAmount: d('1'),
      }).toFixed(3),
    ).toBe('1000.000');
    // Payments made before the stamp was added: stampAmount 0.
    expect(
      settledTotal({
        amount: d('990'),
        withholdingAmount: d('10'),
        stampAmount: d('0'),
      }).toFixed(3),
    ).toBe('1000.000');
    expect(
      settledTotal({ amount: d('990'), withholdingAmount: d('10') }).toFixed(3),
    ).toBe('1000.000');
    expect(
      settledTotal({
        amount: null,
        withholdingAmount: null,
        stampAmount: null,
      }).toFixed(3),
    ).toBe('0.000');
  });
});

describe('PaymentsService.handleSuccess with a retenue à la source and the stamp', () => {
  it('settles the quote on cash + retenue - stamp: paid, order to fabrication', async () => {
    const { service, tx } = setup({
      payment: {
        id: 'p-1',
        // 1 000 + 1 stamp - 10 retenue.
        amount: d('991.000'),
        withholdingRate: d('1'),
        withholdingAmount: d('10.000'),
        stampAmount: d('1.000'),
        status: PaymentRecordStatus.awaiting_confirmation,
        paymentMethod: PaymentMethod.bank_transfer,
      },
    });

    await service.handleSuccess({
      paymentId: 'p-1',
      transactionId: 'TRF-1',
      actor: admin,
    });

    expect(tx.payment.aggregate).toHaveBeenCalledWith({
      where: { quotationId: 'q-1', status: PaymentRecordStatus.success },
      _sum: { amount: true, withholdingAmount: true, stampAmount: true },
    });
    const data = quoteUpdate(tx);
    expect((data.paidAmount as Prisma.Decimal).toFixed(3)).toBe('1000.000');
    expect((data.remainingAmount as Prisma.Decimal).toFixed(3)).toBe('0.000');
    expect(data.paymentStatus).toBe(QuotationPaymentStatus.paid);
    expect(tx.dentalOrder.update.mock.calls[0][0].data).toEqual({
      status: OrderStatus.fabrication,
    });
  });

  it('the stamp never counts toward the devis: 1 001 cash pays 1 000 of a 2 000 quote', async () => {
    const { service, tx } = setup({
      totalPrice: '2000.000',
      payment: {
        id: 'p-1',
        amount: d('1001.000'),
        stampAmount: d('1.000'),
        status: PaymentRecordStatus.pending,
        paymentMethod: PaymentMethod.card,
      },
    });
    await service.handleSuccess({
      paymentId: 'p-1',
      transactionId: 'GW-1',
      actor: admin,
    });
    const data = quoteUpdate(tx);
    expect((data.paidAmount as Prisma.Decimal).toFixed(3)).toBe('1000.000');
    expect((data.remainingAmount as Prisma.Decimal).toFixed(3)).toBe(
      '1000.000',
    );
    expect(data.paymentStatus).toBe(QuotationPaymentStatus.partially_paid);
  });

  it('three installments carry three stamps and the quote reaches exactly paid', async () => {
    const { service, tx } = setup({
      totalPrice: '3000.000',
      payment: {
        id: 'p-3',
        amount: d('1001.000'),
        stampAmount: d('1.000'),
        status: PaymentRecordStatus.pending,
        paymentMethod: PaymentMethod.card,
      },
      // 991 (retenue applied) + 1 001 + 1 001 cash; 10 retenue; 3 stamps.
      settledSum: {
        amount: '2993.000',
        withholdingAmount: '10.000',
        stampAmount: '3.000',
      },
    });
    await service.handleSuccess({
      paymentId: 'p-3',
      transactionId: 'GW-3',
      actor: admin,
    });
    const data = quoteUpdate(tx);
    expect((data.paidAmount as Prisma.Decimal).toFixed(3)).toBe('3000.000');
    expect(data.paymentStatus).toBe(QuotationPaymentStatus.paid);
  });

  it('a payment made before the stamp was added (stampAmount 0) still settles its installment', async () => {
    const { service, tx } = setup({
      payment: {
        id: 'p-old',
        amount: d('990.000'),
        withholdingRate: d('1'),
        withholdingAmount: d('10.000'),
        stampAmount: d('0'),
        status: PaymentRecordStatus.awaiting_confirmation,
        paymentMethod: PaymentMethod.bank_transfer,
      },
    });
    await service.confirmBankTransfer('p-old', undefined, admin);
    const data = quoteUpdate(tx);
    expect((data.paidAmount as Prisma.Decimal).toFixed(3)).toBe('1000.000');
    expect(data.paymentStatus).toBe(QuotationPaymentStatus.paid);
  });

  it('cash alone would leave the quote partially paid: the retenue is what closes it', async () => {
    const { service, tx } = setup({
      payment: {
        id: 'p-1',
        amount: d('990.000'),
        withholdingAmount: d('0'),
        status: PaymentRecordStatus.pending,
        paymentMethod: PaymentMethod.card,
      },
      settledSum: { amount: '990.000', withholdingAmount: '0' },
    });
    await service.handleSuccess({
      paymentId: 'p-1',
      transactionId: 'GW-1',
      actor: admin,
    });
    const data = quoteUpdate(tx);
    expect(data.paymentStatus).toBe(QuotationPaymentStatus.partially_paid);
    expect((data.remainingAmount as Prisma.Decimal).toFixed(3)).toBe('10.000');
  });
});

describe('order status after a payment (never moved back)', () => {
  // An extra installment (planRebalance after a total edit) is payable on
  // a case that already left the payment phase.
  const pastPaymentPhase = [
    OrderStatus.fabrication,
    OrderStatus.ready_to_ship,
    OrderStatus.shipped,
    OrderStatus.finished,
  ];
  const extraInstallment = {
    id: 'p-extra',
    // 200 + the 1 TND stamp.
    amount: d('201.000'),
    withholdingAmount: d('0'),
    stampAmount: d('1.000'),
    status: PaymentRecordStatus.awaiting_confirmation,
    paymentMethod: PaymentMethod.bank_transfer,
    transactionId: 'TRF-X',
  };

  it('the first payment that settles the quote moves the order on to fabrication', async () => {
    const { service, order } = setup({
      orderStatus: OrderStatus.payment_pending,
      payment: { ...extraInstallment, amount: d('1001.000') },
    });
    await service.confirmBankTransfer('p-extra', undefined, admin);
    expect(order.status).toBe(OrderStatus.fabrication);
  });

  it('a first partial payment on a sent quote moves the order to payment_pending', async () => {
    const { service, tx, order } = setup({
      orderStatus: OrderStatus.quotation_sent,
      installmentAmount: '400.000',
      totalPrice: '1000.000',
    });
    await service.recordCash({ installmentId: 'i-1', caller: admin });
    expect(quoteUpdate(tx).paymentStatus).toBe(
      QuotationPaymentStatus.partially_paid,
    );
    expect(order.status).toBe(OrderStatus.payment_pending);
  });

  it.each(pastPaymentPhase)(
    'an extra installment that settles the quote leaves a %s order as it is',
    async (status) => {
      const { service, tx, events, order } = setup({
        orderStatus: status,
        installmentAmount: '200.000',
        totalPrice: '1200.000',
        payment: extraInstallment,
        settledSum: { amount: '1200.000', withholdingAmount: '0' },
      });

      const settled = await service.confirmBankTransfer(
        'p-extra',
        undefined,
        admin,
      );

      expect(settled.status).toBe(PaymentRecordStatus.success);
      expect(quoteUpdate(tx).paymentStatus).toBe(QuotationPaymentStatus.paid);
      expect(order.status).toBe(status);
      expect(tx.dentalOrder.update).not.toHaveBeenCalled();
      // The notification still names the order.
      expect(events.emit).toHaveBeenCalledWith(
        NotificationEvents.PaymentConfirmed,
        expect.objectContaining({ orderId: 'o-1', orderCode: 'ORD-1' }),
      );
    },
  );

  it.each(pastPaymentPhase)(
    'a partial payment of an extra installment leaves a %s order as it is',
    async (status) => {
      const { service, tx, order } = setup({
        orderStatus: status,
        installmentAmount: '200.000',
        totalPrice: '1400.000',
        settledSum: { amount: '1200.000', withholdingAmount: '0' },
      });

      await service.recordCash({ installmentId: 'i-1', caller: admin });

      expect(quoteUpdate(tx).paymentStatus).toBe(
        QuotationPaymentStatus.partially_paid,
      );
      expect(order.status).toBe(status);
      expect(tx.dentalOrder.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'o-1',
          status: { in: expect.not.arrayContaining([status]) as unknown },
        },
        data: { status: OrderStatus.payment_pending },
      });
    },
  );

  it.each(pastPaymentPhase)(
    'declaring a transfer for an extra installment leaves a %s order out of payment_review',
    async (status) => {
      const { service, tx, order } = setup({ orderStatus: status });

      await service.declareBankTransfer({
        installmentId: 'i-1',
        caller: doctor,
      });

      expect(createdData(tx).status).toBe(
        PaymentRecordStatus.awaiting_confirmation,
      );
      expect(order.status).toBe(status);
    },
  );

  it('declaring a transfer still moves a quote-phase order to payment_review', async () => {
    const { service, order } = setup({
      orderStatus: OrderStatus.payment_pending,
    });
    await service.declareBankTransfer({ installmentId: 'i-1', caller: doctor });
    expect(order.status).toBe(OrderStatus.payment_review);
  });
});

describe('PaymentsService.confirmBankTransfer', () => {
  const awaiting = {
    id: 'p-1',
    amount: d('991.000'),
    withholdingRate: d('1'),
    withholdingAmount: d('10.000'),
    stampAmount: d('1.000'),
    status: PaymentRecordStatus.awaiting_confirmation,
    paymentMethod: PaymentMethod.bank_transfer,
    transactionId: 'TRF-1',
  };

  it('answers 409 INSTALLMENT_ALREADY_PAID instead of cancelling the transfer', async () => {
    const { service, tx } = setup({
      payment: awaiting,
      installmentStatus: InstallmentStatus.paid,
    });
    await expect(
      service.confirmBankTransfer('p-1', undefined, admin),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'INSTALLMENT_ALREADY_PAID',
    });
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.quotation.update).not.toHaveBeenCalled();
  });

  it('a transfer rejected meanwhile (seen under the lock) is not confirmed', async () => {
    const { service, tx } = setup({ payment: awaiting });
    // Outside the lock it still looks awaiting; under it, rejected.
    tx.payment.findUnique.mockImplementation((args: { select?: unknown }) =>
      Promise.resolve(
        args.select
          ? { installmentId: 'i-1' }
          : { ...awaiting, status: PaymentRecordStatus.rejected },
      ),
    );
    await expect(
      service.confirmBankTransfer('p-1', undefined, admin),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.payment.update).not.toHaveBeenCalled();
  });

  it('confirms the declared retenue and stamp as declared', async () => {
    // The stamp setting changed since the declaration: the transfer is
    // confirmed with what was declared, not re-priced.
    const { service, tx, events } = setup({
      payment: awaiting,
      stampDuty: '2',
    });
    await service.confirmBankTransfer('p-1', 'ok', admin);
    const data = tx.payment.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: PaymentRecordStatus.success,
      confirmedById: 'u-admin',
    });
    expect(data).not.toHaveProperty('amount');
    expect(data).not.toHaveProperty('stampAmount');
    expect(quoteUpdate(tx).paymentStatus).toBe(QuotationPaymentStatus.paid);
    expect(events.emit).toHaveBeenCalledWith(
      NotificationEvents.PaymentConfirmed,
      expect.objectContaining({
        amount: '991',
        withholdingAmount: '10',
        stampAmount: '1',
      }),
    );
  });
});

describe('PaymentsService.rejectBankTransfer', () => {
  it('tells the doctor with the declared cash, retenue and stamp', async () => {
    const { service, prisma, events } = setup();
    const declared = {
      id: 'p-1',
      orderId: 'o-1',
      quotationId: 'q-1',
      amount: d('1001.000'),
      withholdingAmount: d('0'),
      stampAmount: d('1.000'),
      status: PaymentRecordStatus.awaiting_confirmation,
      paymentMethod: PaymentMethod.bank_transfer,
    };
    prisma.payment.findUnique.mockResolvedValue(declared as never);
    const update = jest.fn().mockResolvedValue({
      ...declared,
      status: PaymentRecordStatus.rejected,
      order: {
        doctorId: 'u-doc',
        id: 'o-1',
        orderCode: 'ORD-1',
        doctor: { fullName: 'Dr Salma' },
        patient: { fullName: 'Ines' },
      },
      installment: { installmentNumber: 1 },
    });
    (prisma.payment as Record<string, unknown>).update = update;

    await service.rejectBankTransfer('p-1', 'Illegible proof', admin);

    expect(events.emit).toHaveBeenCalledWith(
      NotificationEvents.PaymentRejected,
      expect.objectContaining({
        amount: '1001',
        withholdingAmount: '0',
        stampAmount: '1',
      }),
    );
  });
});

describe('PaymentsService.recordCash (cash and cheque, admin only)', () => {
  it('records a cheque with the retenue: 1 000 + 1 stamp - 10 = 991 received, settled in one transaction', async () => {
    const { service, prisma, tx, events } = setup({ withholdingRate: '1' });

    const payment = await service.recordCash({
      installmentId: 'i-1',
      caller: admin,
      receiptNumber: 'CHQ-0042',
      method: PaymentMethod.cheque,
      applyWithholding: true,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const data = createdData(tx);
    expect(data.paymentMethod).toBe(PaymentMethod.cheque);
    expect((data.amount as Prisma.Decimal).toFixed(3)).toBe('991.000');
    expect((data.withholdingAmount as Prisma.Decimal).toFixed(3)).toBe(
      '10.000',
    );
    expect((data.stampAmount as Prisma.Decimal).toFixed(3)).toBe('1.000');
    expect((data.withholdingRate as Prisma.Decimal).toString()).toBe('1');
    expect(payment.status).toBe(PaymentRecordStatus.success);
    // Settled = 991 + 10 - 1 = the installment: the quote is paid.
    expect((quoteUpdate(tx).paidAmount as Prisma.Decimal).toFixed(3)).toBe(
      '1000.000',
    );
    expect(quoteUpdate(tx).paymentStatus).toBe(QuotationPaymentStatus.paid);
    expect(events.emit).toHaveBeenCalledWith(
      NotificationEvents.CashPaymentRecorded,
      expect.objectContaining({
        method: PaymentMethod.cheque,
        amount: '991',
        withholdingAmount: '10',
        stampAmount: '1',
      }),
    );
  });

  it('cash by default: the installment + the stamp when no retenue is asked for', async () => {
    const { service, tx } = setup();
    await service.recordCash({ installmentId: 'i-1', caller: admin });
    const data = createdData(tx);
    expect(data.paymentMethod).toBe(PaymentMethod.cash);
    expect((data.amount as Prisma.Decimal).toFixed(3)).toBe('1001.000');
    expect((data.stampAmount as Prisma.Decimal).toFixed(3)).toBe('1.000');
    expect((data.withholdingAmount as Prisma.Decimal).toFixed(3)).toBe('0.000');
    expect(data.withholdingRate).toBeNull();
    expect(quoteUpdate(tx).paymentStatus).toBe(QuotationPaymentStatus.paid);
  });

  it('reads the stamp of the active settings at payment time', async () => {
    const { service, tx } = setup({ stampDuty: '0.6' });
    await service.recordCash({ installmentId: 'i-1', caller: admin });
    expect(tx.companyBillingSettings.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { withholdingRate: true, stampDuty: true },
      }),
    );
    expect((createdData(tx).amount as Prisma.Decimal).toFixed(3)).toBe(
      '1000.600',
    );
  });

  it('a dentist can never record cash or a cheque (403)', async () => {
    const { service, prisma } = setup();
    for (const method of [PaymentMethod.cash, PaymentMethod.cheque]) {
      await expect(
        service.recordCash({ installmentId: 'i-1', caller: doctor, method }),
      ).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses another method on this route (400)', async () => {
    const { service, prisma } = setup();
    await expect(
      service.recordCash({
        installmentId: 'i-1',
        caller: admin,
        method: PaymentMethod.card,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'PAYMENT_METHOD_NOT_RECORDABLE',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses while a card attempt or a transfer is in flight (409), under the lock', async () => {
    const { service, tx } = setup({
      inFlight: { paymentMethod: PaymentMethod.bank_transfer },
    });
    await expect(
      service.recordCash({ installmentId: 'i-1', caller: admin }),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'PAYMENT_ATTEMPT_IN_PROGRESS',
    });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('refuses the retenue when the setting is 0 (400 WITHHOLDING_DISABLED)', async () => {
    const { service, tx } = setup({ withholdingRate: '0' });
    await expect(
      service.recordCash({
        installmentId: 'i-1',
        caller: admin,
        applyWithholding: true,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'WITHHOLDING_DISABLED',
    });
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('an installment paid meanwhile is refused under the lock', async () => {
    const { service, prisma, tx } = setup();
    // Payable when loaded (outside), paid once locked (inside).
    const loaded = (await prisma.quoteInstallment.findUnique()) as object;
    tx.quoteInstallment.findUnique.mockResolvedValue({
      ...loaded,
      status: InstallmentStatus.paid,
    });
    await expect(
      service.recordCash({ installmentId: 'i-1', caller: admin }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});

describe('PaymentsService.declareBankTransfer', () => {
  it('stores the cash, the retenue and the stamp the practitioner declared', async () => {
    const { service, tx, events } = setup({ withholdingRate: '1' });
    await service.declareBankTransfer({
      installmentId: 'i-1',
      caller: doctor,
      bankReference: 'TRF-9',
      applyWithholding: true,
    });
    const data = createdData(tx);
    expect(data.status).toBe(PaymentRecordStatus.awaiting_confirmation);
    // 1 000 + 1 stamp - 10 retenue (1 % of 1 000, stamp excluded).
    expect((data.amount as Prisma.Decimal).toFixed(3)).toBe('991.000');
    expect((data.withholdingAmount as Prisma.Decimal).toFixed(3)).toBe(
      '10.000',
    );
    expect((data.stampAmount as Prisma.Decimal).toFixed(3)).toBe('1.000');
    // Emitted after the commit, with the retenue and the stamp.
    expect(events.emit).toHaveBeenCalledWith(
      NotificationEvents.PaymentDeclared,
      expect.objectContaining({
        amount: '991',
        withholdingAmount: '10',
        stampAmount: '1',
      }),
    );
  });

  it('without the retenue the transfer is the installment + the stamp', async () => {
    const { service, tx } = setup();
    await service.declareBankTransfer({ installmentId: 'i-1', caller: doctor });
    const data = createdData(tx);
    expect((data.amount as Prisma.Decimal).toFixed(3)).toBe('1001.000');
    expect((data.stampAmount as Prisma.Decimal).toFixed(3)).toBe('1.000');
    expect(data.withholdingRate).toBeNull();
  });

  it('a re-declaration still replaces the previous one (same kind)', async () => {
    const { service, tx } = setup();
    await service.declareBankTransfer({ installmentId: 'i-1', caller: doctor });
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: {
        installmentId: 'i-1',
        status: PaymentRecordStatus.awaiting_confirmation,
      },
      data: { status: PaymentRecordStatus.cancelled },
    });
    expect(tx.payment.findFirst.mock.calls[0][0].where.paymentMethod).toEqual({
      in: [PaymentMethod.card],
    });
  });

  it('refuses while a card attempt is in flight (409), before anything is written', async () => {
    const { service, tx, events } = setup({
      inFlight: { paymentMethod: PaymentMethod.card },
    });
    await expect(
      service.declareBankTransfer({ installmentId: 'i-1', caller: doctor }),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'PAYMENT_ATTEMPT_IN_PROGRESS',
    });
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
});
