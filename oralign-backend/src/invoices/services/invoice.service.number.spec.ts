import { InvoiceStatus, UserRole } from '@prisma/client';
import type { Caller } from '../../common/access/caller';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CompanyBillingSettingsService } from '../../quotations/services/company-billing-settings.service';
import type { CreateInvoiceDto } from '../dto/invoice.dto';
import { InvoiceService } from './invoice.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };

/** An automatic invoice, as the desk reads it before an edit. */
const AUTOMATIC = {
  id: 'inv-1',
  invoiceNumber: 'FAC-000123',
  paymentId: 'p1',
  status: InvoiceStatus.paid,
  deletedAt: null,
  issuedAt: new Date('2026-11-06T09:00:00.000Z'),
  paidAt: new Date('2026-11-06T09:00:00.000Z'),
  updatedAt: new Date('2026-11-06T09:00:00.000Z'),
  lines: [],
};

interface Documents {
  /** The invoice already printing the number, if any. */
  invoice?: { id: string; paymentId: string | null } | null;
  /** The installment receipt already printing it, if any. */
  receipt?: { id: string } | null;
  /** The order whose treatment-fee receipt already prints it, if any. */
  feeReceipt?: { id: string } | null;
}

function makeService(documents: Documents = {}) {
  const tx = {
    invoice: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    payment: { update: jest.fn().mockResolvedValue({}) },
    invoiceLine: { deleteMany: jest.fn(), createMany: jest.fn() },
  };
  const prisma = {
    invoice: {
      findFirst: jest.fn().mockResolvedValue(AUTOMATIC),
      findUnique: jest.fn().mockResolvedValue(documents.invoice ?? null),
      create: jest.fn(),
    },
    payment: {
      findUnique: jest.fn().mockResolvedValue(documents.receipt ?? null),
    },
    dentalOrder: {
      findUnique: jest.fn().mockResolvedValue(documents.feeReceipt ?? null),
    },
    companyBillingSettings: {
      findFirst: jest.fn().mockResolvedValue({
        invoicePrefix: 'FAC',
        invoiceNextNumber: 1000,
        treatmentFeeInvoicePrefix: 'TF',
        treatmentFeeInvoiceNextNumber: 100,
      }),
    },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const billingSettings = {
    requireActive: jest.fn().mockResolvedValue({
      defaultTvaRate: 19,
      stampDuty: 1,
      defaultCurrency: 'TND',
    }),
    allocateInvoiceNumber: jest.fn(),
  };
  const service = new InvoiceService(
    prisma as unknown as PrismaService,
    billingSettings as unknown as CompanyBillingSettingsService,
  );
  return { service, prisma, tx, billingSettings };
}

const manualInvoice = (invoiceNumber: string): CreateInvoiceDto => ({
  clientName: 'Clinique Les Pins',
  invoiceNumber,
  lines: [{ description: 'Gouttières', quantity: 1, unitPrice: 100 }],
});

const taken = { statusCode: 409, errorCode: 'INVOICE_NUMBER_TAKEN' };

describe('InvoiceService: the number an admin types follows the shared rules', () => {
  it("refuses a new invoice the number of an order's treatment-fee receipt", async () => {
    const { service, prisma, billingSettings } = makeService({
      feeReceipt: { id: 'o-42' },
    });
    await expect(
      service.create(manualInvoice('TF-000042'), admin),
    ).rejects.toMatchObject(taken);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
    expect(billingSettings.allocateInvoiceNumber).not.toHaveBeenCalled();
  });

  it('refuses a new invoice a number inside the future range of the FAC counter', async () => {
    const { service, prisma } = makeService();
    await expect(
      service.create(manualInvoice('FAC-001500'), admin),
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'INVOICE_NUMBER_RESERVED',
    });
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it("refuses renaming an invoice to an order's treatment-fee receipt number", async () => {
    const { service, prisma } = makeService({ feeReceipt: { id: 'o-42' } });
    await expect(
      service.update('inv-1', { invoiceNumber: 'TF-000042' }, admin),
    ).rejects.toMatchObject(taken);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lets an automatic invoice take the number its own receipt prints, and renames that receipt with it', async () => {
    const { service, prisma, tx } = makeService({ receipt: { id: 'p1' } });
    await service.update('inv-1', { invoiceNumber: 'FAC-000777' }, admin);

    expect(prisma.payment.findUnique).toHaveBeenCalledWith({
      where: { invoiceNumber: 'FAC-000777' },
      select: { id: true },
    });
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { invoiceNumber: 'FAC-000777' },
    });
  });

  it("still refuses another payment's receipt number", async () => {
    const { service, prisma } = makeService({ receipt: { id: 'p-other' } });
    await expect(
      service.update('inv-1', { invoiceNumber: 'FAC-000777' }, admin),
    ).rejects.toMatchObject(taken);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
