// The default import is the real `fs` module object (esModuleInterop), the
// one the service's namespace import reads through: spying on it works.
import fs from 'fs';
import { DevisLanguage, type Quotation, QuotationStatus } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

// puppeteer-core is ESM-only and nothing here launches a browser: the
// render itself (generateAndPersist) is replaced per test.
jest.mock('puppeteer-core', () => ({
  __esModule: true,
  default: { launch: jest.fn() },
}));

import { QuotationPdfService } from './quotation-pdf.service';

const STORED = 'orders/o-1/quotes/DEV-000001.pdf';

function quote(overrides: Partial<Quotation> = {}): Quotation {
  return {
    id: 'q-1',
    orderId: 'o-1',
    quotationNumber: 'DEV-000001',
    language: DevisLanguage.ar,
    status: QuotationStatus.approved,
    packId: 'p-1',
    companySnapshot: { companyName: 'Oralign' },
    // Dropped as stale by migration 20261119000002.
    pdfFilePath: null,
    ...overrides,
  } as Quotation;
}

function makeService() {
  const service = new QuotationPdfService({} as PrismaService);
  const rendered = (q: Quotation) =>
    ({ ...q, pdfFilePath: STORED }) as Quotation;
  const generate = jest
    .spyOn(service, 'generateAndPersist')
    .mockImplementation((q) => Promise.resolve(rendered(q)));
  return { service, generate };
}

describe('QuotationPdfService.ensureStoredPdf — a download re-renders a missing devis', () => {
  let exists: jest.SpyInstance;
  beforeEach(() => {
    exists = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
  });
  afterEach(() => exists.mockRestore());

  it('a stored file on disk is served as is, nothing rendered', async () => {
    const { service, generate } = makeService();
    const q = quote({ pdfFilePath: 'orders/o-1/quotes/DEV-000001.pdf' });
    await expect(service.ensureStoredPdf(q)).resolves.toBe(q);
    expect(generate).not.toHaveBeenCalled();
  });

  it('a numbered quote whose file was dropped as stale is rendered again, in its own language', async () => {
    const { service, generate } = makeService();
    const q = quote();
    const out = await service.ensureStoredPdf(q);
    // generateAndPersist renders the row as it is: language untouched.
    expect(generate).toHaveBeenCalledWith(q);
    expect(generate.mock.calls[0][0].language).toBe(DevisLanguage.ar);
    expect(out.pdfFilePath).toBe('orders/o-1/quotes/DEV-000001.pdf');
  });

  it('a path whose file is gone from disk is rendered again too', async () => {
    const { service, generate } = makeService();
    exists.mockReturnValue(false);
    await service.ensureStoredPdf(
      quote({ pdfFilePath: 'orders/o-1/quotes/DEV-000001.pdf' }),
    );
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a draft', { status: QuotationStatus.draft }],
    ['an unnumbered quote', { quotationNumber: null }],
    ['a quote without its company snapshot', { companySnapshot: null }],
  ])(
    '%s is never rendered by a read (openPdfStream then answers 404)',
    async (_label, over) => {
      const { service, generate } = makeService();
      const q = quote(over as Partial<Quotation>);
      await expect(service.ensureStoredPdf(q)).resolves.toBe(q);
      expect(generate).not.toHaveBeenCalled();
      await expect(service.openPdfStream(q)).rejects.toMatchObject({
        statusCode: 404,
      });
    },
  );

  it('concurrent downloads share ONE render (never two writers on the same file)', async () => {
    const { service, generate } = makeService();
    let finish!: (q: Quotation) => void;
    generate.mockImplementationOnce(
      () => new Promise<Quotation>((resolve) => (finish = resolve)),
    );
    const first = service.ensureStoredPdf(quote());
    const second = service.ensureStoredPdf(quote());
    finish(quote({ pdfFilePath: 'orders/o-1/quotes/DEV-000001.pdf' }));
    await expect(first).resolves.toHaveProperty('pdfFilePath', STORED);
    await expect(second).resolves.toHaveProperty('pdfFilePath', STORED);
    expect(generate).toHaveBeenCalledTimes(1);

    // Once done, a later miss renders again (the in-flight entry is gone).
    await service.ensureStoredPdf(quote());
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('a render failure surfaces (no silent 404 for a broken Chromium)', async () => {
    const { service, generate } = makeService();
    generate.mockRejectedValueOnce(new Error('Chromium not found'));
    await expect(service.ensureStoredPdf(quote())).rejects.toThrow(
      'Chromium not found',
    );
    // The failed attempt is not cached.
    await expect(service.ensureStoredPdf(quote())).resolves.toHaveProperty(
      'pdfFilePath',
      STORED,
    );
  });
});
