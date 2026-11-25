import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';

jest.mock('../../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: class PdfRendererService {},
}));

import {
  buildAccountingSummary,
  type AccountingSummary,
  type CountedInvoiceRow,
} from './invoice-accounting.service';
import {
  accountingReportFileName,
  escapeHtml,
  formatAmount,
  formatMonth,
  formatPeriod,
  renderAccountingReportFooter,
  renderAccountingReportHtml,
  type AccountingReportModel,
} from './invoice-accounting.template';
import { accountingLabels } from './invoice-accounting.i18n';

const NBSP = String.fromCharCode(0xa0);
const D = (v: string) => new Prisma.Decimal(v);

function row(overrides: Partial<CountedInvoiceRow> & { id: string }): CountedInvoiceRow {
  return {
    status: InvoiceStatus.paid,
    issueDate: new Date('2026-11-05T09:00:00.000Z'),
    tvaRate: 19,
    subTotalHt: D('1000'),
    discountAmount: D('0'),
    tvaAmount: D('190'),
    stampDuty: D('1'),
    totalTtc: D('1191'),
    withholdingAmount: D('0'),
    netPayable: D('1191'),
    paymentMethod: PaymentMethod.card,
    doctorId: null,
    clientName: 'Client',
    clientTaxId: null,
    ...overrides,
  };
}

function summary(
  rows: CountedInvoiceRow[],
  period: AccountingSummary['period'] = { from: '2026-11-01', to: '2026-11-30' },
): AccountingSummary {
  return buildAccountingSummary({
    period,
    rows,
    mixedLines: [
      { invoiceId: 'mixed', tvaRate: null, lineHt: D('1000') },
      { invoiceId: 'mixed', tvaRate: 7, lineHt: D('100') },
    ],
    drafts: { count: 2, totalTtc: D('300.5') },
    cancelled: { count: 1, totalTtc: D('119') },
  });
}

const NOVEMBER_ROWS = [
  row({
    id: 'a',
    withholdingAmount: D('11.9'),
    netPayable: D('1179.1'),
    doctorId: 'd1',
    clientName: 'Dr Salma <Trabelsi>',
    clientTaxId: '1234567/A/M/000',
  }),
  row({
    id: 'mixed',
    status: InvoiceStatus.issued,
    subTotalHt: D('1100'),
    tvaAmount: D('197'),
    totalTtc: D('1298'),
    netPayable: D('1298'),
    paymentMethod: null,
    clientName: 'Dr Karim',
  }),
];

function model(overrides: Partial<AccountingReportModel> = {}): AccountingReportModel {
  return {
    lang: 'fr',
    summary: summary(NOVEMBER_ROWS),
    generatedAt: new Date('2026-11-30T23:30:00.000Z'),
    generatedBy: 'Admin Oralign',
    brandName: 'ORALIGN',
    company: {
      name: 'Oralign SARL',
      tradeName: 'ORALIGN',
      legalForm: 'SARL',
      address: '12 rue du Lac',
      city: 'Tunis',
      country: 'Tunisie',
      phone: '+216 70 000 000',
      email: 'contact@oralign.example',
      taxNumber: '1799999/Z/A/M/000',
      tradeRegister: 'B0123456',
    },
    logo: null,
    currency: 'TND',
    ...overrides,
  };
}

describe('accounting PDF formatting', () => {
  const fr = accountingLabels('fr');
  const en = accountingLabels('en');

  it('amounts: 3 decimals, decimal comma, no-break thousands', () => {
    expect(formatAmount(1234567.5)).toBe(`1${NBSP}234${NBSP}567,500`);
    expect(formatAmount(0)).toBe('0,000');
    expect(formatAmount(-3.21)).toBe('−3,210');
  });

  it('periods in words', () => {
    expect(formatPeriod({ from: '2026-11-01', to: '2026-11-30' }, fr)).toBe(
      'du 01/11/2026 au 30/11/2026',
    );
    expect(formatPeriod({ from: '2026-11-05', to: '2026-11-05' }, fr)).toBe('le 05/11/2026');
    expect(formatPeriod({ from: '2026-11-01', to: null }, fr)).toBe('depuis le 01/11/2026');
    expect(formatPeriod({ from: null, to: '2026-11-30' }, fr)).toBe('jusqu’au 30/11/2026');
    expect(formatPeriod({ from: null, to: null }, fr)).toBe('Toute la période');
    expect(formatPeriod({ from: null, to: null }, en)).toBe('All dates');
    expect(formatPeriod({ from: '2026-11-01', to: '2026-11-30' }, en)).toBe(
      '01/11/2026 to 30/11/2026',
    );
  });

  it('months, capitalised', () => {
    expect(formatMonth('2026-11', fr)).toBe('Novembre 2026');
    expect(formatMonth('2026-12', en)).toBe('December 2026');
  });

  it('file name per the contract', () => {
    expect(accountingReportFileName(model())).toBe('recap-comptable-2026-11-01_2026-11-30.pdf');
    expect(
      accountingReportFileName(model({ summary: summary([], { from: null, to: null }) })),
    ).toBe('recap-comptable-toute-la-periode.pdf');
    // Open end: up to the (Tunis) day it was generated — 1 December here.
    expect(
      accountingReportFileName(
        model({ summary: summary([], { from: '2026-11-01', to: null }) }),
      ),
    ).toBe('recap-comptable-2026-11-01_2026-12-01.pdf');
  });
});

