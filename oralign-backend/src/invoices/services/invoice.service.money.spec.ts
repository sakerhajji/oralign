import { InvoiceStatus, PaymentMethod, Prisma, UserRole } from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CompanyBillingSettingsService } from '../../quotations/services/company-billing-settings.service';
import { InvoiceService, toInvoiceJson } from './invoice.service';

const D = (v: string | number) => new Prisma.Decimal(v);
const admin: Caller = { userId: 'u-admin', role: UserRole.admin };

describe('InvoiceService.computeMoney', () => {
  it('TTC mode: typed prices include TVA, HT/TVA come out backwards, the stamp is ADDED on top', () => {
    const money = InvoiceService.computeMoney(
      [
        { description: 'Honoraires', quantity: 1, unitPrice: 150 },
        { description: 'CBCT', quantity: 1, unitPrice: 50 },
      ],
      {
        pricesIncludeTax: true,
        tvaRate: 19,
        discountAmount: 0,
        stampDuty: 1,
        withholdingRate: null,
      },
    );
    // 200 TTC = HT 168.067 + TVA 31.933; + timbre 1.000 = 201.
    expect(money).toMatchObject({
      totalTtc: 201,
      stampApplied: 1,
      subTotalHt: 168.067,
      tvaAmount: 31.933,
      lineHt: [126.05, 42.017],
      unitPrice: [126.05, 42.017],
      unitPriceTtc: [150, 50],
      withholdingRate: null,
      withholdingAmount: 0,
      netPayable: 201,
    });
    expect(money.subTotalHt + money.tvaAmount + money.stampApplied).toBeCloseTo(
      money.totalTtc,
      6,
    );
  });

  it('TTC mode with a TTC discount and a retenue computed on the TTC without the stamp', () => {
    const money = InvoiceService.computeMoney(
      [{ description: 'Pack', quantity: 2, unitPrice: 1200 }],
      {
        pricesIncludeTax: true,
        tvaRate: 19,
        discountAmount: 20,
        stampDuty: 1,
        withholdingRate: 1.5,
      },
    );
    // 2400 - 20 = 2380 TTC; + 1 = 2381; retenue 1.5 % of 2380 = 35.700;
    // net 2381 - 35.700 = 2345.300.
    expect(money).toMatchObject({
      discountApplied: 20,
      totalTtc: 2381,
      stampApplied: 1,
      subTotalHt: 2000,
      tvaAmount: 380,
      unitPrice: [1000],
      unitPriceTtc: [1200],
      withholdingRate: 1.5,
      withholdingAmount: 35.7,
      netPayable: 2345.3,
    });
  });

  it('TTC mode, the owner example: 1000 + stamp 1, retenue 1 % => 840.336 + 159.664 + 1 = 1001, net 991', () => {
    const money = InvoiceService.computeMoney(
      [{ description: 'Échéance', quantity: 1, unitPrice: 1000 }],
      {
        pricesIncludeTax: true,
        tvaRate: 19,
        discountAmount: 0,
        stampDuty: 1,
        withholdingRate: 1,
      },
    );
    expect(money).toMatchObject({
      subTotalHt: 840.336,
      tvaAmount: 159.664,
      stampApplied: 1,
      totalTtc: 1001,
      withholdingRate: 1,
      withholdingAmount: 10,
      netPayable: 991,
    });
  });

  it('TTC mode: a fully discounted invoice bills nothing, stamp included', () => {
    const money = InvoiceService.computeMoney(
      [{ description: 'Geste', quantity: 1, unitPrice: 50 }],
      {
        pricesIncludeTax: true,
        tvaRate: 19,
        discountAmount: 80,
        stampDuty: 1,
        withholdingRate: null,
      },
    );
    expect(money).toMatchObject({
      discountApplied: 50,
      stampApplied: 0,
      totalTtc: 0,
      netPayable: 0,
    });
  });

  it('HT mode keeps TVA and stamp on top; its retenue is on the TTC without the stamp too', () => {
    const money = InvoiceService.computeMoney(
      [{ description: 'Gouttières', quantity: 1, unitPrice: 100 }],
      {
        pricesIncludeTax: false,
        tvaRate: 19,
        discountAmount: 0,
        stampDuty: 1,
        withholdingRate: 1,
      },
    );
    // 100 + 19 + 1 = 120; retenue 1 % of 119 = 1.190; net 118.810.
    expect(money).toMatchObject({
      subTotalHt: 100,
      tvaAmount: 19,
      stampApplied: 1,
      totalTtc: 120,
      lineHt: [100],
      unitPrice: [100],
      unitPriceTtc: [null],
      withholdingRate: 1,
      withholdingAmount: 1.19,
      netPayable: 118.81,
    });
  });
});

