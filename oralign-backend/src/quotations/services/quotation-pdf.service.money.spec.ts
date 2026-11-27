// The default import is the real `fs` module object (esModuleInterop), the
// one the service's namespace import reads through: spying on it works.
import fs from 'fs';
import {
  DevisLanguage,
  InstallmentStatus,
  PaymentRecordStatus,
  Prisma,
  type Quotation,
  QuotationStatus,
} from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CompanyBillingSettingsService } from './company-billing-settings.service';

// puppeteer-core is ESM-only and nothing here launches a browser.
jest.mock('puppeteer-core', () => ({
  __esModule: true,
  default: { launch: jest.fn() },
}));

import { QuotationPdfService } from './quotation-pdf.service';

const D = (v: string | number) => new Prisma.Decimal(v);

/** A sent devis whose snapshot froze the retenue rule (since 2026-11-27). */
function quote(overrides: Partial<Quotation> = {}): Quotation {
  return {
    id: 'q-1',
    orderId: 'o-1',
    quotationNumber: 'DEV-000001',
    language: DevisLanguage.fr,
    status: QuotationStatus.sent,
    treatmentFees: 2380,
    fabricationFees: 0,
    deliveryFees: 0,
    discountAmount: 0,
    subTotalHt: 2000,
    tvaRate: 19,
    tvaAmount: 380,
    totalTtc: 2380,
    currency: 'TND',
    notes: null,
    adminMessage: null,
    companySnapshot: {
      companyName: 'Oralign',
      stampDuty: 1,
      withholdingEnabled: true,
      withholdingRate: 1,
      withholdingThreshold: 1000,
    },
    clinicSnapshot: {
      doctorFullName: 'Dr Doc',
      clinicName: 'Cabinet Les Pins',
      clinicPhone: null,
      contactPhone: '+21620000000',
      contactEmail: 'contact@lespins.tn',
    },
    createdAt: new Date('2026-11-19T10:00:00Z'),
    packId: 'p-1',
    packName: 'Pack Confort',
    totalPrice: D('2380.000'),
    deletedAt: null,
    ...overrides,
  } as Quotation;
}

const text = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

const RULE_ON = { enabled: true, rate: 1, threshold: 1000 };

describe('QuotationPdfService.renderHtml — « Retenue si appliquée » (spec §4)', () => {
  const service = new QuotationPdfService({} as PrismaService);

  it('no plan, total above the threshold: the estimate and its net, under the totals', () => {
    const page = text(
      service.renderHtml(quote(), { stampDuty: 1, withholdingRule: RULE_ON }),
    );
    expect(page).toContain(
      'Retenue à la source si appliquée (1 %) - 23,800 TND Net à payer si retenue appliquée 2 356,200 TND',
    );
    expect(page).toContain(
      'Estimation : la retenue à la source est appliquée par le praticien au moment du paiement, sur chaque paiement d’au moins 1 000,000 TND.',
    );
  });

  it('with a plan: each installment is its own base, the net counts the stamps', () => {
    const page = text(
      service.renderHtml(quote(), {
        stampDuty: 1,
        installmentCount: 2,
        installmentAmounts: [1190, 1190],
        withholdingRule: RULE_ON,
      }),
    );
    // 1 % of 1190 twice = 23.800; total to pay 2 382 - 23.800.
    expect(page).toContain(
      'Retenue à la source si appliquée (1 %) - 23,800 TND',
    );
    expect(page).toContain('Net à payer si retenue appliquée 2 358,200 TND');
  });

  it('installments under the threshold: no retenue row at all', () => {
    const html = service.renderHtml(quote(), {
      stampDuty: 1,
      installmentCount: 3,
      installmentAmounts: [793.334, 793.333, 793.333],
      withholdingRule: RULE_ON,
    });
    expect(text(html)).not.toContain('si appliquée');
    expect(html).not.toContain('totals after');
  });

  it('switched off, or no rule known: nothing printed', () => {
    for (const withholdingRule of [
      { ...RULE_ON, enabled: false },
      null,
      undefined,
    ]) {
      const page = text(
        service.renderHtml(quote(), { stampDuty: 1, withholdingRule }),
      );
      expect(page).not.toContain('Retenue');
    }
  });

  it('keeps a single dark row in the price block', () => {
    const html = service.renderHtml(quote(), {
      stampDuty: 1,
      withholdingRule: RULE_ON,
      received: 1000,
    });
    expect(html.match(/total-row final/g)).toHaveLength(1);
  });

  it('English and Arabic labels', () => {
    const en = text(
      service.renderHtml(quote({ language: DevisLanguage.en }), {
        stampDuty: 1,
        withholdingRule: RULE_ON,
        received: 1000,
      }),
    );
    expect(en).toContain('Withholding tax if applied (1 %)');
    expect(en).toContain(
      'Already paid 1 000,000 TND Remaining to pay 1 380,000 TND',
    );
    const ar = text(
      service.renderHtml(quote({ language: DevisLanguage.ar }), {
        stampDuty: 1,
        withholdingRule: RULE_ON,
        received: 1000,
      }),
    );
    expect(ar).toContain('الخصم من المورد عند تطبيقه');
    expect(ar).toContain('المبلغ المتبقي للدفع');
  });
});

