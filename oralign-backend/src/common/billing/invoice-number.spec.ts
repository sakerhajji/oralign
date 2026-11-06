import type { PrismaService } from '../../prisma/prisma.service';
import {
  assertInvoiceNumberFree,
  type InvoiceNumberOwner,
} from './invoice-number';

interface Rows {
  /** The invoice already printing the number, if any. */
  invoice?: { id: string; paymentId: string | null } | null;
  /** The installment receipt already printing it, if any. */
  receipt?: { id: string } | null;
  /** The order whose treatment-fee receipt already prints it, if any. */
  feeReceipt?: { id: string } | null;
  settings?: Record<string, unknown> | null;
}

/** FAC counter at 100, TF counter at 50. */
const COUNTERS = {
  invoicePrefix: 'FAC',
  invoiceNextNumber: 100,
  treatmentFeeInvoicePrefix: 'TF',
  treatmentFeeInvoiceNextNumber: 50,
};

function makePrisma(rows: Rows = {}) {
  return {
    invoice: { findUnique: jest.fn().mockResolvedValue(rows.invoice ?? null) },
    payment: { findUnique: jest.fn().mockResolvedValue(rows.receipt ?? null) },
    dentalOrder: {
      findUnique: jest.fn().mockResolvedValue(rows.feeReceipt ?? null),
    },
    companyBillingSettings: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          rows.settings === undefined ? COUNTERS : rows.settings,
        ),
    },
  };
}

const check = (
  candidate: string,
  rows: Rows = {},
  owner?: InvoiceNumberOwner,
) =>
  assertInvoiceNumberFree(
    makePrisma(rows) as unknown as PrismaService,
    candidate,
    owner,
  );

const taken = { statusCode: 409, errorCode: 'INVOICE_NUMBER_TAKEN' };
const reserved = { statusCode: 409, errorCode: 'INVOICE_NUMBER_RESERVED' };

describe('assertInvoiceNumberFree (one number, one document)', () => {
  it('lets a free number below both counters through, after looking in the three tables that print one', async () => {
    const prisma = makePrisma();
    await expect(
      assertInvoiceNumberFree(prisma as unknown as PrismaService, 'FAC-000099'),
    ).resolves.toBeUndefined();
    expect(prisma.invoice.findUnique).toHaveBeenCalledWith({
      where: { invoiceNumber: 'FAC-000099' },
      select: { id: true, paymentId: true },
    });
    expect(prisma.payment.findUnique).toHaveBeenCalledWith({
      where: { invoiceNumber: 'FAC-000099' },
      select: { id: true },
    });
    expect(prisma.dentalOrder.findUnique).toHaveBeenCalledWith({
      where: { treatmentFeeInvoiceNumber: 'FAC-000099' },
      select: { id: true },
    });
    expect(prisma.companyBillingSettings.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  describe('taken (409 INVOICE_NUMBER_TAKEN)', () => {
    it("by a treatment-fee receipt: an order's TF- number never prints on a second document", async () => {
      await expect(
        check('TF-000042', { feeReceipt: { id: 'o-1' } }),
      ).rejects.toMatchObject(taken);
    });

    it('by another installment receipt', async () => {
      await expect(
        check(
          'FAC-000042',
          { receipt: { id: 'p-other' } },
          { paymentId: 'p1' },
        ),
      ).rejects.toMatchObject(taken);
    });

    it("by another payment's automatic invoice", async () => {
      await expect(
        check(
          'FAC-000042',
          { invoice: { id: 'inv-other', paymentId: 'p-other' } },
          { paymentId: 'p1', invoiceId: 'inv-1' },
        ),
      ).rejects.toMatchObject(taken);
    });

    it('by a manual invoice, also while renaming another manual invoice (no payment on either side)', async () => {
      await expect(
        check(
          'FAC-000042',
          { invoice: { id: 'inv-other', paymentId: null } },
          { invoiceId: 'inv-1', paymentId: null },
        ),
      ).rejects.toMatchObject(taken);
    });
  });

  describe("a document's own rows are not taken", () => {
    it('the payment renaming its receipt, and its automatic invoice', async () => {
      await expect(
        check(
          'FAC-000042',
          {
            receipt: { id: 'p1' },
            invoice: { id: 'inv-1', paymentId: 'p1' },
          },
          { paymentId: 'p1', invoiceId: 'inv-1' },
        ),
      ).resolves.toBeUndefined();
    });

    it('the invoice being renamed, and the payment whose receipt it shares', async () => {
      await expect(
        check(
          'FAC-000042',
          { receipt: { id: 'p1' } },
          { invoiceId: 'inv-1', paymentId: 'p1' },
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('the future range of the automatic counters (409 INVOICE_NUMBER_RESERVED)', () => {
    it.each(['FAC-000100', 'FAC-000150', 'FAC-150', 'TF-000050', 'TF-000777'])(
      '%s is refused: the counter would hand it out later',
      async (candidate) => {
        await expect(check(candidate)).rejects.toMatchObject(reserved);
      },
    );

    it.each(['FAC-000099', 'TF-000049', 'FAC-2026-A', 'AVOIR-000500'])(
      '%s is accepted: below the counter, or outside both sequences',
      async (candidate) => {
        await expect(check(candidate)).resolves.toBeUndefined();
      },
    );

    it('reads the prefixes the admin configured, FAC and TF when blank', async () => {
      const settings = {
        ...COUNTERS,
        invoicePrefix: 'INV',
        treatmentFeeInvoicePrefix: '',
      };
      await expect(check('INV-000100', { settings })).rejects.toMatchObject(
        reserved,
      );
      await expect(check('FAC-000100', { settings })).resolves.toBeUndefined();
      await expect(check('TF-000050', { settings })).rejects.toMatchObject(
        reserved,
      );
    });

    it('names the next automatic number in the message', async () => {
      await expect(check('FAC-000150')).rejects.toMatchObject({
        message: expect.stringContaining('next: FAC-000100') as unknown,
      });
    });

    it('without billing settings only the documents count', async () => {
      await expect(
        check('FAC-000150', { settings: null }),
      ).resolves.toBeUndefined();
      await expect(
        check('FAC-000150', { settings: null, feeReceipt: { id: 'o-1' } }),
      ).rejects.toMatchObject(taken);
    });
  });
});