describe('toInvoiceJson', () => {
  it('sends every Decimal as a number, on the invoice and its lines', () => {
    const json = toInvoiceJson({
      id: 'inv-1',
      totalTtc: D('2380.000'),
      withholdingRate: D('1.50'),
      withholdingAmount: D('35.700'),
      netPayable: D('2344.300'),
      emailedAt: null,
      lines: [
        { id: 'l-1', unitPrice: D('1999.160'), unitPriceTtc: D('2380.000') },
      ],
    });
    expect(json).toEqual({
      id: 'inv-1',
      totalTtc: 2380,
      withholdingRate: 1.5,
      withholdingAmount: 35.7,
      netPayable: 2344.3,
      emailedAt: null,
      lines: [{ id: 'l-1', unitPrice: 1999.16, unitPriceTtc: 2380 }],
    });
  });
});

/** The practitioner as InvoiceService reads him (DOCTOR_BILLING_SELECT). */
const PRACTITIONER = {
  id: 'doc-1',
  fullName: 'Dr Amel',
  email: 'amel@mail.tn',
  phone: '+21620000000',
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

/** An automatic installment invoice, as the desk reads it before an edit. */
const AUTOMATIC = {
  id: 'inv-1',
  invoiceNumber: 'FAC-000123',
  paymentId: 'p1',
  treatmentFeeOrderId: null,
  status: InvoiceStatus.paid,
  deletedAt: null,
  issuedAt: new Date('2026-11-06T09:00:00.000Z'),
  paidAt: new Date('2026-11-06T09:00:00.000Z'),
  issueDate: new Date('2026-11-06T09:00:00.000Z'),
  dueDate: null,
  updatedAt: new Date('2026-11-06T09:00:00.000Z'),
  clientName: 'Dr Amel',
  clientEmail: null,
  clientPhone: null,
  clientAddress: null,
  clientCity: null,
  clientCountry: null,
  clientTaxId: null,
  language: 'fr',
  notes: null,
  tvaRate: 19,
  discountAmount: D('0'),
  // Installment 2380 TTC (HT 2000 + TVA 380) + the 1.000 stamp on top.
  stampDuty: D('1.000'),
  subTotalHt: D('2000.000'),
  tvaAmount: D('380.000'),
  totalTtc: D('2381.000'),
  pricesIncludeTax: true,
  paymentMethod: PaymentMethod.card,
  paymentReference: 'CTP-42',
  // The payment recorded 35.701 (as rounded at payment time): the invoice
  // keeps it rather than re-deriving 35.700 from the TTC.
  withholdingRate: D('1.50'),
  withholdingAmount: D('35.701'),
  netPayable: D('2345.299'),
  lines: [
    {
      description: 'Pack — Échéance 1 sur 2',
      quantity: D('1'),
      unitPrice: D('2000.000'),
      unitPriceTtc: D('2380.000'),
      tvaRate: null,
      lineHt: D('2000.000'),
    },
  ],
};

function makeService(row: Record<string, unknown> = AUTOMATIC) {
  const tx = {
    invoice: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    payment: { update: jest.fn() },
    dentalOrder: { updateMany: jest.fn() },
    invoiceLine: { deleteMany: jest.fn(), createMany: jest.fn() },
  };
  const prisma = {
    invoice: {
      findFirst: jest.fn().mockResolvedValue(row),
      create: jest
        .fn()
        .mockImplementation(
          ({ data }: { data: { lines: { create: unknown[] } } }) => ({
            ...data,
            id: 'inv-new',
            lines: data.lines.create,
          }),
        ),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin' }),
      findFirst: jest.fn().mockResolvedValue(PRACTITIONER),
      findMany: jest.fn().mockResolvedValue([]),
    },
    invoiceAuditLog: { create: jest.fn() },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const settings = {
    defaultTvaRate: 19,
    stampDuty: D('1.000'),
    defaultCurrency: 'TND',
    companyName: 'Oralign',
    // The retenue switched on, from 1 000 TND (spec §4).
    withholdingEnabled: true,
    withholdingThreshold: D('1000.000'),
  };
  const billingSettings = {
    requireActive: jest.fn().mockResolvedValue(settings),
    getActive: jest.fn().mockResolvedValue(settings),
    allocateInvoiceNumber: jest.fn().mockResolvedValue('FAC-000200'),
  };
  const service = new InvoiceService(
    prisma as unknown as PrismaService,
    billingSettings as unknown as CompanyBillingSettingsService,
  );
  return { service, prisma, tx, billingSettings, settings };
}

/** The `data` invoice.create received, as the specs read it. */
interface CreatedInvoice {
  [key: string]: unknown;
  lines: { create: Record<string, unknown>[] };
}
const createdData = (prisma: ReturnType<typeof makeService>['prisma']) =>
  (
    prisma.invoice.create.mock.calls as unknown as [[{ data: CreatedInvoice }]]
  )[0][0].data;

const updateData = (tx: ReturnType<typeof makeService>['tx']) =>
  (
    tx.invoice.updateMany.mock.calls as unknown as [
      [{ data: Record<string, unknown> }],
    ]
  )[0][0].data;

describe('InvoiceService.create — TTC pricing', () => {
  it('stores the typed TTC price, the derived HT and the server-computed retenue', async () => {
    const { service, prisma } = makeService();
    await service.create(
      {
        clientName: 'Dr Amel',
        doctorId: 'doc-1',
        pricesIncludeTax: true,
        paymentMethod: PaymentMethod.cheque,
        paymentReference: '  CHQ-555  ',
        withholdingRate: 1.5,
        lines: [{ description: 'Pack', quantity: 1, unitPrice: 2380 }],
      },
      admin,
    );
    const data = createdData(prisma);
    expect(data).toMatchObject({
      pricesIncludeTax: true,
      totalTtc: 2381,
      stampDuty: 1,
      subTotalHt: 2000,
      tvaAmount: 380,
      paymentMethod: PaymentMethod.cheque,
      paymentReference: 'CHQ-555',
      withholdingRate: 1.5,
      withholdingAmount: 35.7,
      netPayable: 2345.3,
    });
    expect(data.lines.create[0]).toMatchObject({
      unitPrice: 2000,
      unitPriceTtc: 2380,
      lineHt: 2000,
    });
  });
});

describe('InvoiceService.create — the client snapshot (spec §6)', () => {
  it('the practitioner and his name sent: practice, contact (practice first) and identifiers are snapshotted', async () => {
    const { service, prisma } = makeService();
    await service.create(
      {
        clientName: 'Dr Amel',
        doctorId: 'doc-1',
        lines: [{ description: 'Pack', quantity: 1, unitPrice: 100 }],
      },
      admin,
    );
    const data = createdData(prisma);
    expect(data).toMatchObject({
      doctorId: 'doc-1',
      clientName: 'Dr Amel',
      clientEmail: 'contact@lespins.tn',
      clientPhone: '+21671000000',
      clientAddress: '12 rue des Pins',
      clientCity: 'Tunis',
      clientCountry: 'TN',
      clientTaxId: '1234567/A',
      clientClinicName: 'Cabinet Les Pins',
      clientIsPractitioner: true,
      clientRegistrationNumber: 'CNOMDT-42',
    });
    // One read of the practitioner, with what the snapshot needs.
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'doc-1', deletedAt: null },
      select: expect.objectContaining({
        fullName: true,
        dentistProfile: expect.anything() as unknown,
      }) as unknown,
    });
  });

  it('a field the admin typed is an override: it wins over the snapshot', async () => {
    const { service, prisma } = makeService();
    await service.create(
      {
        clientName: 'Dr Amel',
        doctorId: 'doc-1',
        clientEmail: 'compta@lespins.tn',
        lines: [{ description: 'Pack', quantity: 1, unitPrice: 100 }],
      },
      admin,
    );
    const data = createdData(prisma);
    expect(data.clientEmail).toBe('compta@lespins.tn');
    expect(data.clientPhone).toBe('+21671000000');
  });

  it('billed under another name: not a practitioner invoice, no practice name, as typed', async () => {
    const { service, prisma } = makeService();
    await service.create(
      {
        clientName: 'Clinique Les Pins SARL',
        doctorId: 'doc-1',
        lines: [{ description: 'Pack', quantity: 1, unitPrice: 100 }],
      },
      admin,
    );
    const data = createdData(prisma);
    expect(data).toMatchObject({
      clientName: 'Clinique Les Pins SARL',
      clientIsPractitioner: false,
      clientClinicName: null,
      clientRegistrationNumber: null,
      clientEmail: null,
    });
  });

  it('snapshots the retenue threshold in force; a manual invoice has no devis balance', async () => {
    const { service, prisma } = makeService();
    await service.create(
      {
        clientName: 'Dr Amel',
        lines: [{ description: 'Pack', quantity: 1, unitPrice: 100 }],
      },
      admin,
    );
    const data = createdData(prisma);
    expect(data.withholdingThreshold).toEqual(D('1000.000'));
    expect(data).not.toHaveProperty('quoteRemainingAfter');
  });
});

