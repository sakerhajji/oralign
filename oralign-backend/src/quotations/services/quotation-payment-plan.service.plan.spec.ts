import {
  BatchStatus,
  InstallmentStatus,
  PaymentMode,
  PaymentRecordStatus,
  Prisma,
  QuotationPaymentStatus,
  QuotationStatus,
  UserRole,
} from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import type { PackService } from '../../packs/services/pack.service';
import type { LoyaltyService } from '../../loyalty/services/loyalty.service';
import type { CompanyBillingSettingsService } from './company-billing-settings.service';
import type { QuotationPdfService } from './quotation-pdf.service';
import type { ConfigurePaymentPlanDto } from '../dto/quotation.dto';
import { QUOTE_ERROR } from '../quote-money';

// The PDF renderer pulls in puppeteer (ESM-only); refreshStoredPdf is stubbed.
jest.mock('./quotation-pdf.service', () => ({
  QuotationPdfService: class QuotationPdfService {},
}));

import { QuotationPaymentPlanService } from './quotation-payment-plan.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const D = (v: string | number) => new Prisma.Decimal(v);

const baseQuote = {
  id: 'q-1',
  orderId: 'o-1',
  quotationNumber: 'DEV-000001',
  status: QuotationStatus.approved as QuotationStatus,
  deletedAt: null,
  packId: 'p-1',
  packName: 'Pack Confort',
  totalPrice: D('2000.000'),
  totalTtc: 2000,
  maxStepsPerArch: 40,
  isUnlimitedSteps: false,
  paymentStatus: QuotationPaymentStatus.partially_paid as QuotationPaymentStatus,
  pdfFilePath: null,
  companySnapshot: null,
};

const installment = (
  n: number,
  amount: string,
  steps: [number, number],
  status: InstallmentStatus = InstallmentStatus.pending,
  inFlight = false,
) => ({
  id: `i-${n}`,
  installmentNumber: n,
  amount: D(amount),
  status,
  stepBatch: {
    id: `b-${n}`,
    batchNumber: n,
    fromStep: steps[0],
    toStep: steps[1],
    status: status === InstallmentStatus.paid ? BatchStatus.unlocked : BatchStatus.locked,
  },
  payments: inFlight ? [{ id: `pay-${n}` }] : [],
});

const success = (amount: string) => ({
  quotationId: 'q-1',
  status: PaymentRecordStatus.success,
  _sum: { amount: D(amount), withholdingAmount: D(0) },
  _count: { _all: 1 },
});

type InstallmentRow = Omit<ReturnType<typeof installment>, 'stepBatch'> & {
  stepBatch: ReturnType<typeof installment>['stepBatch'] | null;
};

