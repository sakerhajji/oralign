// puppeteer-core is ESM-only and nothing here launches a browser.
jest.mock('puppeteer-core', () => ({
  __esModule: true,
  default: { launch: jest.fn() },
}));

import {
  InvoiceStatus,
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
} from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CompanyBillingSettingsService } from '../../quotations/services/company-billing-settings.service';
import { InvoiceAutoService } from './invoice-auto.service';
import type { InvoiceMailService } from './invoice-mail.service';

const D = (v: string | number) => new Prisma.Decimal(v);
// Settled weeks before the facture is generated: the two dates must differ.
const PAID_AT = new Date('2026-09-10T10:00:00.000Z');

const SETTINGS = {
  defaultTvaRate: 19,
  stampDuty: D('1.000'),
  defaultCurrency: 'TND',
  invoicePrefix: 'FAC',
  companyName: 'Oralign',
  companyLogoPath: null,
  companyAddress: null,
  companyCity: null,
  companyCountry: null,
  companyPhone: null,
  companyEmail: null,
  taxRegistrationNumber: null,
  legalTextTranslations: null,
  footerTextTranslations: null,
  bankDetails: null,
};

const DOCTOR = {
  id: 'doc-1',
  fullName: 'Dr Amel Ben Salah',
  email: 'amel@clinic.tn',
  phone: '+21620000000',
  preferredLanguage: 'fr',
  dentistProfile: {
    clinicName: 'Cabinet Les Pins',
    clinicAddress: '12 rue des Pins',
    city: 'Tunis',
    country: 'TN',
    clinicPhone: '+21671000000',
    clinicEmail: 'contact@lespins.tn',
    taxId: '1234567/A',
    registrationNumber: 'CNOMDT-42',
    logoUrl: null,
    deletedAt: null,
  },
};

function installmentPayment(over: Record<string, unknown> = {}) {
  return {
    id: 'p-1',
    orderId: 'o-1',
    status: PaymentRecordStatus.success,
    purpose: PaymentPurpose.installment,
    paymentMethod: PaymentMethod.card,
    // Installment 2380 + the 1.000 stamp charged on top, no retenue.
    amount: D('2381.000'),
    withholdingRate: null,
    withholdingAmount: D('0'),
    stampAmount: D('1.000'),
    transactionId: 'CTP-42',
    invoiceNumber: null,
    paidAt: PAID_AT,
    createdAt: PAID_AT,
    quotation: { tvaRate: 0, currency: 'TND', packName: 'Pack Confort' },
    installment: { installmentNumber: 1, quotationId: 'q-1' },
    order: {
      id: 'o-1',
      orderCode: 'ORD-001',
      patientId: 'pat-1',
      doctorId: 'doc-1',
      doctor: DOCTOR,
    },
    ...over,
  };
}

function feeOrder(over: Record<string, unknown> = {}) {
  return {
    id: 'o-1',
    orderCode: 'ORD-001',
    patientId: 'pat-1',
    doctorId: 'doc-1',
    // Fee 150 + CBCT 50 = 200 due; + 1.000 stamp; - 1 % retenue (2.000).
    treatmentFeeAmount: D('199.000'),
    treatmentFeeWithholdingRate: D('1.00'),
    treatmentFeeWithholdingAmount: D('2.000'),
    treatmentFeeStampAmount: D('1.000'),
    treatmentFeePaymentMethod: PaymentMethod.cash,
    treatmentFeePaymentStatus: PaymentRecordStatus.success,
    treatmentFeePaidAt: PAID_AT,
    treatmentFeeInvoiceNumber: null,
    cbctFeeAmount: D('50.000'),
    cbctFeeCurrency: 'TND',
    welcomeGiftAppliedAt: null,
    doctor: DOCTOR,
    ...over,
  };
}