describe('InvoiceService — a manual retenue follows the rule (spec §4)', () => {
  const line = (unitPrice: number) => [
    { description: 'Pack', quantity: 1, unitPrice },
  ];

  it('refuses a retenue while it is switched off: 400 WITHHOLDING_DISABLED, nothing written', async () => {
    const { service, prisma, settings } = makeService();
    settings.withholdingEnabled = false;
    await expect(
      service.create(
        {
          clientName: 'Dr Amel',
          pricesIncludeTax: true,
          withholdingRate: 1,
          lines: line(2380),
        },
        admin,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'WITHHOLDING_DISABLED',
    });
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('refuses a retenue on a base under the threshold (TTC, stamp excluded)', async () => {
    const { service } = makeService();
    await expect(
      service.create(
        {
          clientName: 'Dr Amel',
          pricesIncludeTax: true,
          withholdingRate: 1,
          lines: line(999.999),
        },
        admin,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'WITHHOLDING_BELOW_THRESHOLD',
      details: { withholdingThreshold: 1000 },
    });
  });

  it('at the threshold exactly, the retenue applies', async () => {
    const { service, prisma } = makeService();
    await service.create(
      {
        clientName: 'Dr Amel',
        pricesIncludeTax: true,
        withholdingRate: 1,
        lines: line(1000),
      },
      admin,
    );
    const data = createdData(prisma);
    expect(data).toMatchObject({ withholdingAmount: 10, netPayable: 991 });
  });

  it('no retenue asked: always allowed, even switched off', async () => {
    const { service, prisma, settings } = makeService();
    settings.withholdingEnabled = false;
    await service.create(
      { clientName: 'Dr Amel', pricesIncludeTax: true, lines: line(500) },
      admin,
    );
    expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
  });

  it('an edit that sets a new rate is checked against the threshold the invoice snapshotted', async () => {
    const { service, tx } = makeService({
      ...AUTOMATIC,
      withholdingRate: null,
      withholdingAmount: D('0'),
      netPayable: D('2381.000'),
      // Issued under a 5 000 threshold: 2 380 is under it.
      withholdingThreshold: D('5000.000'),
    });
    await expect(
      service.update('inv-1', { withholdingRate: 1 }, admin),
    ).rejects.toMatchObject({ errorCode: 'WITHHOLDING_BELOW_THRESHOLD' });
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('an edit that sets a rate while the retenue is switched off is refused', async () => {
    const { service, settings } = makeService();
    settings.withholdingEnabled = false;
    await expect(
      service.update('inv-1', { withholdingRate: 1 }, admin),
    ).rejects.toMatchObject({ errorCode: 'WITHHOLDING_DISABLED' });
  });

  it('an edit that keeps the rate is never re-checked (the automatic invoice keeps its retenue)', async () => {
    const { service, tx, settings } = makeService();
    settings.withholdingEnabled = false;
    await service.update(
      'inv-1',
      {
        withholdingRate: 1.5,
        lines: [{ description: 'Pack', quantity: 1, unitPrice: 2380 }],
      },
      admin,
    );
    expect(updateData(tx)).toMatchObject({ withholdingAmount: 35.701 });
  });
});

describe('InvoiceService.update — the client snapshot columns', () => {
  it('re-saving the form unchanged keeps what the invoice froze', async () => {
    const { service, tx } = makeService({
      ...AUTOMATIC,
      doctorId: 'doc-1',
      clientIsPractitioner: true,
      clientClinicName: 'Ancien cabinet',
    });
    await service.update(
      'inv-1',
      { clientName: 'Dr Amel', doctorId: 'doc-1', notes: 'merci' },
      admin,
    );
    const data = updateData(tx);
    expect(data).not.toHaveProperty('clientIsPractitioner');
    expect(data).not.toHaveProperty('clientClinicName');
  });

  it('a new client name is decided again against the practitioner', async () => {
    const { service, tx } = makeService({ ...AUTOMATIC, doctorId: 'doc-1' });
    await service.update('inv-1', { clientName: 'Clinique SARL' }, admin);
    expect(updateData(tx)).toMatchObject({
      clientName: 'Clinique SARL',
      clientIsPractitioner: false,
      clientClinicName: null,
      clientRegistrationNumber: null,
    });
  });

  it('linking the practitioner billed in his own name takes his practice', async () => {
    const { service, tx } = makeService({ ...AUTOMATIC, doctorId: null });
    await service.update('inv-1', { doctorId: 'doc-1' }, admin);
    expect(updateData(tx)).toMatchObject({
      doctorId: 'doc-1',
      clientIsPractitioner: true,
      clientClinicName: 'Cabinet Les Pins',
      clientRegistrationNumber: 'CNOMDT-42',
    });
  });
});

describe('InvoiceService — remise typed as a percentage', () => {
  it('takes the percentage of the lines gross, in their own unit', () => {
    expect(
      InvoiceService.discountFromPercent(
        [
          { description: 'A', quantity: 2, unitPrice: 1000 },
          { description: 'B', quantity: 1, unitPrice: 380 },
        ],
        10,
      ),
    ).toBe(238);
  });

  it('creates a TTC invoice with "10 %": amount derived, percentage kept', async () => {
    const { service, prisma } = makeService();
    await service.create(
      {
        clientName: 'Dr Amel',
        pricesIncludeTax: true,
        discountPercent: 10,
        discountAmount: 999,
        lines: [{ description: 'Pack', quantity: 1, unitPrice: 2380 }],
      },
      admin,
    );
    const data = createdData(prisma);
    // 2380 - 238 = 2142 TTC = HT 1800 + TVA 342; + 1 stamp = 2143.
    expect(data).toMatchObject({
      discountPercent: 10,
      discountAmount: 238,
      totalTtc: 2143,
      stampDuty: 1,
      subTotalHt: 1800,
      tvaAmount: 342,
    });
  });
});

describe('InvoiceService.update — automatic invoices keep the payment retenue', () => {
  it('a money edit with the same rate keeps the withheld amount the payment recorded', async () => {
    const { service, tx } = makeService();
    await service.update(
      'inv-1',
      {
        withholdingRate: 1.5,
        lines: [
          {
            description: 'Pack — Échéance 1 sur 2',
            quantity: 1,
            unitPrice: 2380,
          },
        ],
      },
      admin,
    );
    expect(updateData(tx)).toMatchObject({
      totalTtc: 2381,
      stampDuty: 1,
      withholdingRate: 1.5,
      withholdingAmount: 35.701,
      netPayable: 2345.299,
    });
  });

  it('changing the rate recomputes the retenue on the TTC without the stamp', async () => {
    const { service, tx } = makeService();
    await service.update('inv-1', { withholdingRate: 1 }, admin);
    // 1 % of 2380 (not of 2381); the net still pays the stamp.
    expect(updateData(tx)).toMatchObject({
      totalTtc: 2381,
      withholdingRate: 1,
      withholdingAmount: 23.8,
      netPayable: 2357.2,
    });
    // TTC mode: the stored lines follow any money edit (derived HT).
    expect(tx.invoiceLine.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ unitPriceTtc: 2380, unitPrice: 2000 })],
    });
  });

  it('the kept retenue is capped at the TTC without the stamp, never at the total', async () => {
    const { service, tx } = makeService();
    await service.update(
      'inv-1',
      { lines: [{ description: 'Ajustement', quantity: 1, unitPrice: 30 }] },
      admin,
    );
    // 30 TTC + 1 stamp = 31; the stored 35.701 is capped at 30; net 1.
    expect(updateData(tx)).toMatchObject({
      totalTtc: 31,
      stampDuty: 1,
      withholdingAmount: 30,
      netPayable: 1,
    });
  });

  it('a client-block edit moves no money and keeps the stored retenue', async () => {
    const { service, tx } = makeService();
    await service.update('inv-1', { notes: 'merci' }, admin);
    expect(updateData(tx)).toMatchObject({
      totalTtc: 2381,
      withholdingAmount: 35.701,
      netPayable: 2345.299,
      paymentMethod: PaymentMethod.card,
      paymentReference: 'CTP-42',
    });
    expect(tx.invoiceLine.createMany).not.toHaveBeenCalled();
  });

  it('a paid invoice may be cancelled: it keeps its number, and the change is audited', async () => {
    const { service, tx, prisma } = makeService();
    prisma.invoice.findFirst
      .mockResolvedValueOnce(AUTOMATIC)
      .mockResolvedValueOnce({ ...AUTOMATIC, status: InvoiceStatus.cancelled });
    await service.update('inv-1', { status: InvoiceStatus.cancelled }, admin);
    expect(updateData(tx)).toMatchObject({
      invoiceNumber: 'FAC-000123',
      status: InvoiceStatus.cancelled,
    });
    expect(prisma.invoiceAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'status_changed' }) as unknown,
      }),
    );
  });
});