function world(args: {
  quote?: Partial<typeof baseQuote>;
  installments?: InstallmentRow[];
  payments?: ReturnType<typeof success>[];
}) {
  const quote = { ...baseQuote, ...args.quote };
  let created = 0;
  const db = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
    quotation: {
      findUnique: jest.fn(({ include }: { include?: object }) =>
        Promise.resolve(
          include
            ? {
                ...quote,
                installments: args.installments ?? [],
                order: { doctorId: 'u-doc' },
              }
            : quote,
        ),
      ),
      update: jest.fn(({ data }: { data: object }) =>
        Promise.resolve({ ...quote, ...data }),
      ),
    },
    quoteInstallment: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(({ data }: { data: object }) =>
        Promise.resolve({ id: `new-${++created}`, ...data }),
      ),
    },
    quoteStepBatch: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
      // The response's freeStepsForReplan: batches of the kept rows.
      findMany: jest.fn(() =>
        Promise.resolve(
          (args.installments ?? [])
            .filter(
              (row) =>
                row.status === InstallmentStatus.paid ||
                row.status === InstallmentStatus.cancelled,
            )
            .map((row) => ({ quotationId: 'q-1', ...row.stepBatch })),
        ),
      ),
    },
    payment: { groupBy: jest.fn().mockResolvedValue(args.payments ?? []) },
    dentalOrder: {
      findUnique: jest.fn().mockResolvedValue({ status: 'payment_pending' }),
      update: jest.fn().mockResolvedValue({}),
    },
    orderAuditLog: {
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(args.data),
      ),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin' }) },
  };
  db.$transaction.mockImplementation((run: (tx: typeof db) => unknown) =>
    run(db),
  );
  const pdf = { refreshStoredPdf: jest.fn((q: unknown) => Promise.resolve(q)) };
  const packs = {
    getActivePriceForQuote: jest.fn().mockResolvedValue({
      pack: {
        id: 'p-2',
        name: 'Pack Premium',
        maxStepsPerArch: 60,
        includedCorrections: 2,
        treatmentValidityMonths: 18,
        isUnlimitedSteps: false,
        isUnlimitedCorrections: false,
        isForOrthodontists: false,
      },
      price: { price: D('2380.000'), currency: 'TND' },
    }),
  };
  const loyalty = {
    activeRewardFor: jest.fn().mockResolvedValue({
      discountPercent: 0,
      sourceYear: null,
      sourceQuarter: null,
    }),
  };
  const service = new QuotationPaymentPlanService(
    db as unknown as PrismaService,
    {} as OrderAccessPolicy,
    packs as unknown as PackService,
    loyalty as unknown as LoyaltyService,
    { emit: jest.fn() } as unknown as EventEmitter2,
    {
      getActive: jest.fn().mockResolvedValue({ defaultTvaRate: 19 }),
    } as unknown as CompanyBillingSettingsService,
    pdf as unknown as QuotationPdfService,
  );
  return { service, db, pdf };
}

/** The error a refused call rejects with; fails the test when it resolves. */
async function refusal(
  call: Promise<unknown>,
): Promise<{ statusCode?: number; errorCode?: string; message: string }> {
  try {
    await call;
  } catch (err) {
    return err as { statusCode?: number; errorCode?: string; message: string };
  }
  throw new Error('expected a refusal');
}

const plan = (
  paymentMode: PaymentMode,
  rows: Array<[number, number, number]>,
): ConfigurePaymentPlanDto => ({
  paymentMode,
  installments: rows.map(([amount, fromStep, toStep]) => ({
    amount,
    batch: { fromStep, toStep },
  })),
});

