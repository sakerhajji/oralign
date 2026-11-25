import { PaymentRecordStatus, UserRole } from '@prisma/client';
import type { Response } from 'express';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { ForbiddenException } from '../common/exceptions/app.exception';

// The real services pull in Puppeteer (ESM-only) and the payment
// lifecycle; the controller only needs their seams, mocked per test.
jest.mock('./services/invoice-pdf.service', () => ({
  InvoicePdfService: class InvoicePdfService {},
}));
jest.mock('./services/invoice-auto.service', () => ({
  InvoiceAutoService: class InvoiceAutoService {},
}));
jest.mock('../payments/services/payments.service', () => ({
  PaymentsService: class PaymentsService {},
}));
jest.mock('../orders/services/order.service', () => ({
  OrderService: class OrderService {},
}));
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import type { OrderService } from '../orders/services/order.service';
import type { PaymentsService } from '../payments/services/payments.service';
import type { PrismaService } from '../prisma/prisma.service';
import { InvoicesController } from './invoices.controller';
import type { InvoiceAutoService } from './services/invoice-auto.service';
import type { InvoicePdfService } from './services/invoice-pdf.service';

const DOCTOR = { sub: 'doc-1', role: UserRole.dentist } as JwtPayload;
const ADMIN = { sub: 'u-admin', role: UserRole.admin } as JwtPayload;

const RECORD_PDF = {
  buffer: Buffer.from('%PDF-record'),
  fileName: 'FAC-000100-fr.pdf',
  mimeType: 'application/pdf',
};
const LEGACY_PDF = {
  buffer: Buffer.from('%PDF-legacy'),
  fileName: 'invoice-legacy-fr.pdf',
  mimeType: 'application/pdf',
};

function makeController(
  rows: {
    /** Invoice.findUnique: the stored facture, if any. */
    stored?: { id: string; deletedAt: Date | null } | null;
    /** Payment.findUnique: the payment's status. */
    paymentStatus?: PaymentRecordStatus;
  } = {},
) {
  const payments = { getPayment: jest.fn().mockResolvedValue({ id: 'p-1' }) };
  const orderService = {
    getOrderById: jest.fn().mockResolvedValue({ id: 'o-1' }),
  };
  const prisma = {
    invoice: { findUnique: jest.fn().mockResolvedValue(rows.stored ?? null) },
    payment: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          rows.paymentStatus ? { status: rows.paymentStatus } : null,
        ),
    },
  };
  const invoicePdf = {
    renderInvoiceRecordBuffer: jest.fn().mockResolvedValue(RECORD_PDF),
    renderInvoiceBuffer: jest.fn().mockResolvedValue(LEGACY_PDF),
    renderTreatmentFeeInvoiceBuffer: jest.fn().mockResolvedValue(LEGACY_PDF),
  };
  const autoInvoices = {
    generateForPayment: jest
      .fn()
      .mockResolvedValue({ created: true, invoiceId: 'inv-new' }),
    generateForTreatmentFee: jest
      .fn()
      .mockResolvedValue({ created: true, invoiceId: 'inv-fee' }),
  };
  const controller = new InvoicesController(
    payments as unknown as PaymentsService,
    invoicePdf as unknown as InvoicePdfService,
    orderService as unknown as OrderService,
    prisma as unknown as PrismaService,
    autoInvoices as unknown as InvoiceAutoService,
  );
  const res = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    end: jest.fn(),
  };
  return {
    controller,
    payments,
    orderService,
    prisma,
    invoicePdf,
    autoInvoices,
    res,
    response: res as unknown as Response,
  };
}