describe('InvoiceService.searchPractitioners', () => {
  it('searches dentists only and returns the clinic block and orders with fee due and invoiced total', async () => {
    const { service, prisma } = makeService();
    prisma.user.findMany.mockResolvedValueOnce([
      {
        id: 'doc-1',
        fullName: 'Dr Amel',
        email: 'amel@clinic.tn',
        phone: null,
        dentistProfile: {
          clinicName: 'Cabinet Les Pins',
          clinicAddress: '12 rue',
          city: 'Tunis',
          country: 'TN',
          clinicPhone: null,
          clinicEmail: 'contact@lespins.tn',
          taxId: '123/A',
        },
        doctorOrders: [
          {
            id: 'o-1',
            orderCode: 'ORD-001',
            status: 'in_treatment',
            createdAt: new Date('2026-11-01T00:00:00.000Z'),
            patientId: 'pat-1',
            patient: { fullName: 'Sami' },
            // Fee 200 due: + 1 stamp - 2 retenue = 199 cash.
            treatmentFeeAmount: D('199.000'),
            treatmentFeeWithholdingAmount: D('2.000'),
            treatmentFeeStampAmount: D('1.000'),
            quotation: {
              id: 'q-1',
              totalTtc: 2380,
              packName: 'Pack Confort',
              status: 'approved',
              deletedAt: null,
            },
            // The fee's automatic facture and an installment facture, each
            // with its own stamp on top.
            invoices: [
              {
                totalTtc: D('201.000'),
                stampDuty: D('1.000'),
                treatmentFeeOrderId: 'o-1',
              },
              {
                totalTtc: D('1191.000'),
                stampDuty: D('1.000'),
                treatmentFeeOrderId: null,
              },
            ],
          },
        ],
      },
    ]);

    const res = await service.searchPractitioners('  amel ');

    const [[search]] = prisma.user.findMany.mock.calls as [
      [{ where: { OR: unknown } }],
    ];
    const where = search.where;
    expect(where).toMatchObject({ role: UserRole.dentist, deletedAt: null });
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { fullName: { contains: 'amel', mode: 'insensitive' } },
        {
          dentistProfile: {
            is: { clinicName: { contains: 'amel', mode: 'insensitive' } },
          },
        },
      ]),
    );
    expect(res.data[0]).toEqual({
      id: 'doc-1',
      fullName: 'Dr Amel',
      email: 'amel@clinic.tn',
      phone: null,
      clinicName: 'Cabinet Les Pins',
      clinicAddress: '12 rue',
      city: 'Tunis',
      country: 'TN',
      clinicPhone: null,
      clinicEmail: 'contact@lespins.tn',
      taxId: '123/A',
      orders: [
        {
          id: 'o-1',
          orderCode: 'ORD-001',
          status: 'in_treatment',
          createdAt: new Date('2026-11-01T00:00:00.000Z'),
          patientId: 'pat-1',
          patientName: 'Sami',
          treatmentFeeAmount: 199,
          // cash + retenue - stamp: the fee itself, comparable to the facture.
          treatmentFeeDue: 200,
          quotation: {
            id: 'q-1',
            totalTtc: 2380,
            packName: 'Pack Confort',
            status: 'approved',
          },
          // The quote line must not subtract the fee's facture (#17), and
          // both figures leave the stamps out (TTC billed, stamp excluded).
          quoteInvoicedTotal: 1190,
          feeInvoicedTotal: 200,
        },
      ],
    });
    // Archived and cancelled invoices stay out of both figures.
    const [[query]] = prisma.user.findMany.mock.calls as [
      [{ select: { doctorOrders: { select: { invoices: unknown } } } }],
    ];
    expect(query.select.doctorOrders.select.invoices).toEqual({
      where: { deletedAt: null, status: { not: InvoiceStatus.cancelled } },
      select: { totalTtc: true, stampDuty: true, treatmentFeeOrderId: true },
    });
  });

  it('a term shorter than 2 characters returns nothing without querying', async () => {
    const { service, prisma } = makeService();
    await expect(service.searchPractitioners(' a ')).resolves.toEqual({
      data: [],
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