describe('renderAccountingReportHtml', () => {
  const html = renderAccountingReportHtml(model());

  it('is a whole French A4 document with the issuer, the period and the generated-at line', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="fr" dir="ltr">');
    expect(html).toContain('RÉCAPITULATIF COMPTABLE');
    expect(html).toContain('du 01/11/2026 au 30/11/2026');
    expect(html).toContain('Oralign SARL');
    expect(html).toContain(`Matricule fiscal${NBSP}: 1799999/Z/A/M/000`);
    expect(html).toContain('12 rue du Lac');
    // Generated at 00:30 Tunis on 1 December (still 30 November in UTC).
    expect(html).toContain('01/12/2026 à 00:30');
    expect(html).toContain('Admin Oralign');
  });

  it('prints the key figures', () => {
    for (const label of [
      'Chiffre d’affaires HT',
      'TVA collectée',
      'Droit de timbre',
      'Total TTC',
      'Retenues à la source',
      'Encaissé',
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain(`2${NBSP}100,000${NBSP}TND`); // HT 1000 + 1100
    expect(html).toContain(`387,000${NBSP}TND`); // TVA 190 + 197
    expect(html).toContain('2 factures timbrées');
    expect(html).toContain(`Reste à encaisser : 1${NBSP}298,000${NBSP}TND (1)`);
  });

  it('the TVA table per rate, labelled for the return, with its total', () => {
    expect(html).toContain('TVA collectée par taux');
    expect(html).toContain('Pour la déclaration mensuelle');
    expect(html).toContain(`19${NBSP}%`);
    expect(html).toContain(`7${NBSP}%`);
    // 19 %: 1000 + 1000; 7 %: 100.
    expect(html).toContain(`2${NBSP}000,000`);
    expect(html).toContain('100,000');
    expect(html).toContain('À reporter sur la déclaration');
    expect(html).toContain('Droit de timbre (2 factures)');
  });

  it('the retenues per practitioner, escaped, with the certificate note', () => {
    expect(html).toContain('Retenues à la source subies, par praticien');
    expect(html).toContain('Dr Salma &lt;Trabelsi&gt;');
    expect(html).not.toContain('<Trabelsi>');
    expect(html).toContain('1234567/A/M/000');
    expect(html).toContain('11,900');
    expect(html).toContain('certificat de retenue');
  });

  it('the payment-method table, and the notes on what is left out', () => {
    expect(html).toContain('Encaissements par mode de paiement');
    expect(html).toContain('Carte bancaire');
    expect(html).toContain('2 brouillons');
    expect(html).toContain(`300,500${NBSP}TND`);
    expect(html).toContain('1 facture annulée');
    expect(html).toContain('Une facture à plusieurs taux');
  });

  it('no month table for a single month; one when the period spans two', () => {
    expect(html).not.toContain('Ventilation mensuelle');
    const spanning = renderAccountingReportHtml(
      model({
        summary: summary([
          ...NOVEMBER_ROWS,
          row({ id: 'dec', issueDate: new Date('2026-11-30T23:30:00.000Z') }),
        ]),
      }),
    );
    expect(spanning).toContain('Ventilation mensuelle');
    expect(spanning).toContain('Novembre 2026');
    expect(spanning).toContain('Décembre 2026');
  });

  it('every table has fixed column widths that add up to 100 % (no A4 overflow)', () => {
    const spanning = renderAccountingReportHtml(
      model({
        summary: summary([...NOVEMBER_ROWS, row({ id: 'dec', issueDate: new Date('2026-12-02T09:00:00.000Z') })]),
      }),
    );
    const groups = [...spanning.matchAll(/<colgroup>(.*?)<\/colgroup>/g)].map((m) =>
      [...m[1].matchAll(/width:([\d.]+)%/g)].reduce((acc, w) => acc + Number(w[1]), 0),
    );
    expect(groups.length).toBeGreaterThanOrEqual(4);
    for (const total of groups) expect(total).toBeCloseTo(100, 1);
    expect(spanning).toContain('table-layout: fixed');
  });

  it('an empty period says so instead of printing empty tables', () => {
    const empty = renderAccountingReportHtml(
      model({ summary: summary([], { from: null, to: null }) }),
    );
    expect(empty).toContain('Toute la période');
    expect(empty).toContain('Aucune facture comptabilisée sur la période.');
    expect(empty).toContain('Aucune retenue à la source sur la période.');
    expect(empty).toContain('Aucune facture payée sur la période.');
  });

  it('English on request', () => {
    const english = renderAccountingReportHtml(model({ lang: 'en' }));
    expect(english).toContain('<html lang="en"');
    expect(english).toContain('ACCOUNTING SUMMARY');
    expect(english).toContain('VAT collected per rate');
    expect(english).toContain('Withholding tax suffered, per practitioner');
    expect(english).toContain('01/11/2026 to 30/11/2026');
  });

  it('the running footer carries the issuer, the period and the page numbers', () => {
    const footer = renderAccountingReportFooter(model());
    expect(footer).toContain('Oralign SARL');
    expect(footer).toContain('Matricule fiscal 1799999/Z/A/M/000');
    expect(footer).toContain('Récapitulatif comptable · du 01/11/2026 au 30/11/2026');
    expect(footer).toContain('<span class="pageNumber"></span> / <span class="totalPages"></span>');
  });

  it('escapes what it prints', () => {
    expect(escapeHtml('<b>"x"</b>')).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  });
});
