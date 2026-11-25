import type { Response } from 'express';

// Only the seams matter: the real services pull in Puppeteer (ESM-only),
// the payment lifecycle and the mailer.
jest.mock('../services/invoice-pdf.service', () => ({
  InvoicePdfService: class InvoicePdfService {},
}));
jest.mock('../services/invoice-auto.service', () => ({
  InvoiceAutoService: class InvoiceAutoService {},
}));
jest.mock('../services/invoice-mail.service', () => ({
  InvoiceMailService: class InvoiceMailService {},
}));
jest.mock('../services/invoice-export.service', () => ({
  InvoiceExportService: class InvoiceExportService {},
}));
jest.mock('../../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: class PdfRendererService {},
}));
jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { PATH_METADATA } from '@nestjs/common/constants';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import type { InvoiceAccountingService } from '../services/invoice-accounting.service';
import type { InvoiceExportService } from '../services/invoice-export.service';
import { AdminInvoiceController } from './admin-invoice.controller';

const ADMIN = { sub: 'u-admin', role: 'admin' } as JwtPayload;

function makeController() {
  const archive = { on: jest.fn(), pipe: jest.fn(), abort: jest.fn() };
  const exports = {
    buildPdfZip: jest.fn().mockResolvedValue({ archive, fileName: 'factures-2026-11-25.zip' }),
    buildPeriodPdfZip: jest
      .fn()
      .mockResolvedValue({ archive, fileName: 'factures-2026-11-01_2026-11-30.zip', count: 3 }),
  };
  const accounting = {
    summarise: jest.fn().mockResolvedValue({ counted: { count: 0 } }),
    renderPdf: jest.fn().mockResolvedValue({
      buffer: Buffer.from('%PDF-recap'),
      fileName: 'recap-comptable-2026-11-01_2026-11-30.pdf',
    }),
  };
  const controller = new AdminInvoiceController(
    {} as never,
    exports as unknown as InvoiceExportService,
    {} as never,
    {} as never,
    {} as never,
    accounting as unknown as InvoiceAccountingService,
  );
  const headers: Record<string, string> = {};
  const res = {
    setHeader: jest.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    on: jest.fn(),
    status: jest.fn().mockReturnThis(),
    end: jest.fn(),
    headersSent: false,
  };
  return { controller, exports, accounting, archive, res, headers };
}

describe('AdminInvoiceController — accounting routes', () => {
  it('declares accounting-summary (and its /pdf) BEFORE :id and :id/pdf', () => {
    const methods = Object.getOwnPropertyNames(AdminInvoiceController.prototype);
    const at = (name: string) => methods.indexOf(name);
    expect(at('accountingSummary')).toBeGreaterThan(-1);
    expect(at('accountingSummary')).toBeLessThan(at('getOne'));
    expect(at('accountingSummaryPdf')).toBeLessThan(at('getOne'));
    expect(at('accountingSummaryPdf')).toBeLessThan(at('pdf'));
    const proto = AdminInvoiceController.prototype as unknown as Record<string, object>;
    expect(Reflect.getMetadata(PATH_METADATA, proto.accountingSummary)).toBe('accounting-summary');
    expect(Reflect.getMetadata(PATH_METADATA, proto.accountingSummaryPdf)).toBe(
      'accounting-summary/pdf',
    );
  });

  it('GET accounting-summary hands the period to the service', async () => {
    const { controller, accounting } = makeController();
    await controller.accountingSummary({ issuedFrom: '2026-11-01', issuedTo: '2026-11-30' });
    expect(accounting.summarise).toHaveBeenCalledWith({
      issuedFrom: '2026-11-01',
      issuedTo: '2026-11-30',
    });
  });

  it('GET accounting-summary/pdf streams the PDF, never cached', async () => {
    const { controller, accounting, res, headers } = makeController();
    await controller.accountingSummaryPdf(
      { issuedFrom: '2026-11-01', issuedTo: '2026-11-30', language: 'en' },
      ADMIN,
      res as unknown as Response,
    );
    expect(accounting.renderPdf).toHaveBeenCalledWith(
      expect.objectContaining({ issuedFrom: '2026-11-01', issuedTo: '2026-11-30' }),
      { language: 'en', userId: 'u-admin' },
    );
    expect(headers['Content-Type']).toBe('application/pdf');
    expect(headers['Content-Disposition']).toContain(
      'filename="recap-comptable-2026-11-01_2026-11-30.pdf"',
    );
    expect(headers['Cache-Control']).toBe('no-store');
    expect(res.end).toHaveBeenCalledWith(Buffer.from('%PDF-recap'));
  });
});

describe('AdminInvoiceController — POST export/zip', () => {
  it('with ids: the selection, as before', async () => {
    const { controller, exports, archive, res } = makeController();
    await controller.exportZip({ ids: ['a', 'b'] }, res as unknown as Response);
    expect(exports.buildPdfZip).toHaveBeenCalledWith(['a', 'b']);
    expect(exports.buildPeriodPdfZip).not.toHaveBeenCalled();
    expect(archive.pipe).toHaveBeenCalledWith(res);
  });

  it('without ids: the whole period', async () => {
    const { controller, exports, archive, res, headers } = makeController();
    await controller.exportZip(
      { issuedFrom: '2026-11-01', issuedTo: '2026-11-30' },
      res as unknown as Response,
    );
    expect(exports.buildPeriodPdfZip).toHaveBeenCalledWith({
      issuedFrom: '2026-11-01',
      issuedTo: '2026-11-30',
    });
    expect(exports.buildPdfZip).not.toHaveBeenCalled();
    expect(headers['Content-Type']).toBe('application/zip');
    expect(headers['Content-Disposition']).toContain('factures-2026-11-01_2026-11-30.zip');
    expect(archive.pipe).toHaveBeenCalledWith(res);
  });
});
