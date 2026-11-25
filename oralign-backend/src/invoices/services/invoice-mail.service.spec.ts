// puppeteer-core is ESM-only and nothing here launches a browser.
jest.mock('puppeteer-core', () => ({
  __esModule: true,
  default: { launch: jest.fn() },
}));

import { InvoiceStatus, Prisma, UserRole } from '@prisma/client';
import type { MailService } from '../../mail/mail.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { InvoicePdfService } from './invoice-pdf.service';
import { InvoiceMailService } from './invoice-mail.service';

const D = (v: string | number) => new Prisma.Decimal(v);

const INVOICE = {
  id: 'inv-1',
  invoiceNumber: 'FAC-000100',
  status: InvoiceStatus.paid,
  currency: 'TND',
  language: 'fr',
  clientName: 'Dr Amel',
  clientEmail: 'contact@lespins.tn',
  // Installment 2380 + stamp 1 = 2381; - 35.700 retenue = 2345.300.
  totalTtc: D('2381.000'),
  stampDuty: D('1.000'),
  withholdingRate: D('1.50'),
  withholdingAmount: D('35.700'),
  netPayable: D('2345.300'),
  orderId: 'o-1',
  emailedTo: null,
  order: { orderCode: 'ORD-001' },
  doctor: { fullName: 'Dr Amel', email: 'amel@clinic.tn', preferredLanguage: 'en' },
};

function makeService(invoice: Record<string, unknown> | null = INVOICE, sent = true) {
  const prisma = {
    invoice: {
      findFirst: jest.fn().mockResolvedValue(invoice),
      update: jest.fn().mockReturnValue('update-op'),
    },
    invoiceAuditLog: { create: jest.fn().mockReturnValue('audit-op') },
    user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Admin' }) },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const invoicePdf = {
    renderInvoiceRecordBuffer: jest.fn().mockResolvedValue({
      buffer: Buffer.from('%PDF'),
      fileName: 'FAC-000100-fr.pdf',
      mimeType: 'application/pdf',
    }),
  };
  const mail = { sendInvoiceToDoctor: jest.fn().mockResolvedValue(sent) };
  const service = new InvoiceMailService(
    prisma as unknown as PrismaService,
    invoicePdf as unknown as InvoicePdfService,
    mail as unknown as MailService,
  );
  return { service, prisma, invoicePdf, mail };
}

describe('InvoiceMailService', () => {
  it("sends the PDF to the practitioner's account e-mail, in their language, then stamps and audits", async () => {
    const { service, prisma, mail } = makeService();

    const res = await service.sendManual('inv-1', {
      userId: 'u-admin',
      role: UserRole.admin,
    });

    expect(res.emailedTo).toBe('amel@clinic.tn');
    expect(res.emailedAt).toBeInstanceOf(Date);
    expect(mail.sendInvoiceToDoctor).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'amel@clinic.tn',
        lang: 'en',
        invoiceNumber: 'FAC-000100',
        orderCode: 'ORD-001',
        totalTtc: 2381,
        stampDuty: 1,
        withholdingRate: 1.5,
        withholdingAmount: 35.7,
        netPayable: 2345.3,
        paid: true,
        pdf: { filename: 'FAC-000100-fr.pdf', content: Buffer.from('%PDF') },
      }),
    );
    expect(prisma.invoice.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { emailedAt: res.emailedAt, emailedTo: 'amel@clinic.tn' },
    });
    expect(prisma.invoiceAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invoiceId: 'inv-1',
        actorId: 'u-admin',
        action: 'emailed',
      }),
    });
  });

  it('falls back to the client e-mail when no practitioner is linked', async () => {
    const { service, mail } = makeService({ ...INVOICE, doctor: null });
    await service.sendManual('inv-1', { userId: 'u', role: UserRole.admin });
    expect(mail.sendInvoiceToDoctor).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'contact@lespins.tn', lang: 'fr' }),
    );
  });

  // 422, never 502/503: the client reads those as "server restarting",
  // drops the message and invites a retry that can never succeed.
  it('never stamps emailedAt when SMTP is off: the manual send says so (422)', async () => {
    const { service, prisma } = makeService(INVOICE, false);
    await expect(
      service.sendManual('inv-1', { userId: 'u', role: UserRole.admin }),
    ).rejects.toMatchObject({
      statusCode: 422,
      errorCode: 'MAIL_NOT_CONFIGURED',
      message:
        'E-mail sending is not configured on this server; the invoice was not sent.',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('an SMTP refusal on the manual send is a 422 MAIL_SEND_FAILED, nothing stamped', async () => {
    const { service, mail, prisma } = makeService();
    mail.sendInvoiceToDoctor.mockRejectedValueOnce(new Error('550 rejected'));
    await expect(
      service.sendManual('inv-1', { userId: 'u', role: UserRole.admin }),
    ).rejects.toMatchObject({
      statusCode: 422,
      errorCode: 'MAIL_SEND_FAILED',
      message:
        'The e-mail server refused the message; the invoice was not sent.',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('no recipient at all is a 400', async () => {
    const { service } = makeService({ ...INVOICE, doctor: null, clientEmail: null });
    await expect(
      service.sendManual('inv-1', { userId: 'u', role: UserRole.admin }),
    ).rejects.toMatchObject({ statusCode: 400, errorCode: 'INVOICE_NO_RECIPIENT' });
  });

  it('the automatic send is best-effort: an SMTP failure is swallowed', async () => {
    const { service, mail, prisma } = makeService();
    mail.sendInvoiceToDoctor.mockRejectedValueOnce(new Error('550'));
    await expect(service.sendAutomatic('inv-1')).resolves.toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