describe('QuotationPaymentPlanService.configurePaymentPlan — paid installments are kept', () => {
  const paidFirst = () => [
    installment(1, '600.000', [1, 10], InstallmentStatus.paid),
    installment(2, '700.000', [11, 20]),
    installment(3, '700.000', [21, 30]),
  ];

  it('replaces only the unpaid rows and numbers the new ones after the kept row', async () => {
    const { service, db } = world({
      installments: paidFirst(),
      payments: [success('600.000')],
    });

    await service.configurePaymentPlan(
      'q-1',
      plan(PaymentMode.installments, [
        [400, 11, 15],
        [500, 16, 25],
        [500, 26, 40],
      ]),
      admin,
    );

    expect(db.quoteStepBatch.deleteMany).toHaveBeenCalledWith({
      where: { installmentId: { in: ['i-2', 'i-3'] } },
    });
    expect(db.quoteInstallment.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['i-2', 'i-3'] } },
    });
    const numbers = db.quoteInstallment.create.mock.calls.map(
      ([a]) => (a as { data: { installmentNumber: number } }).data.installmentNumber,
    );
    expect(numbers).toEqual([2, 3, 4]);
    const batches = db.quoteStepBatch.create.mock.calls.map(
      ([a]) => (a as { data: { batchNumber: number } }).data.batchNumber,
    );
    expect(batches).toEqual([2, 3, 4]);
    const data = (db.quotation.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    }).data;
    expect(data.paymentMode).toBe(PaymentMode.installments);
    expect((data.paidAmount as Prisma.Decimal).toFixed(3)).toBe('600.000');
    expect(data.paymentStatus).toBe(QuotationPaymentStatus.partially_paid);
    const audit = db.orderAuditLog.create.mock.calls[0][0];
    expect(audit.data).toMatchObject({
      action: 'quotation_updated',
      metadata: { kind: 'plan', keptInstallments: [1] },
    });
  });

  it('accepts the balance as a single FULL_PAYMENT row once rows are paid', async () => {
    const { service, db } = world({
      installments: paidFirst(),
      payments: [success('600.000')],
    });

    await service.configurePaymentPlan(
      'q-1',
      plan(PaymentMode.full_payment, [[1400, 11, 40]]),
      admin,
    );

    expect(db.quoteInstallment.create).toHaveBeenCalledTimes(1);
  });

  it('checks the new rows against what is left to pay, not the full total', async () => {
    const { service, db } = world({
      installments: paidFirst(),
      payments: [success('600.000')],
    });

    const err = await refusal(
      service.configurePaymentPlan(
        'q-1',
        plan(PaymentMode.installments, [
          [1000, 11, 20],
          [1000, 21, 30],
        ]),
        admin,
      ),
    );
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('what is left to pay 1400');
    expect(db.quoteInstallment.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses a new range overlapping a paid batch', async () => {
    const { service, db } = world({
      installments: paidFirst(),
      payments: [success('600.000')],
    });

    const err = await refusal(
      service.configurePaymentPlan(
        'q-1',
        plan(PaymentMode.installments, [
          [700, 8, 20],
          [700, 21, 30],
        ]),
        admin,
      ),
    );
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain(
      'overlap the kept installment #1 (paid, steps 1–10)',
    );
    expect(db.quoteInstallment.create).not.toHaveBeenCalled();
  });

  /**
   * #1 paid (steps 1-10); a total edit cancelled #2 (steps 11-20, its
   * aligners released) and a later raise added #3 with no batch.
   */
  const cancelledSecond = (): InstallmentRow[] => [
    installment(1, '600.000', [1, 10], InstallmentStatus.paid),
    installment(2, '0.000', [11, 20], InstallmentStatus.cancelled),
    { ...installment(3, '400.000', [0, 0]), stepBatch: null },
  ];

  it('keeps a cancelled row and its batch, and names it as kept, not paid', async () => {
    const { service, db } = world({
      quote: { totalPrice: D('1000.000'), totalTtc: 1000 },
      installments: cancelledSecond(),
      payments: [success('600.000')],
    });

    const err = await refusal(
      service.configurePaymentPlan(
        'q-1',
        plan(PaymentMode.full_payment, [[400, 15, 40]]),
        admin,
      ),
    );
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain(
      'overlap the kept installment #2 (cancelled, steps 11–20)',
    );
    expect(err.message).not.toContain('paid installment');
    expect(db.quoteInstallment.deleteMany).not.toHaveBeenCalled();
  });

  it('re-plans the open row after the kept ones, on the steps they leave free', async () => {
    const { service, db } = world({
      quote: { totalPrice: D('1000.000'), totalTtc: 1000 },
      installments: cancelledSecond(),
      payments: [success('600.000')],
    });

    const result = await service.configurePaymentPlan(
      'q-1',
      plan(PaymentMode.full_payment, [[400, 21, 40]]),
      admin,
    );

    // Only the open #3 goes; the cancelled #2 is not re-numbered over.
    expect(db.quoteInstallment.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['i-3'] } },
    });
    const created = db.quoteInstallment.create.mock.calls[0][0] as {
      data: { installmentNumber: number };
    };
    expect(created.data.installmentNumber).toBe(3);
    expect(result).toMatchObject({ freeStepsForReplan: true });
  });

  it('refuses up front once the kept batches hold every pack step', async () => {
    const { service, db } = world({
      quote: { totalPrice: D('1000.000'), totalTtc: 1000, maxStepsPerArch: 20 },
      installments: cancelledSecond(),
      payments: [success('600.000')],
    });

    const err = await refusal(
      service.configurePaymentPlan(
        'q-1',
        plan(PaymentMode.full_payment, [[400, 15, 20]]),
        admin,
      ),
    );
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('No step is left for a new installment');
    expect(err.message).toContain('kept (paid or cancelled)');
    expect(db.quoteInstallment.deleteMany).not.toHaveBeenCalled();
  });

  it('words the count and total refusals with kept installments', async () => {
    const { service } = world({
      installments: paidFirst(),
      payments: [success('600.000')],
    });
    const shape = await refusal(
      service.configurePaymentPlan(
        'q-1',
        plan(PaymentMode.full_payment, [
          [700, 11, 20],
          [700, 21, 30],
        ]),
        admin,
      ),
    );
    expect(shape.message).toContain('kept (paid or cancelled) installments');

    const covered = world({
      quote: { totalPrice: D('600.000'), totalTtc: 600 },
      installments: [
        installment(1, '600.000', [1, 10], InstallmentStatus.paid),
        installment(2, '0.000', [11, 20], InstallmentStatus.cancelled),
      ],
      payments: [success('600.000')],
    });
    const nothingLeft = await refusal(
      covered.service.configurePaymentPlan(
        'q-1',
        plan(PaymentMode.full_payment, [[1, 21, 30]]),
        admin,
      ),
    );
    expect(nothingLeft.message).toContain(
      'kept (paid or cancelled) installments already cover the total',
    );
  });

  it('refuses while an unpaid installment has a payment in flight (409)', async () => {
    const { service, db } = world({
      installments: [
        installment(1, '600.000', [1, 10], InstallmentStatus.paid),
        installment(2, '1400.000', [11, 30], InstallmentStatus.pending, true),
      ],
      payments: [success('600.000')],
    });

    await expect(
      service.configurePaymentPlan(
        'q-1',
        plan(PaymentMode.installments, [
          [700, 11, 20],
          [700, 21, 30],
        ]),
        admin,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: QUOTE_ERROR.PAYMENT_IN_FLIGHT,
    });
    expect(db.quoteInstallment.deleteMany).not.toHaveBeenCalled();
  });

  it('behaves as before without a paid row: the plan covers the whole total', async () => {
    const { service, db } = world({
      quote: {
        status: QuotationStatus.draft,
        paymentStatus: QuotationPaymentStatus.pending,
      },
      installments: [installment(1, '2000.000', [1, 40])],
    });

    await service.configurePaymentPlan(
      'q-1',
      plan(PaymentMode.full_payment, [[2000, 1, 40]]),
      admin,
    );

    const created = db.quoteInstallment.create.mock.calls[0][0] as {
      data: { installmentNumber: number };
    };
    expect(created.data.installmentNumber).toBe(1);
    const data = (db.quotation.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    }).data;
    expect(data.paymentMode).toBe(PaymentMode.full_payment);
    // A draft is not in the order history.
    expect(db.orderAuditLog.create).not.toHaveBeenCalled();
  });

  it('still refuses a rejected quote', async () => {
    const { service } = world({ quote: { status: QuotationStatus.rejected } });

    await expect(
      service.configurePaymentPlan(
        'q-1',
        plan(PaymentMode.full_payment, [[2000, 1, 40]]),
        admin,
      ),
    ).rejects.toMatchObject({ errorCode: QUOTE_ERROR.NOT_EDITABLE });
  });
});

