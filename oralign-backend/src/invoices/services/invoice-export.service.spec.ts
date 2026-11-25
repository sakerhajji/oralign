import { InvoiceStatus, PaymentMethod } from '@prisma/client';
import type { Archiver } from 'archiver';

// The real renderers pull in Puppeteer (ESM-only); only their seams matter.
jest.mock('./invoice-pdf.service', () => ({
  InvoicePdfService: class InvoicePdfService {},
}));
jest.mock('../../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: class PdfRendererService {},
}));
jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import type { PrismaService } from '../../prisma/prisma.service';
import type { InvoiceAccountingService } from './invoice-accounting.service';
import {
  InvoiceExportService,
  MAX_PERIOD_ZIP_INVOICES,
  PERIOD_ZIP_STATUSES,
} from './invoice-export.service';
import type { InvoicePdfService } from './invoice-pdf.service';
import type { InvoiceService } from './invoice.service';

/** 2026-11-01 → 2026-11-30 in Tunis, as the UTC instants Prisma receives. */
const NOVEMBER = {
  gte: new Date('2026-10-31T23:00:00.000Z'),
  lt: new Date('2026-11-30T23:00:00.000Z'),
};

function listRow(overrides: Record<string, unknown>) {
  return {
    invoiceNumber: 'FAC-000001',
    status: InvoiceStatus.paid,
    issueDate: new Date('2026-11-05T09:00:00.000Z'),
    dueDate: null,
    clientName: 'Dr Salma Trabelsi',
    clientEmail: 'salma@example.tn',
    clientPhone: '+216 20 000 000',
    clientTaxId: '1234567/A/M/000',
    order: { orderCode: 'ORD-1' },
    currency: 'TND',
    subTotalHt: 1000,
    discountAmount: 0,
    tvaRate: 19,
    tvaAmount: 190,
    stampDuty: 1,
    totalTtc: 1191,
    paymentMethod: PaymentMethod.card,
    withholdingRate: 1,
    withholdingAmount: 11.9,
    netPayable: 1179.1,
    notes: null,
    ...overrides,
  };
}

const LIST_ROWS = [
  listRow({}),
  listRow({
    invoiceNumber: 'FAC-000002',
    status: InvoiceStatus.issued,
    // 00:30 on 1 December in Tunis.
    issueDate: new Date('2026-11-30T23:30:00.000Z'),
    subTotalHt: 500,
    tvaAmount: 95,
    totalTtc: 596,
    paymentMethod: null,
    withholdingRate: null,
    withholdingAmount: 0,
    netPayable: 596,
  }),
  listRow({
    invoiceNumber: 'BROUILLON-1',
    status: InvoiceStatus.draft,
    subTotalHt: 252.101,
    tvaAmount: 47.899,
    totalTtc: 301,
    withholdingAmount: 0,
    netPayable: 301,
  }),
  listRow({
    invoiceNumber: 'FAC-000003',
    status: InvoiceStatus.cancelled,
    subTotalHt: 100,
    tvaAmount: 19,
    totalTtc: 120,
    withholdingAmount: 0,
    netPayable: 120,
  }),
];

function makeService(opts: { count?: number } = {}) {
  const prisma = {
    invoice: {
      count: jest.fn().mockResolvedValue(opts.count ?? 2),
      findMany: jest.fn().mockResolvedValue([{ id: 'i-1' }, { id: 'i-2' }]),
    },
  };
  const invoices = {
    list: jest.fn().mockResolvedValue({
      data: LIST_ROWS,
      total: LIST_ROWS.length,
      page: 1,
      limit: 100,
      totalPages: 1,
    }),
  };
  const invoicePdf = {
    renderInvoiceRecordBuffer: jest.fn().mockImplementation(({ invoiceId }: { invoiceId: string }) =>
      Promise.resolve({
        buffer: Buffer.from(`%PDF-${invoiceId}`),
        fileName: `FAC-${invoiceId}.pdf`,
        mimeType: 'application/pdf',
      }),
    ),
  };
  const accounting = {
    renderPdf: jest.fn().mockResolvedValue({
      buffer: Buffer.from('%PDF-recap'),
      fileName: 'recap-comptable-2026-11-01_2026-11-30.pdf',
    }),
  };
  const service = new InvoiceExportService(
    invoices as unknown as InvoiceService,
    invoicePdf as unknown as InvoicePdfService,
    prisma as unknown as PrismaService,
    accounting as unknown as InvoiceAccountingService,
  );
  return { service, prisma, invoices, invoicePdf, accounting };
}