describe('QuotationPdfService.renderHtml — « Déjà réglé / Reste à payer »', () => {
  const service = new QuotationPdfService({} as PrismaService);

  it('once money was received: what was settled and what remains', () => {
    const page = text(
      service.renderHtml(quote(), { stampDuty: 1, received: 1190 }),
    );
    expect(page).toContain(
      'Déjà réglé 1 190,000 TND Reste à payer 1 190,000 TND',
    );
  });

  it('fully paid: nothing left to pay', () => {
    const page = text(
      service.renderHtml(quote(), { stampDuty: 1, received: 2380 }),
    );
    expect(page).toContain('Reste à payer 0,000 TND');
  });

  it('nothing received: no rows', () => {
    const page = text(
      service.renderHtml(quote(), { stampDuty: 1, received: 0 }),
    );
    expect(page).not.toContain('Déjà réglé');
  });
});

describe('QuotationPdfService.renderHtml — the billed-to contact (DECISIONS §6)', () => {
  const service = new QuotationPdfService({} as PrismaService);

  it('prints THE contact the snapshot froze (practice first, account fallback)', () => {
    const page = text(service.renderHtml(quote(), { stampDuty: 1 }));
    expect(page).toContain('Cabinet Les Pins');
    expect(page).toContain('+21620000000');
    expect(page).toContain('contact@lespins.tn');
  });

  it('an older snapshot without contact keys prints its practice phone and e-mail', () => {
    const page = text(
      service.renderHtml(
        quote({
          clinicSnapshot: {
            doctorFullName: 'Dr Doc',
            clinicPhone: '+21671000000',
            clinicEmail: 'old@lespins.tn',
          },
        }),
        { stampDuty: 1 },
      ),
    );
    expect(page).toContain('+21671000000');
    expect(page).toContain('old@lespins.tn');
  });
});

describe('QuotationPdfService.renderOptions — what the devis reads besides the row', () => {
  function prismaMock(over: Record<string, unknown> = {}) {
    return {
      quoteInstallment: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ amount: D('1190') }, { amount: D('1190') }]),
      },
      payment: {
        groupBy: jest.fn().mockResolvedValue([
          {
            quotationId: 'q-1',
            status: PaymentRecordStatus.success,
            _sum: {
              amount: D('1191'),
              withholdingAmount: D('0'),
              stampAmount: D('1'),
            },
            _count: { _all: 1 },
          },
        ]),
      },
      companyBillingSettings: {
        findFirst: jest.fn().mockResolvedValue({
          withholdingRate: D('1.00'),
          stampDuty: D('1.000'),
          withholdingEnabled: true,
          withholdingThreshold: D('1000.000'),
        }),
      },
      ...over,
    };
  }

  it('the snapshot rule and stamp, the planned installments, the settled total', async () => {
    const prisma = prismaMock();
    const service = new QuotationPdfService(prisma as unknown as PrismaService);
    const options = await service.renderOptions(quote());
    expect(options).toEqual({
      stampDuty: 1,
      installmentCount: 2,
      installmentAmounts: [1190, 1190],
      withholdingRule: { enabled: true, rate: 1, threshold: 1000 },
      received: 1190,
    });
    // Cancelled installments are not payments; the snapshot needs no live read.
    expect(prisma.quoteInstallment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          quotationId: 'q-1',
          status: { not: InstallmentStatus.cancelled },
        },
      }),
    );
    expect(prisma.companyBillingSettings.findFirst).not.toHaveBeenCalled();
  });

  it('an older snapshot falls back to the live stamp and rule', async () => {
    const prisma = prismaMock();
    const service = new QuotationPdfService(prisma as unknown as PrismaService);
    const options = await service.renderOptions(
      quote({ companySnapshot: { companyName: 'Oralign' } }),
    );
    expect(options.stampDuty).toBe(1);
    expect(options.withholdingRule).toMatchObject({ enabled: true });
    expect(prisma.companyBillingSettings.findFirst).toHaveBeenCalledTimes(1);
  });

  it('a failed read leaves its rows out, never the PDF', async () => {
    const prisma = prismaMock({
      quoteInstallment: {
        findMany: jest.fn().mockRejectedValue(new Error('db')),
      },
      payment: { groupBy: jest.fn().mockRejectedValue(new Error('db')) },
    });
    const service = new QuotationPdfService(prisma as unknown as PrismaService);
    const options = await service.renderOptions(quote());
    expect(options).toMatchObject({
      installmentCount: 0,
      installmentAmounts: [],
      received: 0,
    });
  });
});

