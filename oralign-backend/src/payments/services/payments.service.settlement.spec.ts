import {
  BatchStatus,
  BatchUnlockSource,
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

// The batch projection has its own spec; here only the D2 unlock hook's
// wiring matters: when it runs, in which transaction, after which write.
jest.mock('../../production/production-batch-projection', () => ({
  projectBatches: jest.fn().mockResolvedValue(undefined),
}));

// The receipt checks and storage have their own spec (receipt-file.spec):
// here a receipt is accepted and "written" without touching the disk.
jest.mock('../receipt-file', () => ({
  assertReceiptFile: jest
    .fn()
    .mockResolvedValue({ kind: 'pdf', ext: 'pdf', mime: 'application/pdf' }),
  writeReceiptFile: jest
    .fn()
    .mockResolvedValue('/uploads/orders/o-1/payment-proofs/r.pdf'),
  removeReceiptFile: jest.fn().mockResolvedValue(undefined),
  openReceipt: jest.fn(),
}));

import type { QuotationService } from '../../quotations/services/quotation.service';
import { NotificationEvents } from '../../notifications/events/notification-events';
import { projectBatches } from '../../production/production-batch-projection';
import { removeReceiptFile } from '../receipt-file';
import { CHARGE_SETTINGS_SELECT } from './payment-rules';
import { PaymentsService, settledTotal } from './payments.service';

const project = jest.mocked(projectBatches);
const removed = jest.mocked(removeReceiptFile);
beforeEach(() => {
  project.mockClear();
  removed.mockClear();
});

/** A receipt as multer hands it over (its checks are mocked above). */
const receipt = { buffer: Buffer.from('%PDF-1.4 receipt'), size: 16 };
/** The stored path of a transfer that has its receipt. */
const PROOF = '/uploads/orders/o-1/payment-proofs/r.pdf';

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
  /** The installment's step batch (none by default). */
  stepBatch?: { id: string; status: BatchStatus } | null;
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
    stepBatch: options.stepBatch ?? null,
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

  const chargeSettings = {
    withholdingRate: d(options.withholdingRate ?? '1'),
    stampDuty: d(options.stampDuty ?? '1'),
    // The retenue switched on, no threshold (P-D1's rule).
    withholdingEnabled: true,
    withholdingThreshold: d('0'),
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    quoteInstallment: {
      findUnique: jest.fn().mockResolvedValue(installment),
      update: jest.fn(),
    },
    // The step batch as production/batch-unlock.ts reads and guards it.
    quoteStepBatch: {
      findUnique: jest.fn(() =>
        Promise.resolve(
          options.stepBatch
            ? {
                id: options.stepBatch.id,
                quotationId: 'q-1',
                installmentId: 'i-1',
                batchNumber: 1,
                fromStep: 1,
                toStep: 4,
                status: options.stepBatch.status,
                quotation: { orderId: 'o-1' },
                installment: { installmentNumber: 1 },
              }
            : null,
        ),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin One' }),
    },
    orderAuditLog: { create: jest.fn().mockResolvedValue({ id: 'a-1' }) },
    companyBillingSettings: {
      findFirst: jest.fn().mockResolvedValue(chargeSettings),
    },
    payment: {
      findFirst: jest.fn().mockResolvedValue(options.inFlight ?? null),
      // The declarations a new one supersedes (none by default), and the
      // transfers still awaiting on the order once one is refused.
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
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
          where: { id: string; status?: OrderStatus | { in: OrderStatus[] } };
          data: Partial<typeof order>;
        }) => {
          const status = where.status;
          const hit =
            where.id === order.id &&
            (!status ||
              (typeof status === 'string'
                ? status === order.status
                : status.in.includes(order.status)));
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
      // The unlocked pre-checks before the quote is accepted read the same
      // in-flight state as the locked ones.
      findFirst: tx.payment.findFirst,
    },
    // The actor's name snapshot of the audit rows.
    user: {
      findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin One' }),
    },
    companyBillingSettings: {
      // Bank details for the transfer path, the charge settings for the
      // retenue pre-check.
      findFirst: jest.fn().mockResolvedValue({
        ...chargeSettings,
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
  return { service, prisma, tx, events, order, quotations };
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
        proofUrl: PROOF,
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
    proofUrl: PROOF,
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
        receipt,
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
    await service.declareBankTransfer({
      installmentId: 'i-1',
      caller: doctor,
      receipt,
    });
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
    proofUrl: PROOF,
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

  it('a transfer rejected meanwhile (seen under the lock) is a 409 TRANSFER_ALREADY_PROCESSED', async () => {
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
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'TRANSFER_ALREADY_PROCESSED',
    });
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.orderAuditLog.create).not.toHaveBeenCalled();
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
  it('tells the doctor with the declared cash, retenue and stamp, and the reason', async () => {
    const declared = {
      id: 'p-1',
      orderId: 'o-1',
      quotationId: 'q-1',
      installmentId: 'i-1',
      amount: d('1001.000'),
      withholdingAmount: d('0'),
      stampAmount: d('1.000'),
      currency: 'TND',
      status: PaymentRecordStatus.awaiting_confirmation,
      paymentMethod: PaymentMethod.bank_transfer,
      proofUrl: PROOF,
    };
    const { service, tx, events } = setup({ payment: declared });
    tx.payment.updateMany.mockResolvedValue({ count: 1 });
    tx.payment.findUnique.mockResolvedValue({
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

    await service.rejectBankTransfer('p-1', '  Illegible proof  ', admin);

    expect(events.emit).toHaveBeenCalledWith(
      NotificationEvents.PaymentRejected,
      expect.objectContaining({
        amount: '1001',
        withholdingAmount: '0',
        stampAmount: '1',
        rejectionReason: 'Illegible proof',
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
        // The one charge-settings read (payment-rules.ts).
        select: CHARGE_SETTINGS_SELECT,
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

  it('refuses while a card attempt or a transfer is in flight (409), before the quote is accepted', async () => {
    const { service, tx, quotations } = setup({
      inFlight: { paymentMethod: PaymentMethod.bank_transfer },
    });
    await expect(
      service.recordCash({ installmentId: 'i-1', caller: admin }),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'PAYMENT_ATTEMPT_IN_PROGRESS',
    });
    expect(quotations.approveOnFirstPayment).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('an attempt opened meanwhile is still refused under the lock (409)', async () => {
    const { service, tx } = setup();
    tx.payment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ paymentMethod: PaymentMethod.card });
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
      receipt,
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
    await service.declareBankTransfer({
      installmentId: 'i-1',
      caller: doctor,
      receipt,
    });
    const data = createdData(tx);
    expect((data.amount as Prisma.Decimal).toFixed(3)).toBe('1001.000');
    expect((data.stampAmount as Prisma.Decimal).toFixed(3)).toBe('1.000');
    expect(data.withholdingRate).toBeNull();
  });

  it('a re-declaration still replaces the previous one (same kind), stamped as superseded', async () => {
    const { service, tx, events } = setup();
    tx.payment.findMany.mockResolvedValue([{ id: 'p-old' }]);
    await service.declareBankTransfer({
      installmentId: 'i-1',
      caller: doctor,
      receipt,
    });
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['p-old'] },
        status: PaymentRecordStatus.awaiting_confirmation,
      },
      data: {
        status: PaymentRecordStatus.cancelled,
        cancelledAt: expect.any(Date) as unknown,
        cancelledById: 'u-doc',
        cancelledByName: 'Admin One',
      },
    });
    expect(
      (
        tx.payment.findFirst.mock.calls[0] as unknown as [
          { where: { paymentMethod: unknown } },
        ]
      )[0].where.paymentMethod,
    ).toEqual({
      in: [PaymentMethod.card],
    });
    expect(events.emit).toHaveBeenCalledWith(
      NotificationEvents.PaymentSuperseded,
      expect.objectContaining({
        subjectKey: 'installment:p-old',
        replacedBySubjectKey: 'installment:p-new',
      }),
    );
  });

  it('refuses while a card attempt is in flight (409), before anything is written', async () => {
    const { service, tx, events, quotations } = setup({
      inFlight: { paymentMethod: PaymentMethod.card },
    });
    await expect(
      service.declareBankTransfer({
        installmentId: 'i-1',
        caller: doctor,
        receipt,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'PAYMENT_ATTEMPT_IN_PROGRESS',
    });
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
    // Refused before the quote is accepted and before the disk.
    expect(quotations.approveOnFirstPayment).not.toHaveBeenCalled();
    expect(removed).not.toHaveBeenCalled();
  });

  it('a card attempt opened meanwhile is refused under the lock, the written receipt unlinked', async () => {
    const { service, tx } = setup();
    tx.payment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ paymentMethod: PaymentMethod.card });
    await expect(
      service.declareBankTransfer({
        installmentId: 'i-1',
        caller: doctor,
        receipt,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'PAYMENT_ATTEMPT_IN_PROGRESS',
    });
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(removed).toHaveBeenCalledWith(PROOF);
  });
});

describe('the D2 unlock hook: a paid installment re-projects its batches', () => {
  const settle = (stepBatch: { id: string; status: BatchStatus } | null) => {
    const world = setup({ stepBatch });
    return {
      ...world,
      run: () =>
        world.service.recordCash({ installmentId: 'i-1', caller: admin }),
    };
  };

  it('unlocks the locked batch, THEN projects the order in the same transaction, attributed to nobody', async () => {
    const { tx, run } = settle({ id: 'b-1', status: BatchStatus.locked });

    await run();

    // The guarded write of production/batch-unlock.ts, journaled with the
    // source and the admin who recorded the cash.
    expect(tx.quoteStepBatch.updateMany).toHaveBeenCalledWith({
      where: { id: 'b-1', status: BatchStatus.locked },
      data: {
        status: BatchStatus.unlocked,
        unlockedAt: expect.any(Date) as unknown,
        unlockedById: 'u-admin',
        unlockedByName: 'Admin One',
        unlockSource: BatchUnlockSource.payment,
        unlockReason: null,
      },
    });
    expect(project).toHaveBeenCalledTimes(1);
    // The transaction client, never the root client; null = the author of
    // the deliveries (the payer delivered nothing).
    expect(project).toHaveBeenCalledWith(tx, { orderId: 'o-1', actorId: null });
    // After the unlock: a projection before it would still see the batch locked.
    expect(project.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.quoteStepBatch.updateMany.mock.invocationCallOrder[0],
    );
  });

  it('the unlock belongs to the paid installment: unlocked at the payment instant, journaled with the payment', async () => {
    const { tx, run, events } = settle({
      id: 'b-1',
      status: BatchStatus.locked,
    });

    await run();

    const unlockedAt = (
      tx.quoteStepBatch.updateMany.mock.calls[0] as unknown as [
        { data: { unlockedAt: Date } },
      ]
    )[0].data.unlockedAt;
    const paidAt = (
      tx.quoteInstallment.update.mock.calls[0] as unknown as [
        { data: { paidAt: Date } },
      ]
    )[0].data.paidAt;
    expect(unlockedAt).toBe(paidAt);
    const audit = (
      tx.orderAuditLog.create.mock.calls[0] as unknown as [
        { data: Record<string, unknown> },
      ]
    )[0].data;
    expect(audit).toMatchObject({
      orderId: 'o-1',
      action: 'batch_unlocked',
      actorId: 'u-admin',
      paymentId: 'p-new',
      metadata: { batchId: 'b-1', source: 'payment', installmentNumber: 1 },
    });
    // The post-commit event says what released the steps.
    expect(events.emit).toHaveBeenCalledWith(
      NotificationEvents.BatchUnlocked,
      expect.objectContaining({
        batchId: 'b-1',
        source: BatchUnlockSource.payment,
        paymentId: 'p-new',
        installmentNumber: 1,
      }),
    );
  });

  it('a card settlement unlocks as the system (no admin confirmed it)', async () => {
    const world = setup({
      stepBatch: { id: 'b-1', status: BatchStatus.locked },
      payment: {
        id: 'p-card',
        status: PaymentRecordStatus.pending,
        paymentMethod: PaymentMethod.card,
        amount: d('1001'),
        stampAmount: d('1'),
      },
    });

    await world.service.handleSuccess({
      paymentId: 'p-card',
      transactionId: 'tx-1',
      actor: doctor,
    });

    expect(
      (
        world.tx.quoteStepBatch.updateMany.mock.calls[0] as unknown as [
          { data: Record<string, unknown> },
        ]
      )[0],
    ).toMatchObject({
      data: { unlockedById: null, unlockedByName: null },
    });
    expect(
      (
        world.tx.orderAuditLog.create.mock.calls[0] as unknown as [
          { data: Record<string, unknown> },
        ]
      )[0].data,
    ).toMatchObject({ actorId: null, actorRole: null, paymentId: 'p-card' });
  });

  it.each([BatchStatus.unlocked, BatchStatus.delivered])(
    'a batch already %s is left alone: no unlock, no projection, no journal row',
    async (status) => {
      const { tx, run, events } = settle({ id: 'b-1', status });
      await run();
      expect(tx.quoteStepBatch.updateMany).not.toHaveBeenCalled();
      expect(project).not.toHaveBeenCalled();
      expect(tx.orderAuditLog.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalledWith(
        NotificationEvents.BatchUnlocked,
        expect.anything(),
      );
    },
  );

  it('an installment without a step batch projects nothing', async () => {
    const { tx, run } = settle(null);
    await run();
    expect(tx.quoteStepBatch.updateMany).not.toHaveBeenCalled();
    expect(project).not.toHaveBeenCalled();
  });
});
