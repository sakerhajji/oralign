import {
  DevisLanguage,
  InstallmentStatus,
  OrderStatus,
  PaymentRecordStatus,
  Prisma,
  type Quotation,
  QuotationPaymentStatus,
  QuotationStatus,
  UserRole,
} from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrderAccessPolicy } from '../../common/access/order-access.policy';
import type { Caller } from '../../common/access/caller';
import type { CompanyBillingSettingsService } from './company-billing-settings.service';
import type { QuotationPaymentPlanService } from './quotation-payment-plan.service';
import type { QuotationPdfService } from './quotation-pdf.service';
import { DEAD_PAYMENT_STATUSES, QUOTE_ERROR } from '../quote-money';

// The PDF renderer pulls in puppeteer (ESM-only); refreshStoredPdf is stubbed.
jest.mock('./quotation-pdf.service', () => ({
  QuotationPdfService: class QuotationPdfService {},
}));

import { QuotationService } from './quotation.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const D = (v: string | number) => new Prisma.Decimal(v);

/** An approved pack quote: 2000 TTC, installment 1 (600) paid. */
function packQuote(overrides: Partial<Quotation> = {}): Quotation {
  return {
    id: 'q-1',
    orderId: 'o-1',
    quotationNumber: 'DEV-000001',
    language: DevisLanguage.fr,
    status: QuotationStatus.approved,
    treatmentFees: 2380,
    fabricationFees: 0,
    deliveryFees: 0,
    discountAmount: 380,
    subTotalHt: 1680.672,
    tvaRate: 19,
    tvaAmount: 319.328,
    totalTtc: 2000,
    currency: 'TND',
    notes: null,
    adminMessage: null,
    companySnapshot: { companyName: 'Oralign' },
    clinicSnapshot: {},
    pdfFilePath: 'orders/o-1/quotes/dev-000001.pdf',
    sentAt: new Date('2026-11-01'),
    approvedAt: new Date('2026-11-02'),
    rejectedAt: null,
    rejectionReason: null,
    createdById: 'u-admin',
    createdByName: 'Admin',
    approvedById: 'u-doc',
    rejectedById: null,
    createdAt: new Date('2026-11-01'),
    updatedAt: new Date('2026-11-02'),
    deletedAt: null,
    packId: 'p-1',
    packName: 'Pack Confort',
    archType: null,
    maxStepsPerArch: 30,
    includedCorrections: 1,
    treatmentValidityMonths: 12,
    isUnlimitedSteps: false,
    isUnlimitedCorrections: false,
    isForOrthodontists: false,
    totalPrice: D('2000.000'),
    paidAmount: D('600.000'),
    remainingAmount: D('1400.000'),
    loyaltyDiscountPercent: null,
    loyaltyDiscountAmount: null,
    loyaltySourceYear: null,
    loyaltySourceQuarter: null,
    paymentMode: 'installments',
    paymentStatus: QuotationPaymentStatus.partially_paid,
    doctorApprovedAt: new Date('2026-11-02'),
    ...overrides,
  } as Quotation;
}

const installment = (
  n: number,
  amount: string,
  status: InstallmentStatus = InstallmentStatus.pending,
  inFlight = false,
) => ({
  id: `i-${n}`,
  quotationId: 'q-1',
  installmentNumber: n,
  amount: D(amount),
  status,
  payments: inFlight ? [{ id: `pay-${n}` }] : [],
});

const group = (status: PaymentRecordStatus, amount: string, count = 1) => ({
  quotationId: 'q-1',
  status,
  _sum: { amount: D(amount), withholdingAmount: D(0) },
  _count: { _all: count },
});