describe('QuotationPdfService — a draft never freezes its snapshots (DECISIONS §6)', () => {
  it('renders a draft from snapshots built now, and persists only the file path', async () => {
    const prisma = {
      dentalOrder: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          doctor: {
            id: 'doc-1',
            fullName: 'Dr Live',
            email: 'live@mail.tn',
            phone: null,
            dentistProfile: null,
          },
          patient: { fullName: 'Sami' },
        }),
      },
      quotation: {
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Partial<Quotation> }) => ({
            ...quote({ status: QuotationStatus.draft, companySnapshot: null }),
            ...data,
          })),
      },
    };
    const settings = {
      requireActive: jest.fn().mockResolvedValue({
        companyName: 'Oralign',
        stampDuty: D('1.000'),
        withholdingEnabled: false,
        withholdingRate: D('1.00'),
        withholdingThreshold: D('1000.000'),
        legalTextTranslations: null,
        footerTextTranslations: null,
        bankDetails: null,
      }),
    };
    const service = new QuotationPdfService(
      prisma as unknown as PrismaService,
      settings as unknown as CompanyBillingSettingsService,
    );
    const internals = service as unknown as {
      renderToFile: jest.Mock;
      renderOptions: jest.Mock;
    };
    internals.renderToFile = jest.fn().mockResolvedValue(undefined);
    internals.renderOptions = jest.fn().mockResolvedValue({ stampDuty: 1 });
    const mkdir = jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);

    const draft = quote({
      status: QuotationStatus.draft,
      companySnapshot: null,
      clinicSnapshot: null,
    });
    await service.generateAndPersist(draft);

    const [[rendered]] = internals.renderToFile.mock.calls as [[Quotation]];
    expect(rendered.clinicSnapshot).toMatchObject({
      doctorFullName: 'Dr Live',
    });
    expect(rendered.companySnapshot).toMatchObject({ companyName: 'Oralign' });
    const [[update]] = prisma.quotation.update.mock.calls as [
      [{ data: Record<string, unknown> }],
    ];
    expect(Object.keys(update.data)).toEqual(['pdfFilePath']);
    mkdir.mockRestore();
  });

  it('a quote out of draft without a company snapshot is still refused', async () => {
    const service = new QuotationPdfService({} as PrismaService);
    await expect(
      service.generateAndPersist(quote({ companySnapshot: null })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('QuotationPdfService — the stored devis follows each payment', () => {
  function setup(found: Partial<Quotation> | null = {}) {
    const prisma = {
      payment: {
        findUnique: jest.fn().mockResolvedValue({ quotationId: 'q-1' }),
      },
      quotation: {
        findUnique: jest
          .fn()
          .mockResolvedValue(found === null ? null : quote(found)),
      },
    };
    const service = new QuotationPdfService(prisma as unknown as PrismaService);
    const refresh = jest
      .spyOn(service, 'refreshStoredPdf')
      .mockImplementation((q) => Promise.resolve(q));
    return { service, prisma, refresh };
  }

  it('a settled installment re-renders the quote it belongs to', async () => {
    const { service, refresh } = setup({
      pdfFilePath: 'orders/o-1/quotes/x.pdf',
    });
    await service.onQuotePaymentSettled({ paymentId: 'p-1' });
    expect(refresh).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'q-1' }),
    );
  });

  it('a payment without a quote (treatment fee), a deleted quote or no payload: nothing', async () => {
    const { service, prisma, refresh } = setup();
    prisma.payment.findUnique.mockResolvedValueOnce({ quotationId: null });
    await service.onQuotePaymentSettled({ paymentId: 'p-tf' });
    await service.onQuotePaymentSettled({});
    const deleted = setup({ deletedAt: new Date() });
    await deleted.service.onQuotePaymentSettled({ paymentId: 'p-1' });
    expect(refresh).not.toHaveBeenCalled();
    expect(deleted.refresh).not.toHaveBeenCalled();
  });

  it('never throws (the payment committed already)', async () => {
    const { service, prisma } = setup();
    prisma.payment.findUnique.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.onQuotePaymentSettled({ paymentId: 'p-1' }),
    ).resolves.toBeUndefined();
  });
});