function makeService(
  rows: {
    payment?: Record<string, unknown> | null;
    order?: Record<string, unknown> | null;
    cardPayment?: Record<string, unknown> | null;
  } = {},
) {
  const prisma = {
    invoice: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'inv-new', invoiceNumber: 'FAC-000100' }),
    },
    payment: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(rows.payment ?? null),
      findFirst: jest.fn().mockResolvedValue(rows.cardPayment ?? null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    dentalOrder: {
      findUnique: jest.fn().mockResolvedValue(rows.order ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    quoteInstallment: { count: jest.fn().mockResolvedValue(3) },
  };
  const billingSettings = {
    requireActive: jest.fn().mockResolvedValue(SETTINGS),
    allocateInvoiceNumber: jest.fn().mockResolvedValue('FAC-000100'),
  };
  const invoiceMail = { sendAutomatic: jest.fn().mockResolvedValue(null) };
  const service = new InvoiceAutoService(
    prisma as unknown as PrismaService,
    billingSettings as unknown as CompanyBillingSettingsService,
    invoiceMail as unknown as InvoiceMailService,
  );
  return { service, prisma, billingSettings, invoiceMail };
}

/** The `data` the service passed to invoice.create. */
/** The slice of the invoice.create `data` the specs read. */
interface CreatedInvoice {
  [key: string]: unknown;
  subTotalHt: number;
  tvaAmount: number;
  stampDuty: number;
  totalTtc: number;
  withholdingAmount: number;
  netPayable: number;
  lines: { create: Record<string, unknown>[] };
}

function createdData(
  prisma: ReturnType<typeof makeService>['prisma'],
): CreatedInvoice {
  expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
  const calls = prisma.invoice.create.mock.calls as unknown as [
    [{ data: CreatedInvoice }],
  ];
  return calls[0][0].data;
}

describe('InvoiceAutoService — the facture snapshots (spec §4 and §6)', () => {
  it('freezes the practice name, the practitioner lead and the registration number', async () => {
    const { service, prisma } = makeService({ payment: installmentPayment() });
    await service.generateForPayment('p-1');
    expect(createdData(prisma)).toMatchObject({
      clientName: 'Dr Amel Ben Salah',
      clientClinicName: 'Cabinet Les Pins',
      clientIsPractitioner: true,
      clientRegistrationNumber: 'CNOMDT-42',
      // THE contact: the practice first.
      clientEmail: 'contact@lespins.tn',
      clientPhone: '+21671000000',
    });
  });

  it('a practice without its own contact prints the account one', async () => {
    const { service, prisma } = makeService({
      payment: installmentPayment({
        order: {
          id: 'o-1',
          orderCode: 'ORD-001',
          patientId: 'pat-1',
          doctorId: 'doc-1',
          doctor: {
            ...DOCTOR,
            dentistProfile: {
              ...DOCTOR.dentistProfile,
              clinicPhone: null,
              clinicEmail: '  ',
            },
          },
        },
      }),
    });
    await service.generateForPayment('p-1');
    expect(createdData(prisma)).toMatchObject({
      clientEmail: 'amel@clinic.tn',
      clientPhone: '+21620000000',
    });
  });

  it('freezes the devis balance right after THIS payment, never the later ones', async () => {
    const { service, prisma } = makeService({
      payment: installmentPayment({
        quotation: {
          id: 'q-1',
          tvaRate: 0,
          currency: 'TND',
          packName: 'Pack Confort',
          totalPrice: D('7140.000'),
          totalTtc: 7140,
        },
      }),
    });
    prisma.payment.findMany.mockResolvedValue([
      // Paid before: 2380 settled (2381 cash, stamp 1).
      {
        id: 'p-0',
        amount: D('2381.000'),
        withholdingAmount: D('0'),
        stampAmount: D('1.000'),
        paidAt: new Date('2026-09-01T10:00:00.000Z'),
        createdAt: new Date('2026-09-01T10:00:00.000Z'),
      },
      // This payment (2380 settled).
      {
        id: 'p-1',
        amount: D('2381.000'),
        withholdingAmount: D('0'),
        stampAmount: D('1.000'),
        paidAt: PAID_AT,
        createdAt: PAID_AT,
      },
      // Paid after: never counted on this facture.
      {
        id: 'p-2',
        amount: D('2381.000'),
        withholdingAmount: D('0'),
        stampAmount: D('1.000'),
        paidAt: new Date('2026-10-01T10:00:00.000Z'),
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
      },
    ]);
    await service.generateForPayment('p-1');
    const data = createdData(prisma);
    expect(Number(data.quoteRemainingAfter)).toBe(2380);
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { quotationId: 'q-1', status: PaymentRecordStatus.success },
      }),
    );
  });

  it('a retenue kept back still settles the installment in full', async () => {
    const { service, prisma } = makeService({
      payment: installmentPayment({
        amount: D('991.000'),
        withholdingRate: D('1.00'),
        withholdingAmount: D('10.000'),
        quotation: {
          id: 'q-1',
          tvaRate: 0,
          currency: 'TND',
          packName: 'Pack Confort',
          totalPrice: D('3000.000'),
          totalTtc: 3000,
        },
      }),
    });
    await service.generateForPayment('p-1');
    // 3000 - (991 + 10 - 1) = 2000.
    expect(Number(createdData(prisma).quoteRemainingAfter)).toBe(2000);
  });

  it('a treatment-fee facture records no devis balance', async () => {
    const { service, prisma } = makeService({ order: feeOrder() });
    await service.generateForTreatmentFee('o-1');
    const data = createdData(prisma);
    expect(data).not.toHaveProperty('quoteRemainingAfter');
    expect(data).toMatchObject({
      clientIsPractitioner: true,
      clientClinicName: 'Cabinet Les Pins',
    });
  });
});

