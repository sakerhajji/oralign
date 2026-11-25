import type { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';
import { renderInvoiceForDoctorEmail } from './templates';

const ARGS = {
  to: 'amel@clinic.tn',
  lang: 'fr' as const,
  doctorName: 'Dr Amel',
  invoiceNumber: 'FAC-000100',
  orderCode: 'ORD-001',
  // Installment 2380 + stamp 1 = 2381; - 35.700 retenue = 2345.300 paid.
  totalTtc: 2381,
  stampDuty: 1,
  withholdingRate: 1.5,
  withholdingAmount: 35.7,
  netPayable: 2345.3,
  currency: 'TND',
  paid: true,
  dashboardUrl: 'https://app.example/dashboard/orders/o-1',
  pdf: { filename: 'FAC-000100-fr.pdf', content: Buffer.from('%PDF-1.7') },
};

function makeService(transporter: { sendMail: jest.Mock } | null) {
  const service = new MailService({} as unknown as PrismaService);
  // The test env has no SMTP: install (or remove) the transport by hand.
  (service as unknown as { transporter: unknown }).transporter = transporter;
  return service;
}

describe('MailService — invoice e-mail with the PDF attached', () => {
  it('passes the PDF to nodemailer as an attachment and reports a real send', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'm-1' });
    const service = makeService({ sendMail });

    await expect(service.sendInvoiceToDoctor(ARGS)).resolves.toBe(true);

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = (sendMail.mock.calls as unknown[][])[0][0] as {
      to: string;
      subject: string;
      attachments: unknown;
    };
    expect(mail.to).toBe('amel@clinic.tn');
    expect(mail.subject).toBe('Facture FAC-000100 — ORD-001');
    expect(mail.attachments).toEqual([
      {
        filename: 'FAC-000100-fr.pdf',
        content: ARGS.pdf.content,
        contentType: 'application/pdf',
      },
    ]);
  });

  it('reports false when SMTP is not configured (nothing was sent)', async () => {
    const service = makeService(null);
    await expect(service.sendInvoiceToDoctor(ARGS)).resolves.toBe(false);
  });

  it('rethrows a real SMTP failure', async () => {
    const service = makeService({
      sendMail: jest.fn().mockRejectedValue(new Error('550 refused')),
    });
    await expect(service.sendInvoiceToDoctor(ARGS)).rejects.toThrow('550 refused');
  });

  it('other mails carry no attachment', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const service = makeService({ sendMail });
    await service.sendPasswordResetEmail('a@b.tn', 'A', 'https://x/reset', 'en');
    expect((sendMail.mock.calls as unknown[][])[0][0]).not.toHaveProperty(
      'attachments',
    );
  });
});

describe('renderInvoiceForDoctorEmail', () => {
  it('prints money with 3 decimals: the stamp, the Total TTC that carries it, the retenue and the net paid (FR)', () => {
    const { html } = renderInvoiceForDoctorEmail(ARGS, 'fr');
    const text = html.replace(/\s+/g, ' ');
    expect(text).toMatch(/Droit de timbre <\/td> <td[^>]*> 1,000 TND/);
    expect(text).toContain('Total TTC (timbre compris)');
    expect(text).toMatch(/2.381,000 TND/);
    expect(text).toMatch(/- 35,700 TND/);
    expect(text).toMatch(/2.345,300 TND/);
    expect(text).toContain('Retenue à la source (1,5 %)');
    expect(text).toContain('Net payé');
    expect(text).toContain('FAC-000100');
    // The facture order: stamp, Total TTC, retenue, net.
    const at = (s: string) => text.indexOf(s);
    expect(at('Droit de timbre')).toBeLessThan(at('Total TTC (timbre compris)'));
    expect(at('Total TTC (timbre compris)')).toBeLessThan(at('Retenue à la source'));
    expect(at('Retenue à la source')).toBeLessThan(at('Net payé'));
  });

  it('the owner example: Total TTC 1 001, retenue 10, net 991', () => {
    const { html } = renderInvoiceForDoctorEmail(
      {
        ...ARGS,
        totalTtc: 1001,
        stampDuty: 1,
        withholdingRate: 1,
        withholdingAmount: 10,
        netPayable: 991,
      },
      'fr',
    );
    const text = html.replace(/\s+/g, ' ');
    expect(text).toMatch(/1.001,000 TND/);
    expect(text).toMatch(/- 10,000 TND/);
    expect(text).toMatch(/991,000 TND/);
  });

  it('English, without a retenue line when none was applied', () => {
    const { html, subject } = renderInvoiceForDoctorEmail(
      { ...ARGS, withholdingRate: null, withholdingAmount: 0, netPayable: 2381 },
      'en',
    );
    expect(subject).toBe('Invoice FAC-000100 — ORD-001');
    expect(html).toContain('2,381.000 TND');
    expect(html).toContain('Stamp duty');
    expect(html).toContain('Total incl. TVA (stamp duty included)');
    expect(html).not.toContain('Withholding tax');
    expect(html).toContain('Net paid');
  });

  it('an invoice without a stamp (older rows) prints the plain Total TTC, no stamp row', () => {
    const { html } = renderInvoiceForDoctorEmail(
      { ...ARGS, stampDuty: 0, totalTtc: 2380, netPayable: 2344.3 },
      'fr',
    );
    expect(html).not.toContain('Droit de timbre');
    expect(html).not.toContain('timbre compris');
    expect(html).toContain('Total TTC');
  });
});
