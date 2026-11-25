import {
  DevisLanguage,
  Prisma,
  type Quotation,
  QuotationStatus,
} from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

// puppeteer-core is ESM-only and nothing here launches a browser: only the
// HTML template is under test.
jest.mock('puppeteer-core', () => ({
  __esModule: true,
  default: { launch: jest.fn() },
}));

import { QuotationPdfService } from './quotation-pdf.service';

const service = new QuotationPdfService({} as PrismaService);

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
    companySnapshot: { companyName: 'Oralign', stampDuty: 1 },
    clinicSnapshot: { doctorFullName: 'Dr Doc' },
    createdAt: new Date('2026-11-19T10:00:00Z'),
    packId: 'p-1',
    packName: 'Pack Confort',
    totalPrice: new Prisma.Decimal('2380.000'),
    ...overrides,
  } as Quotation;
}

/**
 * Visible text: tags dropped, whitespace collapsed. \s also matches the
 * no-break and narrow no-break spaces fr-FR puts in amounts.
 */
const text = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

describe('QuotationPdfService.renderHtml — TTC devis', () => {
  it('prints TTC line amounts, HT / TVA / TTC from the row, and the stamp note', () => {
    const page = text(service.renderHtml(quote(), { stampDuty: 1 }));

    expect(page).toContain('Montant TTC');
    expect(page).toContain('Total HT 2 000,000 TND');
    expect(page).toContain('TVA (19 %) 380,000 TND');
    expect(page).toContain('Total TTC 2 380,000 TND');
    expect(page).toContain(
      'Prix TTC (TVA incluse). Droit de timbre (1,000 TND) ajouté à chaque paiement : une facture par paiement.',
    );
    expect(page).not.toContain('inclus dans chaque facture');
    // No plan yet: the number of stamps is unknown, no stamp rows.
    expect(page).not.toContain('Total à payer');
    expect(page).not.toMatch(/Droit de timbre \(\d+ ×/);
  });

  it('with a plan of 2 installments: two stamp rows after Total TTC, the last one final', () => {
    const html = service.renderHtml(quote(), {
      stampDuty: 1,
      installmentCount: 2,
    });
    const page = text(html);

    expect(page).toContain(
      'Total TTC 2 380,000 TND Droit de timbre (2 × 1,000) 2,000 TND Total à payer 2 382,000 TND',
    );
    // A single dark row: the total to pay, not Total TTC any more.
    const finals = html.match(/total-row final[\s\S]*?<\/div>/g) ?? [];
    expect(finals).toHaveLength(1);
    expect(text(finals[0] ?? '')).toContain('Total à payer');
  });

  it('the stamp rows need a known stamp: none when it is unknown or 0', () => {
    for (const stampDuty of [null, 0]) {
      const page = text(
        service.renderHtml(quote(), { stampDuty, installmentCount: 3 }),
      );
      expect(page).not.toContain('Total à payer');
    }
  });

  it('says the same in Arabic and in English', () => {
    const ar = text(
      service.renderHtml(quote({ language: DevisLanguage.ar }), {
        stampDuty: 1,
        installmentCount: 3,
      }),
    );
    expect(ar).toContain('المبلغ شامل الضريبة');
    expect(ar).toContain('يُضاف معلوم الطابع الجبائي');
    expect(ar).toContain('فاتورة لكل دفعة');
    expect(ar).toContain('المبلغ الجملي للدفع');

    const enPlan = text(
      service.renderHtml(quote({ language: DevisLanguage.en }), {
        stampDuty: 1,
        installmentCount: 3,
      }),
    );
    expect(enPlan).toContain(
      'Prices include TVA. Stamp duty (1,000 TND) added to each payment: one invoice per payment.',
    );
    expect(enPlan).toContain('Stamp duty (3 × 1,000) 3,000 TND');
    expect(enPlan).toContain('Total to pay 2 383,000 TND');

    const en = text(
      service.renderHtml(quote({ language: DevisLanguage.en }), {
        stampDuty: null,
      }),
    );
    expect(en).toContain('Amount incl. TVA');
    // An unknown stamp is left out rather than printed as 0.
    expect(en).toContain('Prices include TVA.');
    expect(en).not.toContain('Stamp duty');
  });

  it('keeps the legacy layout for a quote computed forward from HT fees', () => {
    const page = text(
      service.renderHtml(
        quote({
          packId: null,
          treatmentFees: 1000,
          subTotalHt: 1000,
          tvaAmount: 190,
          totalTtc: 1190,
        }),
        { stampDuty: 1 },
      ),
    );

    expect(page).not.toContain('Montant TTC');
    expect(page).toContain('Montant');
    expect(page).toContain('Total TTC 1 190,000 TND');
    expect(page).not.toContain('Prix TTC.');
  });
});
