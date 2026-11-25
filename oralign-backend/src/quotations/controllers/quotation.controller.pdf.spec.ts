import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

// The real services pull in Puppeteer (ESM-only) and the whole quote
// lifecycle; the download route only needs their seams.
jest.mock('../services/quotation.service', () => ({
  QuotationService: class QuotationService {},
}));
jest.mock('../services/quotation-pdf.service', () => ({
  QuotationPdfService: class QuotationPdfService {},
}));

import type { QuotationPdfService } from '../services/quotation-pdf.service';
import type { QuotationService } from '../services/quotation.service';
import { QuotationController } from './quotation.controller';

const DOCTOR = { sub: 'doc-1', role: UserRole.dentist } as JwtPayload;

describe('QuotationController — GET quotations/:id/pdf', () => {
  it('re-renders a missing devis before streaming it, instead of answering 404', async () => {
    const stale = { id: 'q-1', pdfFilePath: null };
    const fresh = {
      id: 'q-1',
      pdfFilePath: 'orders/o-1/quotes/DEV-000001.pdf',
    };
    const stream = { pipe: jest.fn() };
    const service = {
      getForOrderByQuotationId: jest.fn().mockResolvedValue(stale),
    };
    const pdf = {
      ensureStoredPdf: jest.fn().mockResolvedValue(fresh),
      openPdfStream: jest.fn().mockResolvedValue({
        stream,
        fileName: 'DEV-000001.pdf',
        mimeType: 'application/pdf',
      }),
    };
    const controller = new QuotationController(
      service as unknown as QuotationService,
      pdf as unknown as QuotationPdfService,
    );
    const res = { setHeader: jest.fn() } as unknown as Response;

    await controller.downloadPdf('q-1', DOCTOR, res);

    // RBAC first (admin / owning dentist / designer), then the fallback.
    expect(service.getForOrderByQuotationId).toHaveBeenCalledWith('q-1', {
      userId: 'doc-1',
      role: UserRole.dentist,
    });
    expect(pdf.ensureStoredPdf).toHaveBeenCalledWith(stale);
    expect(pdf.openPdfStream).toHaveBeenCalledWith(fresh);
    expect(stream.pipe).toHaveBeenCalledWith(res);
  });
});
