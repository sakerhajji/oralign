import {
  PaymentMethod,
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
} from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CompanyBillingSettingsService } from '../../quotations/services/company-billing-settings.service';
import { InvoiceAutoService } from './invoice-auto.service';

function makeService(payment: Record<string, unknown> | null = null) {
  const prisma = {
    invoice: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    payment: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(payment),
      updateMany: jest.fn(),
    },
  };
  const billingSettings = {
    requireActive: jest.fn(),
    allocateInvoiceNumber: jest.fn(),
  };
  const service = new InvoiceAutoService(
    prisma as unknown as PrismaService,
    billingSettings as unknown as CompanyBillingSettingsService,
  );
  return { service, prisma, billingSettings };
}

describe('InvoiceAutoService — installments only', () => {
  it("backfill scans the successful installments without an invoice: a treatment fee's receipt is its order's", async () => {
    const { service, prisma } = makeService();
    await expect(service.backfill()).resolves.toEqual({
      scanned: 0,
      created: 0,
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
  });

  it('never mints a FAC- invoice for a treatment-fee card payment', async () => {
    const { service, prisma, billingSettings } = makeService({
      id: 'p-tf',
      status: PaymentRecordStatus.success,
      purpose: PaymentPurpose.treatment_fee,
      paymentMethod: PaymentMethod.card,
      amount: new Prisma.Decimal('350.000'),
      invoiceNumber: null,
      quotation: null,
      installment: null,
    });

    await expect(service.generateForPayment('p-tf')).resolves.toEqual({
      created: false,
    });
    expect(billingSettings.allocateInvoiceNumber).not.toHaveBeenCalled();
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });
});