function world(args: {
  quote: Quotation;
  installments?: ReturnType<typeof installment>[];
  payments?: ReturnType<typeof group>[];
  orderStatus?: OrderStatus;
  keptBatches?: Array<{
    quotationId: string;
    fromStep: number;
    toStep: number;
  }>;
}) {
  const db = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
    quotation: {
      findUnique: jest.fn(({ include }: { include?: object }) =>
        Promise.resolve(
          include
            ? { ...args.quote, installments: args.installments ?? [] }
            : args.quote,
        ),
      ),
      update: jest.fn(({ data }: { data: object }) =>
        Promise.resolve({ ...args.quote, ...data }),
      ),
      delete: jest.fn().mockResolvedValue(args.quote),
    },
    quoteInstallment: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    },
    quoteStepBatch: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      // The kept batches the response's freeStepsForReplan is read from.
      findMany: jest.fn().mockResolvedValue(args.keptBatches ?? []),
    },
    payment: {
      groupBy: jest.fn().mockResolvedValue(args.payments ?? []),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    dentalOrder: {
      findUnique: jest.fn().mockResolvedValue({
        status: args.orderStatus ?? OrderStatus.payment_pending,
        doctorId: 'u-doc',
        orderCode: 'ORD-1',
        doctor: { fullName: 'Dr Doc' },
        patient: { fullName: 'Patient' },
      }),
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
  const pdf = {
    refreshStoredPdf: jest.fn((q: Quotation) => Promise.resolve(q)),
    deleteStoredPdf: jest.fn().mockResolvedValue(undefined),
  };
  const events = { emit: jest.fn() };
  const service = new QuotationService(
    db as unknown as PrismaService,
    {
      requireReadable: jest.fn().mockResolvedValue({ id: 'o-1', doctorId: 'u-doc' }),
    } as unknown as OrderAccessPolicy,
    {
      getActive: jest.fn().mockResolvedValue({ defaultTvaRate: 19 }),
    } as unknown as CompanyBillingSettingsService,
    {} as QuotationPaymentPlanService,
    pdf as unknown as QuotationPdfService,
    events as unknown as EventEmitter2,
  );
  return { service, db, pdf, events };
}

const updateData = (db: ReturnType<typeof world>['db']) =>
  (db.quotation.update.mock.calls[0][0] as { data: Record<string, unknown> })
    .data;

describe('QuotationService.computeTotals — prices are TTC', () => {
  it('splits HT and TVA backwards from the TTC price, never adding TVA on top', () => {
    expect(QuotationService.computeTotals(2380, 0, 0, 0, 19)).toEqual({
      subTotalHt: 2000,
      tvaAmount: 380,
      totalTtc: 2380,
    });
  });

  it('takes the discount off the TTC and keeps HT + TVA = TTC to the millime', () => {
    const totals = QuotationService.computeTotals(2380, 0, 30, 238, 19);
    expect(totals.totalTtc).toBe(2172);
    expect(totals.subTotalHt).toBe(1825.21);
    expect(
      Math.round((totals.subTotalHt + totals.tvaAmount) * 1000) / 1000,
    ).toBe(2172);
  });

  it('caps the discount at the gross and ignores negative fees', () => {
    expect(QuotationService.computeTotals(100, -50, 0, 500, 19)).toEqual({
      subTotalHt: 0,
      tvaAmount: 0,
      totalTtc: 0,
    });
  });
});

describe('QuotationService.update — remise typed as a percentage', () => {
  it('derives the remise from the percentage and keeps the percentage', async () => {
    const { service, db } = world({
      quote: packQuote({ status: QuotationStatus.draft, paidAmount: D(0) }),
      installments: [],
      payments: [],
    });

    await service.update('q-1', { discountPercent: 10 }, admin);

    const data = updateData(db);
    expect(data).toMatchObject({ discountAmount: 238, totalTtc: 2142 });
    expect((data.discountPercent as Prisma.Decimal).toFixed(2)).toBe('10.00');
  });

  it('an amount typed by hand clears the percentage', async () => {
    const { service, db } = world({
      quote: packQuote({ status: QuotationStatus.draft, paidAmount: D(0) }),
      installments: [],
      payments: [],
    });

    await service.update('q-1', { discountAmount: 100 }, admin);

    expect(updateData(db)).toMatchObject({
      discountAmount: 100,
      discountPercent: null,
      totalTtc: 2280,
    });
  });
});

describe('QuotationService.update — admin edits a quote already sent or approved', () => {
  it('bills a raise on a fully paid quote as one extra installment, payable now', async () => {
    const { service, db } = world({
      quote: packQuote({
        paidAmount: D('2000.000'),
        remainingAmount: D('0'),
        paymentStatus: QuotationPaymentStatus.paid,
      }),
      installments: [installment(1, '2000.000', InstallmentStatus.paid)],
      payments: [group(PaymentRecordStatus.success, '2000.000')],
      orderStatus: OrderStatus.fabrication,
    });

    // Loyalty discount removed afterwards: 2000 -> 2380, 380 more to bill.
    await service.update('q-1', { discountAmount: 0 }, admin);

    expect(db.quoteInstallment.update).not.toHaveBeenCalled();
    const created = db.quoteInstallment.create.mock.calls[0][0] as {
      data: { installmentNumber: number; amount: Prisma.Decimal };
    };
    expect(created.data.installmentNumber).toBe(2);
    expect(created.data.amount.toFixed(3)).toBe('380.000');
    expect(updateData(db)).toMatchObject({
      paymentMode: 'installments',
      paymentStatus: QuotationPaymentStatus.partially_paid,
    });
    // A paid order never moves backwards.
    expect(db.dentalOrder.update).not.toHaveBeenCalled();
  });

  it('closes the unpaid rows and releases their aligners when the total drops to what was paid', async () => {
    const { service, db } = world({
      quote: packQuote(),
      installments: [
        installment(1, '600.000', InstallmentStatus.paid),
        installment(2, '700.000'),
        installment(3, '700.000'),
      ],
      payments: [group(PaymentRecordStatus.success, '600.000')],
    });

    // 2380 gross - 1780 discount = 600: exactly what was paid.
    await service.update('q-1', { discountAmount: 1780 }, admin);

    expect(db.quoteInstallment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['i-2', 'i-3'] } },
      data: { amount: 0, status: InstallmentStatus.cancelled },
    });
    expect(db.quoteStepBatch.updateMany.mock.calls[0][0]).toMatchObject({
      where: { installmentId: { in: ['i-2', 'i-3'] }, status: 'locked' },
      data: { status: 'unlocked' },
    });
    expect(updateData(db)).toMatchObject({
      paymentStatus: QuotationPaymentStatus.paid,
    });
    const audit = db.orderAuditLog.create.mock.calls[0][0];
    expect(audit.data.metadata).toMatchObject({ cancelledInstallments: [2, 3] });
  });

  it('rebalances the unpaid installments, keeps the paid one and recomputes the money', async () => {
    const { service, db, pdf } = world({
      quote: packQuote(),
      installments: [
        installment(1, '600.000', InstallmentStatus.paid),
        installment(2, '700.000'),
        installment(3, '700.000'),
      ],
      payments: [
        group(PaymentRecordStatus.success, '600.000'),
        // A dead attempt never blocks an edit.
        group(PaymentRecordStatus.failed, '700.000'),
      ],
    });

    // Loyalty discount removed: the TTC goes from 2000 to 2380.
    const result = await service.update('q-1', { discountAmount: 0 }, admin);

    expect(db.$queryRaw).toHaveBeenCalledTimes(2); // installments, then quote
    expect(db.quoteInstallment.update.mock.calls.map(([a]) => a as unknown)).toEqual([
      { where: { id: 'i-2' }, data: { amount: D('890.000') } },
      { where: { id: 'i-3' }, data: { amount: D('890.000') } },
    ]);
    const data = updateData(db);
    expect(data).toMatchObject({
      totalTtc: 2380,
      subTotalHt: 2000,
      tvaAmount: 380,
      tvaRate: 19,
      paymentStatus: QuotationPaymentStatus.partially_paid,
    });
    expect((data.totalPrice as Prisma.Decimal).toFixed(3)).toBe('2380.000');
    expect((data.paidAmount as Prisma.Decimal).toFixed(3)).toBe('600.000');
    expect((data.remainingAmount as Prisma.Decimal).toFixed(3)).toBe(
      '1780.000',
    );
    // Shown to the doctor already: the edit is in the order history.
    expect(db.orderAuditLog.create).toHaveBeenCalledTimes(1);
    const audit = db.orderAuditLog.create.mock.calls[0][0];
    expect(audit.data).toMatchObject({
      orderId: 'o-1',
      action: 'quotation_updated',
      actorId: 'u-admin',
      changes: {
        totalTtc: { from: 2000, to: 2380 },
        discountAmount: { from: 380, to: 0 },
      },
      metadata: {
        kind: 'fees',
        installments: [
          { installmentNumber: 2, from: '700.000', to: '890.000' },
          { installmentNumber: 3, from: '700.000', to: '890.000' },
        ],
      },
    });
    // The stored devis follows the edit.
    expect(pdf.refreshStoredPdf).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      receivedAmount: 600,
      hasPaymentInFlight: false,
      canDelete: false,
      canRecall: false,
    });
  });

  it('leaves every amount of a pack quote as stored when the body only echoes them', async () => {
    const { service, db } = world({
      quote: packQuote(),
      installments: [
        installment(1, '600.000', InstallmentStatus.paid),
        installment(2, '1400.000'),
      ],
      payments: [group(PaymentRecordStatus.success, '600.000')],
    });

    // What the editor posts on a notes save: every field, money unchanged.
    await service.update(
      'q-1',
      {
        treatmentFees: 2380,
        fabricationFees: 0,
        deliveryFees: 0,
        discountAmount: 380,
        tvaRate: 19,
        notes: 'Livraison en 2 fois',
      },
      admin,
    );

    const data = updateData(db);
    expect(data).toMatchObject({ notes: 'Livraison en 2 fois' });
    for (const field of [
      'treatmentFees',
      'discountAmount',
      'tvaRate',
      'subTotalHt',
      'tvaAmount',
      'totalTtc',
      'totalPrice',
      'paidAmount',
      'remainingAmount',
      'paymentStatus',
    ]) {
      expect(data).not.toHaveProperty(field);
    }
    expect(db.quoteInstallment.update).not.toHaveBeenCalled();
    expect(db.quoteInstallment.updateMany).not.toHaveBeenCalled();
    expect(db.quoteInstallment.create).not.toHaveBeenCalled();
  });

  it('prices a money edit of a pack quote TTC, never adding TVA on top', async () => {
    const { service, db } = world({
      quote: packQuote({
        status: QuotationStatus.sent,
        // A legacy pack row stored at 0 % upgrades to the company rate.
        tvaRate: 0,
        tvaAmount: 0,
        subTotalHt: 2000,
        paidAmount: D(0),
        paymentStatus: QuotationPaymentStatus.pending,
      }),
      installments: [installment(1, '1000'), installment(2, '1000')],
    });

    // The loyalty discount is removed: 2380 TTC, TVA inside it.
    await service.update(
      'q-1',
      { treatmentFees: 2380, discountAmount: 0, tvaRate: 0 },
      admin,
    );

    const data = updateData(db);
    expect(data).toMatchObject({
      totalTtc: 2380,
      tvaRate: 19,
      subTotalHt: 2000,
      tvaAmount: 380,
    });
    expect((data.totalPrice as Prisma.Decimal).toFixed(3)).toBe('2380.000');
    const amounts = db.quoteInstallment.update.mock.calls.map(([a]) =>
      (a as { data: { amount: Prisma.Decimal } }).data.amount.toFixed(3),
    );
    expect(amounts).toEqual(['1190.000', '1190.000']);
  });

  it('refuses a total below what was already settled (400), writing nothing', async () => {
    const { service, db } = world({
      quote: packQuote(),
      installments: [
        installment(1, '600.000', InstallmentStatus.paid),
        installment(2, '1400.000'),
      ],
      payments: [group(PaymentRecordStatus.success, '600.000')],
    });

    await expect(
      service.update('q-1', { treatmentFees: 500, discountAmount: 0 }, admin),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: QUOTE_ERROR.TOTAL_BELOW_PAID,
    });
    expect(db.quotation.update).not.toHaveBeenCalled();
    expect(db.quoteInstallment.update).not.toHaveBeenCalled();
  });

  it('refuses while an unpaid installment has a payment in flight (409)', async () => {
    const { service, db } = world({
      quote: packQuote(),
      installments: [
        installment(1, '600.000', InstallmentStatus.paid),
        installment(2, '700.000', InstallmentStatus.pending, true),
        installment(3, '700.000'),
      ],
      payments: [
        group(PaymentRecordStatus.success, '600.000'),
        group(PaymentRecordStatus.unknown, '700.000'),
      ],
    });

    await expect(
      service.update('q-1', { discountAmount: 0 }, admin),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: QUOTE_ERROR.PAYMENT_IN_FLIGHT,
    });
    expect(db.quotation.update).not.toHaveBeenCalled();
  });

  it('still lets the notes change while a payment is in flight (the total does not move)', async () => {
    const { service, db } = world({
      quote: packQuote(),
      installments: [
        installment(1, '600.000', InstallmentStatus.paid),
        installment(2, '1400.000', InstallmentStatus.pending, true),
      ],
      payments: [
        group(PaymentRecordStatus.success, '600.000'),
        group(PaymentRecordStatus.pending, '1400.000'),
      ],
    });

    const result = await service.update('q-1', { notes: 'Livraison en 2 fois' }, admin);

    expect(updateData(db)).toMatchObject({ notes: 'Livraison en 2 fois' });
    expect(result.hasPaymentInFlight).toBe(true);
  });

  it('refuses a rejected quote (400 QUOTE_NOT_EDITABLE)', async () => {
    const { service, db } = world({
      quote: packQuote({ status: QuotationStatus.rejected }),
    });

    await expect(service.update('q-1', { notes: 'x' }, admin)).rejects.toMatchObject({
      statusCode: 400,
      errorCode: QUOTE_ERROR.NOT_EDITABLE,
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('writes no history for a draft', async () => {
    const { service, db } = world({
      quote: packQuote({
        status: QuotationStatus.draft,
        paidAmount: D(0),
        paymentStatus: QuotationPaymentStatus.pending,
      }),
    });

    await service.update('q-1', { discountAmount: 0 }, admin);

    expect(db.orderAuditLog.create).not.toHaveBeenCalled();
  });

  it('tells the editor whether a re-plan still has a free step', async () => {
    const quote = packQuote();
    const open = world({
      quote,
      keptBatches: [{ quotationId: 'q-1', fromStep: 1, toStep: 10 }],
    });
    await expect(
      open.service.update('q-1', { notes: 'x' }, admin),
    ).resolves.toMatchObject({ freeStepsForReplan: true });

    // Paid steps 1-10 and cancelled steps 11-30: the 30-step pack is full.
    const full = world({
      quote,
      keptBatches: [
        { quotationId: 'q-1', fromStep: 1, toStep: 10 },
        { quotationId: 'q-1', fromStep: 11, toStep: 30 },
      ],
    });
    await expect(
      full.service.update('q-1', { notes: 'x' }, admin),
    ).resolves.toMatchObject({ freeStepsForReplan: false });
  });
});

describe('QuotationService.update — packless quote stored the legacy HT way', () => {
  /** Approved before prices became TTC: 1500 + 200 HT, TVA 19 % on top. */
  const legacyHtQuote = (overrides: Partial<Quotation> = {}) =>
    packQuote({
      packId: null,
      packName: null,
      maxStepsPerArch: null,
      treatmentFees: 1500,
      fabricationFees: 200,
      deliveryFees: 0,
      discountAmount: 0,
      tvaRate: 19,
      subTotalHt: 1700,
      tvaAmount: 323,
      totalTtc: 2023,
      totalPrice: null,
      paidAmount: D(0),
      remainingAmount: null,
      paymentMode: null,
      paymentStatus: QuotationPaymentStatus.pending,
      ...overrides,
    });

  it('keeps every amount when an approved quote only gets new notes', async () => {
    const { service, db, pdf } = world({ quote: legacyHtQuote() });

    await service.update(
      'q-1',
      {
        treatmentFees: 1500,
        fabricationFees: 200,
        deliveryFees: 0,
        discountAmount: 0,
        tvaRate: 19,
        language: DevisLanguage.fr,
        notes: 'Corrigé : rendez-vous le 3',
      },
      admin,
    );

    const data = updateData(db);
    expect(data).toEqual({
      language: DevisLanguage.fr,
      currency: 'TND',
      notes: 'Corrigé : rendez-vous le 3',
      adminMessage: null,
    });
    // Nothing to rebalance, nothing read for it.
    expect(db.quoteInstallment.update).not.toHaveBeenCalled();
    expect(db.quoteInstallment.updateMany).not.toHaveBeenCalled();
    expect(db.quoteInstallment.create).not.toHaveBeenCalled();
    // The history shows the notes change only.
    const audit = db.orderAuditLog.create.mock.calls[0][0];
    expect(Object.keys(audit.data.changes as object)).toEqual(['notes']);
    expect(pdf.refreshStoredPdf).toHaveBeenCalledTimes(1);
  });

  it('keeps the HT + TVA maths when its money changes, so the TVA stays on top', async () => {
    const { service, db } = world({ quote: legacyHtQuote() });

    await service.update(
      'q-1',
      { treatmentFees: 1600, fabricationFees: 200, discountAmount: 100 },
      admin,
    );

    // 1600 + 200 - 100 = 1700 HT, + 19 % = 2023: the TVA is not swallowed.
    expect(updateData(db)).toMatchObject({
      treatmentFees: 1600,
      fabricationFees: 200,
      discountAmount: 100,
      tvaRate: 19,
      subTotalHt: 1700,
      tvaAmount: 323,
      totalTtc: 2023,
    });
  });

  it('applies a new rate forward too', async () => {
    const { service, db } = world({ quote: legacyHtQuote() });

    await service.update('q-1', { tvaRate: 7 }, admin);

    expect(updateData(db)).toMatchObject({
      tvaRate: 7,
      subTotalHt: 1700,
      tvaAmount: 119,
      totalTtc: 1819,
    });
  });

  it('prices TTC a packless quote already stored TTC', async () => {
    const { service, db } = world({
      quote: legacyHtQuote({
        subTotalHt: 1428.571,
        tvaAmount: 271.429,
        totalTtc: 1700,
      }),
    });

    await service.update('q-1', { treatmentFees: 2180 }, admin);

    expect(updateData(db)).toMatchObject({
      subTotalHt: 2000,
      tvaAmount: 380,
      totalTtc: 2380,
    });
  });
});

describe('QuotationService.cancel — delete while no money was received', () => {
  it('detaches the dead attempts, deletes the quote and sends the order back', async () => {
    const { service, db, pdf, events } = world({
      quote: packQuote({
        paidAmount: D(0),
        paymentStatus: QuotationPaymentStatus.pending,
      }),
      payments: [
        group(PaymentRecordStatus.failed, '700'),
        group(PaymentRecordStatus.expired, '700', 2),
      ],
      orderStatus: OrderStatus.payment_pending,
    });

    await expect(service.cancel('q-1', admin)).resolves.toEqual({
      id: 'q-1',
      canceled: true,
    });

    expect(db.payment.updateMany).toHaveBeenCalledWith({
      where: { quotationId: 'q-1', status: { in: DEAD_PAYMENT_STATUSES } },
      data: { quotationId: null },
    });
    // Detached BEFORE the delete, or Payment.quotation (Restrict) blocks it.
    expect(db.payment.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      db.quotation.delete.mock.invocationCallOrder[0],
    );
    expect(db.quotation.delete).toHaveBeenCalledWith({ where: { id: 'q-1' } });
    expect(db.dentalOrder.update).toHaveBeenCalledWith({
      where: { id: 'o-1' },
      data: { status: OrderStatus.treatment_approved },
    });
    expect(pdf.deleteStoredPdf).toHaveBeenCalledWith(
      'orders/o-1/quotes/dev-000001.pdf',
    );
    // An approved quote was visible to the doctor: they are told.
    expect(events.emit).toHaveBeenCalledWith(
      'quotation.canceled',
      expect.objectContaining({ quotationId: 'q-1', doctorId: 'u-doc' }),
    );
  });

  it('refuses once money was received (409), deleting nothing', async () => {
    const { service, db } = world({
      quote: packQuote(),
      payments: [group(PaymentRecordStatus.success, '600')],
    });

    await expect(service.cancel('q-1', admin)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: QUOTE_ERROR.PAYMENT_RECEIVED,
    });
    expect(db.quotation.delete).not.toHaveBeenCalled();
    expect(db.payment.updateMany).not.toHaveBeenCalled();
  });

  it('refuses while an attempt may still settle (409)', async () => {
    const { service, db } = world({
      quote: packQuote({ paidAmount: D(0) }),
      payments: [group(PaymentRecordStatus.awaiting_confirmation, '700')],
    });

    await expect(service.cancel('q-1', admin)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: QUOTE_ERROR.PAYMENT_IN_FLIGHT,
    });
    expect(db.quotation.delete).not.toHaveBeenCalled();
  });

  it('leaves an order already past the payment phase where it is', async () => {
    const { service, db } = world({
      quote: packQuote({ packId: null, totalPrice: null }),
      orderStatus: OrderStatus.canceled,
    });

    await service.cancel('q-1', admin);

    expect(db.dentalOrder.update).not.toHaveBeenCalled();
  });
});

describe('QuotationService.revertToDraft — recall', () => {
  it('recalls an approved quote with nothing received and clears its approval', async () => {
    const { service, db } = world({
      quote: packQuote({ paidAmount: D(0) }),
      payments: [group(PaymentRecordStatus.cancelled, '700')],
    });

    await service.revertToDraft('q-1', admin);

    expect(updateData(db)).toEqual({
      status: QuotationStatus.draft,
      sentAt: null,
      approvedAt: null,
      approvedById: null,
      doctorApprovedAt: null,
      paymentStatus: QuotationPaymentStatus.pending,
    });
    expect(db.dentalOrder.update).toHaveBeenCalledWith({
      where: { id: 'o-1' },
      data: { status: OrderStatus.treatment_approved },
    });
  });

  it('refuses once money was received (409)', async () => {
    const { service, db } = world({
      quote: packQuote(),
      payments: [group(PaymentRecordStatus.success, '600')],
    });

    await expect(service.revertToDraft('q-1', admin)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: QUOTE_ERROR.PAYMENT_RECEIVED,
    });
    expect(db.quotation.update).not.toHaveBeenCalled();
  });
});
