import {
  PaymentPurpose,
  PaymentRecordStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Caller } from '../../common/access/caller';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PaymentGateway } from '../gateways/payment-gateway.interface';

// QuotationService's production module imports the Puppeteer PDF renderer,
// which is ESM-only. Renaming a receipt never touches it.
jest.mock('../../quotations/services/quotation.service', () => ({
  QuotationService: class QuotationService {},
}));

import type { QuotationService } from '../../quotations/services/quotation.service';
import { PaymentsService } from './payments.service';

const admin: Caller = { userId: 'u-admin', role: UserRole.admin };
const doctor: Caller = { userId: 'u-doc', role: UserRole.dentist };

interface Setup {
  /** The payment being renamed, as the first lookup selects it. */
  payment?: Record<string, unknown> | null;
  /** The payment already printing the requested number, if any. */
  receiptWithNumber?: { id: string } | null;
  /** The invoice already printing the requested number, if any. */
  invoiceWithNumber?: { id: string; paymentId: string | null } | null;
  /** The order whose treatment-fee receipt prints the number, if any. */
  feeReceiptWithNumber?: { id: string } | null;
  /** The automatic counters; FAC at 1000 and TF at 100 by default. */
  counters?: Record<string, unknown> | null;
  commitError?: unknown;
  /** The error renaming the automatic invoice fails with, if any. */
  invoiceCommitError?: unknown;
}

const settled = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  status: PaymentRecordStatus.success,
  purpose: PaymentPurpose.installment,
  invoiceNumber: 'FAC-000123',
  invoice: { id: 'inv-1', invoiceNumber: 'FAC-000123' },
  ...over,
});

const COUNTERS = {
  invoicePrefix: 'FAC',
  invoiceNextNumber: 1000,
  treatmentFeeInvoicePrefix: 'TF',
  treatmentFeeInvoiceNextNumber: 100,
};

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

function makeService(setup: Setup = {}) {
  const tx = {
    payment: {
      update: jest.fn((args: { where: { id: string }; data: object }) =>
        setup.commitError
          ? Promise.reject(setup.commitError as Error)
          : Promise.resolve({ id: args.where.id, ...args.data }),
      ),
    },
    invoice: {
      update: jest.fn(() =>
        setup.invoiceCommitError
          ? Promise.reject(setup.invoiceCommitError as Error)
          : Promise.resolve({}),
      ),
    },
    invoiceAuditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    payment: {
      findUnique: jest.fn(
        (args: { where: { id?: string; invoiceNumber?: string } }) =>
          Promise.resolve(
            args.where.id !== undefined
              ? setup.payment === undefined
                ? settled()
                : setup.payment
              : (setup.receiptWithNumber ?? null),
          ),
      ),
    },
    invoice: {
      findUnique: jest.fn().mockResolvedValue(setup.invoiceWithNumber ?? null),
    },
    dentalOrder: {
      findUnique: jest
        .fn()
        .mockResolvedValue(setup.feeReceiptWithNumber ?? null),
    },
    companyBillingSettings: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          setup.counters === undefined ? COUNTERS : setup.counters,
        ),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin One' }),
    },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    {} as EventEmitter2,
    {} as PaymentGateway,
    {} as QuotationService,
  );
  return { service, prisma, tx };
}

const notEditable = {
  statusCode: 409,
  errorCode: 'INVOICE_NUMBER_NOT_EDITABLE',
};
const taken = { statusCode: 409, errorCode: 'INVOICE_NUMBER_TAKEN' };