describe('InvoiceAutoService — installment payments', () => {
  it('bills the installment TTC (TVA inside) and ADDS the stamp the payment charged on top', async () => {
    const { service, prisma, invoiceMail } = makeService({
      payment: installmentPayment(),
    });
    const startedAt = Date.now();

    await expect(service.generateForPayment('p-1')).resolves.toEqual({
      created: true,
      invoiceId: 'inv-new',
    });

    const data = createdData(prisma);
    expect(data).toMatchObject({
      invoiceNumber: 'FAC-000100',
      paymentId: 'p-1',
      status: InvoiceStatus.paid,
      pricesIncludeTax: true,
      // The pack quote stored 0 %: the company rate applies.
      tvaRate: 19,
      // Installment 2380 = HT 2000.000 + TVA 380.000; + timbre 1.000 = 2381.
      totalTtc: 2381,
      stampDuty: 1,
      subTotalHt: 2000,
      tvaAmount: 380,
      withholdingRate: null,
      withholdingAmount: 0,
      netPayable: 2381,
      paymentMethod: PaymentMethod.card,
      paymentReference: 'CTP-42',
      // The customer is the practitioner; the clinic is printed elsewhere.
      clientName: 'Dr Amel Ben Salah',
      clientEmail: 'contact@lespins.tn',
      clientAddress: '12 rue des Pins',
      clientTaxId: '1234567/A',
      language: 'fr',
      // Paid on the settlement date (printed "Réglée le")…
      paidAt: PAID_AT,
    });
    // …but issued when generated, so the FAC series stays chronological.
    expect(data.issueDate).toBeInstanceOf(Date);
    expect((data.issueDate as Date).getTime()).toBeGreaterThanOrEqual(
      startedAt,
    );
    expect(data.issuedAt).toEqual(data.issueDate);
    expect(data.subTotalHt + data.tvaAmount + data.stampDuty).toBeCloseTo(
      data.totalTtc,
      6,
    );
    // The line is what the payment settled on the devis: the installment.
    expect(data.lines.create).toEqual([
      expect.objectContaining({
        description: 'Pack Confort — Échéance 1 sur 3',
        quantity: 1,
        unitPriceTtc: 2380,
        unitPrice: 2000,
        lineHt: 2000,
      }),
    ]);
    // The number is claimed on the payment so both screens agree.
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'p-1', invoiceNumber: null },
      data: { invoiceNumber: 'FAC-000100' },
    });
    expect(invoiceMail.sendAutomatic).toHaveBeenCalledWith('inv-new');
  });

  it('installment 1000 + stamp 1, retenue 1 %: HT 840.336 + TVA 159.664 + 1 = 1001, retenue 10, net 991 (the cash)', async () => {
    const { service, prisma } = makeService({
      payment: installmentPayment({
        // What the practitioner paid: 1000 + 1 - 10.
        amount: D('991.000'),
        withholdingRate: D('1.00'),
        withholdingAmount: D('10.000'),
        stampAmount: D('1.000'),
        paymentMethod: PaymentMethod.bank_transfer,
        transactionId: null,
      }),
    });

    await service.generateForPayment('p-1');

    const data = createdData(prisma);
    expect(data).toMatchObject({
      subTotalHt: 840.336,
      tvaAmount: 159.664,
      stampDuty: 1,
      totalTtc: 1001,
      withholdingRate: 1,
      withholdingAmount: 10,
      netPayable: 991,
      paymentMethod: PaymentMethod.bank_transfer,
      paymentReference: null,
    });
    expect(data.subTotalHt + data.tvaAmount + data.stampDuty).toBeCloseTo(
      data.totalTtc,
      6,
    );
    expect(data.totalTtc - data.withholdingAmount).toBeCloseTo(
      data.netPayable,
      6,
    );
    expect(data.lines.create[0]).toMatchObject({
      unitPriceTtc: 1000,
      lineHt: 840.336,
    });
  });

  it('with a retenue the payment rounded: the retenue is copied, never re-derived', async () => {
    const { service, prisma } = makeService({
      payment: installmentPayment({
        // 2380 + 1 - 35.700 (1.5 % of the installment, stamp excluded).
        amount: D('2345.300'),
        withholdingRate: D('1.50'),
        withholdingAmount: D('35.700'),
      }),
    });

    await service.generateForPayment('p-1');

    expect(createdData(prisma)).toMatchObject({
      totalTtc: 2381,
      subTotalHt: 2000,
      tvaAmount: 380,
      stampDuty: 1,
      withholdingRate: 1.5,
      withholdingAmount: 35.7,
      netPayable: 2345.3,
    });
  });

  it('a payment made before stamps were charged on top (stampAmount 0) bills no stamp', async () => {
    const { service, prisma } = makeService({
      payment: installmentPayment({
        amount: D('2380.000'),
        stampAmount: D('0'),
      }),
    });

    await service.generateForPayment('p-1');

    const data = createdData(prisma);
    expect(data).toMatchObject({
      totalTtc: 2380,
      stampDuty: 0,
      subTotalHt: 2000,
      tvaAmount: 380,
      netPayable: 2380,
    });
    expect(data.lines.create[0].unitPriceTtc).toBe(2380);
  });

  const UUID = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';
  it.each([
    ['cash', PaymentMethod.cash, `cash_${UUID}`],
    ['cheque', PaymentMethod.cheque, `cheque_${UUID}`],
    ['bank', PaymentMethod.bank_transfer, `bank_${UUID}`],
    ['mock callback', PaymentMethod.card, `mock_cb_${UUID}`],
  ])(
    'a generated %s transaction id is not a reference: stored as null',
    async (_label, paymentMethod, transactionId) => {
      const { service, prisma } = makeService({
        payment: installmentPayment({ paymentMethod, transactionId }),
      });
      await service.generateForPayment('p-1');
      expect(createdData(prisma).paymentReference).toBeNull();
    },
  );

  it('a reference the admin typed is kept, even one that starts like a placeholder', async () => {
    const { service, prisma } = makeService({
      payment: installmentPayment({
        paymentMethod: PaymentMethod.cheque,
        transactionId: 'cheque_000123',
      }),
    });
    await service.generateForPayment('p-1');
    expect(createdData(prisma).paymentReference).toBe('cheque_000123');
  });

  it('prints in French even for a practitioner whose account is in English', async () => {
    const { service, prisma } = makeService({
      payment: installmentPayment({
        order: {
          ...installmentPayment().order,
          doctor: { ...DOCTOR, preferredLanguage: 'en' },
        },
      }),
    });
    await service.generateForPayment('p-1');
    const data = createdData(prisma);
    expect(data.language).toBe('fr');
    expect(data.lines.create[0].description).not.toContain('Installment');
  });

  it('reuses the number the payment already carries', async () => {
    const { service, prisma, billingSettings } = makeService({
      payment: installmentPayment({ invoiceNumber: 'FAC-000042' }),
    });
    await service.generateForPayment('p-1');
    expect(billingSettings.allocateInvoiceNumber).not.toHaveBeenCalled();
    expect(createdData(prisma).invoiceNumber).toBe('FAC-000042');
  });

  it('is idempotent: an existing invoice is returned untouched', async () => {
    const { service, prisma, invoiceMail } = makeService({
      payment: installmentPayment(),
    });
    prisma.invoice.findUnique.mockResolvedValueOnce({ id: 'inv-old' });
    await expect(service.generateForPayment('p-1')).resolves.toEqual({
      created: false,
      invoiceId: 'inv-old',
    });
    expect(prisma.invoice.create).not.toHaveBeenCalled();
    expect(invoiceMail.sendAutomatic).not.toHaveBeenCalled();
  });

  it('a lost race on paymentId (P2002) is success: the winner is returned', async () => {
    const { service, prisma, invoiceMail } = makeService({
      payment: installmentPayment(),
    });
    prisma.invoice.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.invoice.findUnique
      .mockResolvedValueOnce(null) // the pre-check
      .mockResolvedValueOnce({ id: 'inv-winner' }); // after the collision
    await expect(service.generateForPayment('p-1')).resolves.toEqual({
      created: false,
      invoiceId: 'inv-winner',
    });
    expect(invoiceMail.sendAutomatic).not.toHaveBeenCalled();
  });

  it('never invoices a payment that is not settled', async () => {
    const { service, prisma } = makeService({
      payment: installmentPayment({ status: PaymentRecordStatus.pending }),
    });
    await expect(service.generateForPayment('p-1')).resolves.toEqual({
      created: false,
    });
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });
});