describe('QuotationPaymentPlanService.attachPack — TTC price, real TVA', () => {
  it('stores the company TVA rate and splits HT / TVA backwards from the net', async () => {
    const { service, db } = world({
      quote: {
        status: QuotationStatus.sent,
        paymentStatus: QuotationPaymentStatus.pending,
      },
    });

    const result = await service.attachPack('q-1', { packId: 'p-2' }, admin);

    const data = (db.quotation.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    }).data;
    expect(data).toMatchObject({
      tvaRate: 19,
      subTotalHt: 2000,
      tvaAmount: 380,
      totalTtc: 2380,
      treatmentFees: 2380,
    });
    expect((data.totalPrice as Prisma.Decimal).toFixed(3)).toBe('2380.000');
    expect(db.quoteInstallment.deleteMany).toHaveBeenCalled();
    expect(result).toMatchObject({ canDelete: true, canRecall: true });
  });

  it('refuses once money was received, at any status (409)', async () => {
    const { service, db } = world({
      quote: { status: QuotationStatus.approved },
      payments: [success('600.000')],
    });

    await expect(
      service.attachPack('q-1', { packId: 'p-2' }, admin),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: QUOTE_ERROR.PAYMENT_RECEIVED,
    });
    expect(db.quoteInstallment.deleteMany).not.toHaveBeenCalled();
  });
});