describe('PaymentsService.updateInvoiceNumber (receipt number override)', () => {
  it('is admin-only', async () => {
    const { service, prisma } = makeService();
    await expect(
      service.updateInvoiceNumber('p1', 'FAC-000777', doctor),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
  });

  it('404 for an unknown payment', async () => {
    const { service } = makeService({ payment: null });
    await expect(
      service.updateInvoiceNumber('nope', 'FAC-000777', admin),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each(
    Object.values(PaymentRecordStatus).filter(
      (status) => status !== PaymentRecordStatus.success,
    ),
  )('refuses a %s payment: it has no receipt (409)', async (status) => {
    const { service, prisma } = makeService({ payment: settled({ status }) });
    await expect(
      service.updateInvoiceNumber('p1', 'FAC-000777', admin),
    ).rejects.toMatchObject(notEditable);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a treatment-fee card payment: its receipt is the order's TF- one (409)", async () => {
    const { service, prisma } = makeService({
      payment: settled({
        purpose: PaymentPurpose.treatment_fee,
        invoice: null,
      }),
    });
    await expect(
      service.updateInvoiceNumber('p1', 'FAC-000777', admin),
    ).rejects.toMatchObject(notEditable);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a number another receipt prints (409)', async () => {
    const { service, prisma } = makeService({
      receiptWithNumber: { id: 'p-other' },
    });
    await expect(
      service.updateInvoiceNumber('p1', 'FAC-000777', admin),
    ).rejects.toMatchObject(taken);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['a manual invoice', null],
    ["another payment's automatic invoice", 'p-other'],
  ])('refuses a number %s prints (409)', async (_label, paymentId) => {
    const { service, prisma } = makeService({
      invoiceWithNumber: { id: 'inv-other', paymentId },
    });
    await expect(
      service.updateInvoiceNumber('p1', 'FAC-000777', admin),
    ).rejects.toMatchObject(taken);
    expect(prisma.invoice.findUnique).toHaveBeenCalledWith({
      where: { invoiceNumber: 'FAC-000777' },
      select: { id: true, paymentId: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses an order's treatment-fee receipt number: one number, one document (409)", async () => {
    const { service, prisma } = makeService({
      feeReceiptWithNumber: { id: 'o-42' },
    });
    await expect(
      service.updateInvoiceNumber('p1', 'TF-000042', admin),
    ).rejects.toMatchObject(taken);
    expect(prisma.dentalOrder.findUnique).toHaveBeenCalledWith({
      where: { treatmentFeeInvoiceNumber: 'TF-000042' },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['FAC-000105', 'the FAC counter at FAC-000100'],
    ['TF-000060', 'the TF counter at TF-000050'],
  ])(
    'refuses %s, inside the future range of %s, as the invoice desk does (409 INVOICE_NUMBER_RESERVED)',
    async (candidate) => {
      const { service, prisma } = makeService({
        counters: {
          ...COUNTERS,
          invoiceNextNumber: 100,
          treatmentFeeInvoiceNextNumber: 50,
        },
      });
      await expect(
        service.updateInvoiceNumber('p1', candidate, admin),
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: 'INVOICE_NUMBER_RESERVED',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('renames the receipt and its automatic invoice in one transaction, and audits the invoice', async () => {
    const { service, prisma, tx } = makeService();

    await expect(
      service.updateInvoiceNumber('p1', '  FAC-000777 ', admin),
    ).resolves.toMatchObject({ id: 'p1', invoiceNumber: 'FAC-000777' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { invoiceNumber: 'FAC-000777' },
    });
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { invoiceNumber: 'FAC-000777' },
    });
    expect(tx.invoiceAuditLog.create).toHaveBeenCalledWith({
      data: {
        invoiceId: 'inv-1',
        actorId: admin.userId,
        actorName: 'Admin One',
        action: 'updated',
        changes: { invoiceNumber: { from: 'FAC-000123', to: 'FAC-000777' } },
      },
    });
  });

  it('saving again the number the receipt and its invoice already print renames nothing, so checks nothing', async () => {
    // Even a number the counters now reserve: refusing it would refuse
    // the receipt its own number.
    const { service, prisma, tx } = makeService({
      counters: { ...COUNTERS, invoiceNextNumber: 100 },
    });
    await expect(
      service.updateInvoiceNumber('p1', 'FAC-000123', admin),
    ).resolves.toMatchObject({ invoiceNumber: 'FAC-000123' });
    expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
    expect(prisma.companyBillingSettings.findFirst).not.toHaveBeenCalled();
    expect(tx.invoice.update).not.toHaveBeenCalled();
    expect(tx.invoiceAuditLog.create).not.toHaveBeenCalled();
  });

  it('its own receipt and its own automatic invoice do not count as taken: the invoice catches up with the receipt', async () => {
    // A receipt renamed before the invoice followed it.
    const { service, tx } = makeService({
      payment: settled({ invoiceNumber: 'FAC-000777' }),
      receiptWithNumber: { id: 'p1' },
    });
    await expect(
      service.updateInvoiceNumber('p1', 'FAC-000777', admin),
    ).resolves.toMatchObject({ invoiceNumber: 'FAC-000777' });
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { invoiceNumber: 'FAC-000777' },
    });
  });

  it('a payment without an automatic invoice: only the receipt is renamed', async () => {
    const { service, tx } = makeService({
      payment: settled({ invoice: null }),
    });
    await service.updateInvoiceNumber('p1', 'FAC-000777', admin);
    expect(tx.payment.update).toHaveBeenCalledTimes(1);
    expect(tx.invoice.update).not.toHaveBeenCalled();
    expect(tx.invoiceAuditLog.create).not.toHaveBeenCalled();
  });

  it('a writer taking the number between the check and the commit gets the same 409', async () => {
    const { service } = makeService({ commitError: uniqueViolation() });
    await expect(
      service.updateInvoiceNumber('p1', 'FAC-000777', admin),
    ).rejects.toMatchObject(taken);
  });

  it('the same 409 when the race is lost on the automatic invoice, and nothing is audited', async () => {
    const { service, tx } = makeService({
      invoiceCommitError: uniqueViolation(),
    });
    await expect(
      service.updateInvoiceNumber('p1', 'FAC-000777', admin),
    ).rejects.toMatchObject(taken);
    expect(tx.invoice.update).toHaveBeenCalledTimes(1);
    expect(tx.invoiceAuditLog.create).not.toHaveBeenCalled();
  });
});