describe('InvoiceAutoService — treatment fee (+ CBCT)', () => {
  it('bills the fee and the CBCT supplement as two TTC lines, the stamp on top, retenue from the order', async () => {
    const { service, prisma, invoiceMail } = makeService({ order: feeOrder() });

    await expect(service.generateForTreatmentFee('o-1')).resolves.toEqual({
      created: true,
      invoiceId: 'inv-new',
    });

    const data = createdData(prisma);
    // Due = 199 cash + 2 withheld - 1 stamp = 200 = HT 168.067 + TVA 31.933;
    // + 1 stamp = 201; - 2 retenue = 199, the cash.
    expect(data).toMatchObject({
      invoiceNumber: 'FAC-000100',
      treatmentFeeOrderId: 'o-1',
      paymentId: null,
      orderId: 'o-1',
      status: InvoiceStatus.paid,
      pricesIncludeTax: true,
      tvaRate: 19,
      totalTtc: 201,
      stampDuty: 1,
      subTotalHt: 168.067,
      tvaAmount: 31.933,
      withholdingRate: 1,
      withholdingAmount: 2,
      netPayable: 199,
      paymentMethod: PaymentMethod.cash,
      clientName: 'Dr Amel Ben Salah',
    });
    expect(data.lines.create).toEqual([
      expect.objectContaining({
        description: 'Honoraires de traitement',
        unitPriceTtc: 150,
        lineHt: 126.05,
      }),
      expect.objectContaining({
        description: 'Supplément CBCT',
        unitPriceTtc: 50,
        lineHt: 42.017,
      }),
    ]);
    // A fresh FAC number, written on the order so every screen agrees.
    expect(prisma.dentalOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'o-1', treatmentFeeInvoiceNumber: null },
      data: { treatmentFeeInvoiceNumber: 'FAC-000100' },
    });
    expect(invoiceMail.sendAutomatic).toHaveBeenCalledWith('inv-new');
  });

  it('fee 300 + CBCT 50, no retenue: lines 300 and 50, Total TTC 351 (stamp added), net 351', async () => {
    const { service, prisma } = makeService({
      order: feeOrder({
        treatmentFeeAmount: D('351.000'),
        treatmentFeeWithholdingAmount: null,
        treatmentFeeWithholdingRate: null,
        treatmentFeeStampAmount: D('1.000'),
        cbctFeeAmount: D('50.000'),
      }),
    });
    await service.generateForTreatmentFee('o-1');
    const data = createdData(prisma);
    expect(data).toMatchObject({
      subTotalHt: 294.118,
      tvaAmount: 55.882,
      stampDuty: 1,
      totalTtc: 351,
      withholdingRate: null,
      withholdingAmount: 0,
      netPayable: 351,
    });
    expect(data.lines.create).toEqual([
      expect.objectContaining({ unitPriceTtc: 300, lineHt: 252.101 }),
      expect.objectContaining({ unitPriceTtc: 50, lineHt: 42.017 }),
    ]);
  });

  it('one line without CBCT', async () => {
    const { service, prisma } = makeService({
      order: feeOrder({
        cbctFeeAmount: null,
        treatmentFeeAmount: D('151.000'),
        treatmentFeeWithholdingAmount: null,
        treatmentFeeWithholdingRate: null,
      }),
    });
    await service.generateForTreatmentFee('o-1');
    const data = createdData(prisma);
    expect(data).toMatchObject({
      totalTtc: 151,
      stampDuty: 1,
      withholdingRate: null,
      withholdingAmount: 0,
      netPayable: 151,
    });
    expect(data.lines.create).toHaveLength(1);
    expect(data.lines.create[0]).toMatchObject({
      description: 'Honoraires de traitement',
      unitPriceTtc: 150,
    });
  });

  it('a fee paid before stamps were charged on top (no stamp snapshot) bills no stamp', async () => {
    const { service, prisma } = makeService({
      order: feeOrder({
        cbctFeeAmount: null,
        treatmentFeeAmount: D('150.000'),
        treatmentFeeWithholdingAmount: null,
        treatmentFeeWithholdingRate: null,
        treatmentFeeStampAmount: null,
      }),
    });
    await service.generateForTreatmentFee('o-1');
    expect(createdData(prisma)).toMatchObject({
      totalTtc: 150,
      stampDuty: 0,
      netPayable: 150,
    });
  });

  it('a card fee links its Payment, takes its reference and claims the number on it too', async () => {
    const { service, prisma } = makeService({
      order: feeOrder({ treatmentFeePaymentMethod: PaymentMethod.card }),
      cardPayment: {
        id: 'p-card',
        invoiceNumber: null,
        transactionId: 'CTP-7',
      },
    });
    await service.generateForTreatmentFee('o-1');
    expect(createdData(prisma)).toMatchObject({
      paymentId: 'p-card',
      paymentMethod: PaymentMethod.card,
      paymentReference: 'CTP-7',
    });
    expect(prisma.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orderId: 'o-1',
          purpose: PaymentPurpose.treatment_fee,
          status: PaymentRecordStatus.success,
        }) as unknown,
      }),
    );
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'p-card', invoiceNumber: null },
      data: { invoiceNumber: 'FAC-000100' },
    });
  });

  it('a fresh fee facture carries no note, and is issued now but paid on the settlement date', async () => {
    const { service, prisma } = makeService({ order: feeOrder() });
    const startedAt = Date.now();
    await service.generateForTreatmentFee('o-1');
    const data = createdData(prisma);
    expect(data.notes).toBeNull();
    expect(data.paidAt).toEqual(PAID_AT);
    expect((data.issueDate as Date).getTime()).toBeGreaterThanOrEqual(
      startedAt,
    );
    expect(data.issuedAt).toEqual(data.issueDate);
  });

  it('a fee paid on a legacy TF- receipt: the order keeps it, the facture takes a FAC- number and names the receipt', async () => {
    const { service, prisma, billingSettings } = makeService({
      order: feeOrder({ treatmentFeeInvoiceNumber: 'TF-000045' }),
    });
    await service.generateForTreatmentFee('o-1');
    expect(billingSettings.allocateInvoiceNumber).toHaveBeenCalledTimes(1);
    // The receipt the practitioner holds is never overwritten.
    expect(prisma.dentalOrder.updateMany).not.toHaveBeenCalled();
    expect(createdData(prisma)).toMatchObject({
      invoiceNumber: 'FAC-000100',
      treatmentFeeOrderId: 'o-1',
      notes: 'Remplace le reçu TF-000045',
    });
  });

  it('any number outside the FAC series counts as a legacy receipt (custom prefix too)', async () => {
    const { service, prisma } = makeService({
      order: feeOrder({ treatmentFeeInvoiceNumber: 'REC-2026-7' }),
    });
    await service.generateForTreatmentFee('o-1');
    expect(prisma.dentalOrder.updateMany).not.toHaveBeenCalled();
    expect(createdData(prisma).notes).toBe('Remplace le reçu REC-2026-7');
  });

  it("a legacy card fee: the card payment's number is the facture's, the order still keeps its TF- receipt", async () => {
    const { service, prisma, billingSettings } = makeService({
      order: feeOrder({
        treatmentFeePaymentMethod: PaymentMethod.card,
        treatmentFeeInvoiceNumber: 'TF-000046',
      }),
      cardPayment: {
        id: 'p-card',
        invoiceNumber: 'FAC-000090',
        transactionId: 'CTP-7',
      },
    });
    await service.generateForTreatmentFee('o-1');
    expect(billingSettings.allocateInvoiceNumber).not.toHaveBeenCalled();
    expect(prisma.dentalOrder.updateMany).not.toHaveBeenCalled();
    expect(createdData(prisma)).toMatchObject({
      invoiceNumber: 'FAC-000090',
      paymentId: 'p-card',
      notes: 'Remplace le reçu TF-000046',
    });
  });

  it('a card payment numbered concurrently: the facture prints the number the payment won with', async () => {
    const { service, prisma } = makeService({
      order: feeOrder({
        treatmentFeePaymentMethod: PaymentMethod.card,
        treatmentFeeInvoiceNumber: 'TF-000047',
      }),
      cardPayment: {
        id: 'p-card',
        invoiceNumber: null,
        transactionId: 'CTP-8',
      },
    });
    prisma.payment.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.payment.findUnique.mockResolvedValueOnce({
      invoiceNumber: 'FAC-000099',
    });
    await service.generateForTreatmentFee('o-1');
    expect(createdData(prisma).invoiceNumber).toBe('FAC-000099');
  });

  it('reuses a FAC- number a previous attempt already claimed on the order', async () => {
    const { service, prisma, billingSettings } = makeService({
      order: feeOrder({ treatmentFeeInvoiceNumber: 'FAC-000077' }),
    });
    await service.generateForTreatmentFee('o-1');
    expect(billingSettings.allocateInvoiceNumber).not.toHaveBeenCalled();
    expect(createdData(prisma).invoiceNumber).toBe('FAC-000077');
  });

  it.each([
    [
      'not settled',
      { treatmentFeePaymentStatus: PaymentRecordStatus.awaiting_confirmation },
    ],
    ['no paid date', { treatmentFeePaidAt: null }],
    ['a welcome gift', { welcomeGiftAppliedAt: PAID_AT }],
    ['no fee', { treatmentFeeAmount: null }],
  ])('never invoices a fee that is %s', async (_label, over) => {
    const { service, prisma } = makeService({ order: feeOrder(over) });
    await expect(service.generateForTreatmentFee('o-1')).resolves.toEqual({
      created: false,
    });
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('is idempotent on the order (treatmentFeeOrderId)', async () => {
    const { service, prisma } = makeService({ order: feeOrder() });
    prisma.invoice.findUnique.mockResolvedValueOnce({ id: 'inv-fee' });
    await expect(service.generateForTreatmentFee('o-1')).resolves.toEqual({
      created: false,
      invoiceId: 'inv-fee',
    });
    expect(prisma.invoice.findUnique).toHaveBeenCalledWith({
      where: { treatmentFeeOrderId: 'o-1' },
      select: { id: true },
    });
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('a treatment-fee card payment is invoiced on its order', async () => {
    const { service, prisma } = makeService({
      payment: installmentPayment({
        id: 'p-card',
        purpose: PaymentPurpose.treatment_fee,
        quotation: null,
        installment: null,
      }),
      order: feeOrder({ treatmentFeePaymentMethod: PaymentMethod.card }),
      cardPayment: {
        id: 'p-card',
        invoiceNumber: null,
        transactionId: 'CTP-7',
      },
    });
    await expect(service.generateForPayment('p-card')).resolves.toEqual({
      created: true,
      invoiceId: 'inv-new',
    });
    expect(createdData(prisma)).toMatchObject({
      treatmentFeeOrderId: 'o-1',
      paymentId: 'p-card',
    });
  });

  it('listens to TreatmentFeePaid / TreatmentFeeConfirmed and never throws', async () => {
    const { service } = makeService();
    const spy = jest
      .spyOn(service, 'generateForTreatmentFee')
      .mockRejectedValueOnce(new Error('boom'));
    await expect(
      service.onTreatmentFeeSettled({ orderId: 'o-1' }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith('o-1');
  });
});

describe('InvoiceAutoService — backfill', () => {
  it('covers installments AND paid treatment fees, and never e-mails', async () => {
    const { service, prisma, invoiceMail } = makeService({
      payment: installmentPayment(),
      order: feeOrder(),
    });
    prisma.payment.findMany.mockResolvedValueOnce([{ id: 'p-1' }]);
    prisma.dentalOrder.findMany.mockResolvedValueOnce([
      { id: 'o-1' },
      { id: 'o-done' },
    ]);
    prisma.invoice.findMany.mockResolvedValueOnce([
      { treatmentFeeOrderId: 'o-done' },
    ]);

    await expect(service.backfill()).resolves.toEqual({
      scanned: 2,
      created: 2,
    });

    expect(prisma.payment.findMany).toHaveBeenCalledWith({
      where: {
        status: PaymentRecordStatus.success,
        purpose: PaymentPurpose.installment,
        invoice: { is: null },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    expect(prisma.dentalOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          treatmentFeePaymentStatus: PaymentRecordStatus.success,
          treatmentFeePaidAt: { not: null },
          welcomeGiftAppliedAt: null,
        },
      }),
    );
    expect(prisma.invoice.create).toHaveBeenCalledTimes(2);
    expect(invoiceMail.sendAutomatic).not.toHaveBeenCalled();
  });
});