describe('InvoicesController — GET payments/:paymentId/invoice', () => {
  it('serves the stored facture, without generating anything', async () => {
    const t = makeController({ stored: { id: 'inv-1', deletedAt: null } });

    await t.controller.download('p-1', DOCTOR, t.response, 'en');

    expect(t.payments.getPayment).toHaveBeenCalledWith('p-1', {
      userId: 'doc-1',
      role: UserRole.dentist,
    });
    expect(t.invoicePdf.renderInvoiceRecordBuffer).toHaveBeenCalledWith({
      invoiceId: 'inv-1',
      language: 'en',
    });
    expect(t.autoInvoices.generateForPayment).not.toHaveBeenCalled();
    expect(t.invoicePdf.renderInvoiceBuffer).not.toHaveBeenCalled();
    expect(t.res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(t.res.status).toHaveBeenCalledWith(200);
    expect(t.res.end).toHaveBeenCalledWith(RECORD_PDF.buffer);
  });

  it.each([
    ['the practitioner', DOCTOR],
    ['an admin on the payments desk', ADMIN],
  ])(
    'a settled payment without its facture: generated on the spot WITHOUT the e-mail, opened by %s',
    async (_who, user) => {
      const t = makeController({ paymentStatus: PaymentRecordStatus.success });

      await t.controller.download('p-1', user, t.response);

      // Opening a document never mails "votre facture" for an old payment.
      expect(t.autoInvoices.generateForPayment).toHaveBeenCalledWith('p-1', {
        notify: false,
      });
      expect(t.invoicePdf.renderInvoiceRecordBuffer).toHaveBeenCalledWith({
        invoiceId: 'inv-new',
        language: undefined,
      });
      expect(t.res.end).toHaveBeenCalledWith(RECORD_PDF.buffer);
    },
  );

  it.each([
    PaymentRecordStatus.pending,
    PaymentRecordStatus.awaiting_confirmation,
    PaymentRecordStatus.failed,
  ])(
    'a %s payment is never invoiced on demand: only the legacy document is served',
    async (paymentStatus) => {
      const t = makeController({ paymentStatus });

      await t.controller.download('p-1', DOCTOR, t.response);

      expect(t.autoInvoices.generateForPayment).not.toHaveBeenCalled();
      expect(t.invoicePdf.renderInvoiceRecordBuffer).not.toHaveBeenCalled();
      expect(t.invoicePdf.renderInvoiceBuffer).toHaveBeenCalledWith({
        paymentId: 'p-1',
        language: undefined,
      });
    },
  );

  it('an archived facture is not served and not re-minted: the legacy document is', async () => {
    const t = makeController({
      stored: { id: 'inv-1', deletedAt: new Date() },
    });

    await t.controller.download('p-1', DOCTOR, t.response);

    expect(t.autoInvoices.generateForPayment).not.toHaveBeenCalled();
    expect(t.invoicePdf.renderInvoiceRecordBuffer).not.toHaveBeenCalled();
    expect(t.invoicePdf.renderInvoiceBuffer).toHaveBeenCalled();
  });

  it('a failed generation falls back to the legacy document instead of failing the download', async () => {
    const t = makeController({ paymentStatus: PaymentRecordStatus.success });
    t.autoInvoices.generateForPayment.mockRejectedValueOnce(new Error('P2002'));

    await t.controller.download('p-1', DOCTOR, t.response);

    expect(t.invoicePdf.renderInvoiceBuffer).toHaveBeenCalled();
    expect(t.res.end).toHaveBeenCalledWith(LEGACY_PDF.buffer);
  });

  it('a foreign payment is refused before anything is read or minted', async () => {
    const t = makeController({ paymentStatus: PaymentRecordStatus.success });
    t.payments.getPayment.mockRejectedValueOnce(new ForbiddenException());

    await expect(
      t.controller.download('p-1', DOCTOR, t.response),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(t.prisma.invoice.findUnique).not.toHaveBeenCalled();
    expect(t.autoInvoices.generateForPayment).not.toHaveBeenCalled();
    expect(t.res.end).not.toHaveBeenCalled();
  });
});

describe('InvoicesController — GET orders/:orderId/treatment-fee/invoice', () => {
  it('serves the stored fee facture', async () => {
    const t = makeController({ stored: { id: 'inv-fee', deletedAt: null } });

    await t.controller.downloadTreatmentFeeInvoice(
      'o-1',
      DOCTOR,
      t.response,
      'fr',
    );

    expect(t.prisma.invoice.findUnique).toHaveBeenCalledWith({
      where: { treatmentFeeOrderId: 'o-1' },
      select: { id: true, deletedAt: true },
    });
    expect(t.autoInvoices.generateForTreatmentFee).not.toHaveBeenCalled();
    expect(t.invoicePdf.renderInvoiceRecordBuffer).toHaveBeenCalledWith({
      invoiceId: 'inv-fee',
      language: 'fr',
    });
  });

  it('a fee without its facture: generated on the spot WITHOUT the e-mail', async () => {
    const t = makeController();

    await t.controller.downloadTreatmentFeeInvoice('o-1', ADMIN, t.response);

    expect(t.orderService.getOrderById).toHaveBeenCalledWith('o-1', {
      userId: 'u-admin',
      role: UserRole.admin,
    });
    expect(t.autoInvoices.generateForTreatmentFee).toHaveBeenCalledWith('o-1', {
      notify: false,
    });
    expect(t.invoicePdf.renderInvoiceRecordBuffer).toHaveBeenCalledWith({
      invoiceId: 'inv-fee',
      language: undefined,
    });
  });

  it('a fee that is not settled (no invoice minted) gets the legacy document', async () => {
    const t = makeController();
    t.autoInvoices.generateForTreatmentFee.mockResolvedValueOnce({
      created: false,
    });

    await t.controller.downloadTreatmentFeeInvoice('o-1', DOCTOR, t.response);

    expect(t.invoicePdf.renderInvoiceRecordBuffer).not.toHaveBeenCalled();
    expect(t.invoicePdf.renderTreatmentFeeInvoiceBuffer).toHaveBeenCalledWith({
      orderId: 'o-1',
      language: undefined,
    });
  });
});