function drain(archive: Archiver): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks).toString('latin1')));
    archive.on('error', reject);
  });
}

describe('InvoiceExportService.buildPeriodPdfZip', () => {
  it('takes every issued, paid and cancelled facture of the Tunis period — no draft, no archive — oldest first', async () => {
    const { service, prisma, invoicePdf } = makeService();
    const { archive, fileName, count } = await service.buildPeriodPdfZip({
      issuedFrom: '2026-11-01',
      issuedTo: '2026-11-30',
    });
    const zip = await drain(archive);

    const where = {
      deletedAt: null,
      status: { in: PERIOD_ZIP_STATUSES },
      issueDate: NOVEMBER,
    };
    expect(PERIOD_ZIP_STATUSES).toEqual([
      InvoiceStatus.issued,
      InvoiceStatus.paid,
      InvoiceStatus.cancelled,
    ]);
    expect(prisma.invoice.count).toHaveBeenCalledWith({ where });
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: [{ issueDate: 'asc' }, { invoiceNumber: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(fileName).toBe('factures-2026-11-01_2026-11-30.zip');
    expect(count).toBe(2);
    expect(invoicePdf.renderInvoiceRecordBuffer.mock.calls.map((c) => c[0].invoiceId)).toEqual([
      'i-1',
      'i-2',
    ]);
    // The recap and the journal open the archive, then the factures.
    const order = [
      '00-recap-comptable-2026-11-01_2026-11-30.pdf',
      '00-journal-des-ventes-2026-11-01_2026-11-30.csv',
      'FAC-i-1.pdf',
      'FAC-i-2.pdf',
    ].map((name) => zip.indexOf(name));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('the journal in the archive lists the same statuses, oldest first, and the recap the same days', async () => {
    const { service, invoices, accounting } = makeService();
    await drain(
      (await service.buildPeriodPdfZip({ issuedFrom: '2026-11-01', issuedTo: '2026-11-30' })).archive,
    );
    expect(invoices.list).toHaveBeenCalledWith(
      expect.objectContaining({
        issuedFrom: '2026-11-01',
        issuedTo: '2026-11-30',
        statuses: PERIOD_ZIP_STATUSES,
        sortOrder: 'asc',
      }),
    );
    expect(accounting.renderPdf).toHaveBeenCalledWith({
      issuedFrom: '2026-11-01',
      issuedTo: '2026-11-30',
    });
  });

  it('a failed recap does not sink the archive', async () => {
    const { service, accounting } = makeService();
    accounting.renderPdf.mockRejectedValueOnce(new Error('no chromium'));
    const zip = await drain(
      (await service.buildPeriodPdfZip({ issuedFrom: '2026-11-01', issuedTo: '2026-11-30' })).archive,
    );
    expect(zip).toContain('_skipped/00-recap-comptable-2026-11-01_2026-11-30.pdf.txt');
    expect(zip).toContain('FAC-i-2.pdf');
  });

  it(`refuses more than ${MAX_PERIOD_ZIP_INVOICES} factures with a clear 400, before reading or rendering any`, async () => {
    const { service, prisma, invoicePdf } = makeService({ count: MAX_PERIOD_ZIP_INVOICES + 1 });
    await expect(
      service.buildPeriodPdfZip({ issuedFrom: '2026-01-01', issuedTo: '2026-12-31' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'TOO_MANY_INVOICES',
      message: expect.stringContaining(`${MAX_PERIOD_ZIP_INVOICES + 1} invoices`),
    });
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    expect(invoicePdf.renderInvoiceRecordBuffer).not.toHaveBeenCalled();
  });

  it('an empty period is a 400, not an empty archive', async () => {
    const { service } = makeService({ count: 0 });
    await expect(
      service.buildPeriodPdfZip({ issuedFrom: '2026-11-01', issuedTo: '2026-11-30' }),
    ).rejects.toMatchObject({ statusCode: 400, errorCode: 'NO_INVOICE_IN_PERIOD' });
  });

  it('a period ending before it starts is a 400', async () => {
    const { service, prisma } = makeService();
    await expect(
      service.buildPeriodPdfZip({ issuedFrom: '2026-11-30', issuedTo: '2026-11-01' }),
    ).rejects.toMatchObject({ statusCode: 400, errorCode: 'INVALID_DATE_RANGE' });
    expect(prisma.invoice.count).not.toHaveBeenCalled();
  });
});

describe('InvoiceExportService.buildPdfZip (selected ids, unchanged)', () => {
  it('still refuses an empty or oversized selection', async () => {
    const { service } = makeService();
    await expect(service.buildPdfZip([])).rejects.toMatchObject({
      errorCode: 'NO_INVOICE_SELECTED',
    });
    await expect(
      service.buildPdfZip(Array.from({ length: 201 }, (_, i) => `i-${i}`)),
    ).rejects.toMatchObject({ errorCode: 'TOO_MANY_INVOICES' });
  });

  it('renders exactly the selected ids, no recap', async () => {
    const { service, invoicePdf, accounting } = makeService();
    const zip = await drain((await service.buildPdfZip(['x-1'])).archive);
    expect(invoicePdf.renderInvoiceRecordBuffer).toHaveBeenCalledTimes(1);
    expect(accounting.renderPdf).not.toHaveBeenCalled();
    expect(zip).toContain('FAC-x-1.pdf');
  });
});

describe('InvoiceExportService.buildCsv (journal des ventes)', () => {
  it('French statuses, Tunis days, ";" + comma decimals + BOM, and a TOTAL of the factures comptabilisées only', async () => {
    const { service } = makeService();
    const { content, fileName, mimeType } = await service.buildCsv({
      issuedFrom: '2026-11-01',
      issuedTo: '2026-11-30',
    });
    expect(fileName).toBe('factures-2026-11-01_2026-11-30.csv');
    expect(mimeType).toBe('text/csv; charset=utf-8');
    expect(content.charCodeAt(0)).toBe(0xfeff);

    const lines = content.replace(/^﻿/, '').trimEnd().split('\r\n');
    const [header, ...rest] = lines.map((l) => l.split(';'));
    expect(header).toHaveLength(21);
    const status = header.indexOf('Statut');
    const issued = header.indexOf('Date emission');
    expect(rest.slice(0, 4).map((r) => r[status])).toEqual([
      'Payée',
      'Émise',
      'Brouillon',
      'Annulée',
    ]);
    // 2026-11-30T23:30Z is 1 December in Tunis.
    expect(rest[1][issued]).toBe('2026-12-01');

    const total = rest[4];
    expect(total).toHaveLength(21);
    expect(total[0]).toBe('TOTAL factures comptabilisées (émises + payées) : 2 sur 4');
    const col = (name: string) => total[header.indexOf(name)];
    // Paid 1191 + issued 596; the draft (301) and the cancelled (120) are left out.
    expect(col('Total HT')).toBe('1500,000');
    expect(col('Montant TVA')).toBe('285,000');
    expect(col('Droit de timbre')).toBe('2,000');
    expect(col('Total TTC')).toBe('1787,000');
    expect(col('Montant retenue')).toBe('11,900');
    expect(col('Net à payer')).toBe('1775,100');
  });
});
