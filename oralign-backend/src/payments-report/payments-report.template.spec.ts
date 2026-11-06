import { PaymentMethod, PaymentRecordStatus, Prisma } from '@prisma/client';
import {
  emptyMethodTallies,
  type MethodTallies,
} from '../payments/services/payments-summary.service';
import { PaymentsReportKind } from './dto/payments-report.dto';
import type {
  PaymentsReportModel,
  ReportRow,
  ReportSection,
} from './payments-report.model';
import {
  escapeHtml,
  formatCalendarDayLong,
  formatMoney,
  formatMoneyValue,
  paymentsReportFileName,
  renderPaymentsReportFooter,
  renderPaymentsReportHtml,
} from './payments-report.template';
import { paymentsReportLabels } from './payments-report.i18n';

const NBSP = String.fromCharCode(0xa0);
const d = (value: string) => new Prisma.Decimal(value);

function tallies(
  parts: Partial<Record<PaymentMethod, [string, number]>>,
): MethodTallies {
  const out = emptyMethodTallies();
  for (const [method, [amount, count]] of Object.entries(parts) as [
    PaymentMethod,
    [string, number],
  ][]) {
    out[method] = { amount: d(amount), count };
  }
  return out;
}

function row(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    // 2026-11-06 00:30 in Tunis is still the 5th in UTC.
    date: new Date('2026-11-05T23:30:00.000Z'),
    orderCode: 'ORD-1001',
    practitioner: 'Dr Salma Trabelsi',
    patient: 'Meriem Zouari',
    method: PaymentMethod.cash,
    status: PaymentRecordStatus.success,
    amount: d('1200'),
    transactionRef: 'CSH-77',
    receiptNumber: 'FAC-000042',
    installment: null,
    ...overrides,
  };
}

function section(overrides: Partial<ReportSection> = {}): ReportSection {
  return {
    kind: 'treatment_fee',
    criteria: {
      practitioner: null,
      methods: [],
      statuses: [],
      search: null,
      installment: null,
    },
    rows: [row()],
    collected: tallies({ cash: ['1200', 1] }),
    ...overrides,
  };
}

function model(
  overrides: Partial<PaymentsReportModel> = {},
): PaymentsReportModel {
  return {
    lang: 'fr',
    kind: PaymentsReportKind.treatmentFee,
    period: { from: '2026-11-01', to: '2026-11-06', allDates: false },
    generatedAt: new Date('2026-11-06T13:32:00.000Z'),
    generatedBy: 'Admin Oralign',
    showPractitioner: true,
    brandName: 'ORALIGN',
    company: {
      name: 'ORALIGN by Aura Aligners',
      tradeName: null,
      legalForm: 'SUARL',
      address: '1 rue du Lac',
      city: 'Tunis',
      country: 'Tunisie',
      phone: '+216 71 000 000',
      email: 'contact@example.com',
      taxNumber: '1234567/A',
      tradeRegister: null,
      website: null,
    },
    logo: { dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=', source: 'official' },
    sections: [section()],
    currency: 'TND',
    ...overrides,
  };
}

/**
 * The text of the document, tags dropped and ASCII spaces collapsed (the
 * no-break spaces inside amounts are kept: `\s` would eat them).
 */
const text = (html: string) =>
  html
    .replace(/<style>[\s\S]*?<\/style>/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t\r\n]+/g, ' ');

describe('payments report template', () => {
  describe('money', () => {
    it('prints the Decimal exactly, 3 decimals, grouped by no-break spaces', () => {
      expect(formatMoneyValue(d('1234567.5'))).toBe(
        `1${NBSP}234${NBSP}567,500`,
      );
      expect(formatMoneyValue(d('0.1').plus(d('0.2')))).toBe('0,300');
      expect(formatMoneyValue(d('999'))).toBe('999,000');
      expect(formatMoney(d('1350'), 'TND')).toBe(`1${NBSP}350,000${NBSP}TND`);
    });

    it('marks a negative amount with a real minus sign, never zero', () => {
      expect(formatMoneyValue(d('-12.5'))).toBe('−12,500');
      expect(formatMoneyValue(d('-0'))).toBe('0,000');
    });
  });

  describe('dates', () => {
    it('writes the first of the month "1er" in French', () => {
      const fr = paymentsReportLabels('fr');
      const en = paymentsReportLabels('en');
      expect(formatCalendarDayLong('2026-11-01', fr)).toBe('1er novembre 2026');
      expect(formatCalendarDayLong('2026-11-06', fr)).toBe('6 novembre 2026');
      expect(formatCalendarDayLong('2026-11-01', en)).toBe('1 November 2026');
    });

    it('prints a payment on its Tunis day and time', () => {
      const html = renderPaymentsReportHtml(model());
      expect(html).toContain(
        '<div>06/11/2026</div><div class="sub">00:30</div>',
      );
    });

    it('prints the period Du / Au in words', () => {
      const html = text(renderPaymentsReportHtml(model()));
      expect(html).toContain('Du 1er novembre 2026');
      expect(html).toContain('Au 6 novembre 2026');
      expect(html).toContain('Généré le 6 novembre 2026 à 14:32');
    });

    it('"all dates" names its end day', () => {
      const html = text(
        renderPaymentsReportHtml(
          model({ period: { from: null, to: '2026-11-06', allDates: true } }),
        ),
      );
      expect(html).toContain('Toutes les dates (jusqu’au 6 novembre 2026)');
    });
  });

  describe('header', () => {
    it('shows the logo, ORALIGN and the title', () => {
      const html = renderPaymentsReportHtml(model());
      expect(html).toContain(
        '<img class="logo" src="data:image/svg+xml;base64,PHN2Zz4="',
      );
      expect(html).toContain('<div class="eyebrow">ORALIGN</div>');
      expect(html).toContain('<h1 class="title">RAPPORT DES PAIEMENTS</h1>');
    });

    it('falls back to the brand word when no logo can be read', () => {
      const html = renderPaymentsReportHtml(model({ logo: null }));
      expect(html).toContain('<div class="brand-word">ORALIGN</div>');
      expect(html).not.toContain('<img');
    });

    it('prints the issuer from the settings only, without empty lines', () => {
      const html = text(renderPaymentsReportHtml(model()));
      expect(html).toContain(
        'ORALIGN by Aura Aligners SUARL 1 rue du Lac Tunis, Tunisie',
      );
      expect(html).toContain('Matricule fiscal : 1234567/A');
      expect(html).not.toContain('Registre de commerce');
    });

    it('lists the criteria: every practitioner, method and status by default', () => {
      const html = text(renderPaymentsReportHtml(model()));
      expect(html).toContain('Type de rapport Honoraires de traitement');
      expect(html).toContain('Praticien Tous les praticiens');
      expect(html).toContain('Mode de paiement Tous les modes');
      expect(html).toContain('Statut Tous les statuts');
      expect(html).toContain('Recherche Aucune');
    });

    it('names the filters picked, in the desk order', () => {
      const html = text(
        renderPaymentsReportHtml(
          model({
            sections: [
              section({
                criteria: {
                  practitioner: 'Dr Salma Trabelsi',
                  methods: [PaymentMethod.bank_transfer, PaymentMethod.cash],
                  statuses: [
                    PaymentRecordStatus.failed,
                    PaymentRecordStatus.success,
                  ],
                  search: 'Zouari',
                  installment: null,
                },
              }),
            ],
          }),
        ),
      );
      expect(html).toContain('Praticien Dr Salma Trabelsi');
      expect(html).toContain('Mode de paiement Espèces, Virement bancaire');
      expect(html).toContain('Statut Succès, Échoué');
      expect(html).toContain(`Recherche «${NBSP}Zouari${NBSP}»`);
    });

    it('leaves the practitioner out of a dentist’s own report', () => {
      const html = text(
        renderPaymentsReportHtml(model({ showPractitioner: false })),
      );
      expect(html).not.toContain('Tous les praticiens');
      expect(html).not.toContain('Dr Salma Trabelsi');
    });
  });

  describe('summary', () => {
    it('counts and sums each method, then the total collected', () => {
      const html = text(
        renderPaymentsReportHtml(
          model({
            sections: [
              section({
                collected: tallies({ cash: ['1350', 2], card: ['1000.5', 2] }),
              }),
            ],
          }),
        ),
      );
      expect(html).toContain(`Espèces 2 1${NBSP}350,000${NBSP}TND`);
      expect(html).toContain(`Carte bancaire 2 1${NBSP}000,500${NBSP}TND`);
      expect(html).toContain(`Virement bancaire 0 0,000${NBSP}TND`);
      expect(html).toContain(`TOTAL ENCAISSÉ 4 2${NBSP}350,500${NBSP}TND`);
    });

    it('consolidated: each kind, then both added, nothing counted twice', () => {
      const html = text(
        renderPaymentsReportHtml(
          model({
            kind: PaymentsReportKind.consolidated,
            sections: [
              section({ collected: tallies({ cash: ['300', 2] }) }),
              section({
                kind: 'installment',
                collected: tallies({ cash: ['1200', 1], card: ['850.5', 1] }),
              }),
            ],
          }),
        ),
      );
      expect(html).toContain(
        `Espèces 2 300,000${NBSP}TND 1 1${NBSP}200,000${NBSP}TND 3 1${NBSP}500,000${NBSP}TND`,
      );
      expect(html).toContain(
        `TOTAL ENCAISSÉ 2 300,000${NBSP}TND 2 2${NBSP}050,500${NBSP}TND 4 2${NBSP}350,500${NBSP}TND`,
      );
    });

    it('says that only successful payments are counted, and how many rows are not', () => {
      const html = text(
        renderPaymentsReportHtml(
          model({
            sections: [
              section({
                rows: [
                  row(),
                  row({
                    status: PaymentRecordStatus.failed,
                    receiptNumber: null,
                  }),
                  row({ status: PaymentRecordStatus.awaiting_confirmation }),
                ],
              }),
            ],
          }),
        ),
      );
      expect(html).toContain(
        'Seuls les paiements réussis sont comptabilisés comme encaissés.',
      );
      expect(html).toContain(
        'Statuts dans le détail : Succès 1 À confirmer 1 Échoué 1',
      );
    });
  });

  describe('details', () => {
    it('one row per payment, the amount right-aligned, the header repeated on each page', () => {
      const html = renderPaymentsReportHtml(model());
      expect(html).toContain('.lines thead { display: table-header-group; }');
      expect(html).toContain(
        '<td class="num amount">1&nbsp;200,000&nbsp;TND</td>'.replace(
          /&nbsp;/g,
          NBSP,
        ),
      );
      expect(text(html)).toContain('CSH-77 Reçu FAC-000042');
    });

    it('a fee still to confirm has no date yet', () => {
      const html = text(
        renderPaymentsReportHtml(
          model({
            sections: [
              section({
                rows: [
                  row({
                    date: null,
                    status: PaymentRecordStatus.awaiting_confirmation,
                    receiptNumber: null,
                  }),
                ],
              }),
            ],
          }),
        ),
      );
      expect(html).toContain('À confirmer');
    });

    it('an installment shows its rank, its quote size and its pack', () => {
      const html = text(
        renderPaymentsReportHtml(
          model({
            kind: PaymentsReportKind.installment,
            sections: [
              section({
                kind: 'installment',
                rows: [
                  row({
                    installment: {
                      rank: 2,
                      total: 3,
                      packName: 'Pack Confort',
                    },
                  }),
                ],
              }),
            ],
          }),
        ),
      );
      expect(html).toContain('ORD-1001 Échéance 2/3 · Pack Confort');
    });

    it('an empty section says so instead of an empty table', () => {
      const html = renderPaymentsReportHtml(
        model({
          sections: [section({ rows: [], collected: emptyMethodTallies() })],
        }),
      );
      expect(text(html)).toContain(
        'Aucun paiement trouvé pour les critères sélectionnés.',
      );
      expect(html).not.toContain('<table class="lines">');
      expect(text(html)).toContain(`TOTAL ENCAISSÉ 0 0,000${NBSP}TND`);
    });

    it('escapes every value that comes from the data', () => {
      const html = renderPaymentsReportHtml(
        model({
          sections: [
            section({
              rows: [
                row({
                  patient: '<img src=x onerror=alert(1)>',
                  orderCode: '"><script>',
                }),
              ],
              criteria: {
                practitioner: null,
                methods: [],
                statuses: [],
                search: '</td><script>alert(1)</script>',
                installment: null,
              },
            }),
          ],
        }),
      );
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });
  });

  describe('English', () => {
    it('prints every label in English', () => {
      const html = text(renderPaymentsReportHtml(model({ lang: 'en' })));
      expect(html).toContain('PAYMENTS REPORT');
      expect(html).toContain('From 1 November 2026');
      expect(html).toContain('Report type Treatment fees');
      expect(html).toContain(`TOTAL COLLECTED 1 1${NBSP}200,000${NBSP}TND`);
      expect(html).toContain('Payment date');
      expect(html).not.toContain('Encaissé');
      // English punctuation: no space before a colon.
      expect(html).toContain('Tax number: 1234567/A');
      expect(html).not.toContain('Tax number :');
    });

    it('consolidated: short column headings under each group', () => {
      const html = text(
        renderPaymentsReportHtml(
          model({
            lang: 'en',
            kind: PaymentsReportKind.consolidated,
            sections: [section(), section({ kind: 'installment' })],
          }),
        ),
      );
      expect(html).toContain(
        'Treatment fees Installment payments Total collected',
      );
      expect(html).toContain('No. Amount No. Amount No. Amount');
    });
  });

  describe('footer and file name', () => {
    it('numbers the pages "Page X / Y" and repeats the issuer', () => {
      const footer = renderPaymentsReportFooter(model());
      expect(footer).toContain(
        'Page <span class="pageNumber"></span> / <span class="totalPages"></span>',
      );
      expect(footer).toContain('ORALIGN by Aura Aligners');
      expect(footer).toContain(
        'Rapport des paiements · 01/11/2026 – 06/11/2026',
      );
    });

    it('names the file after the report and its days', () => {
      expect(paymentsReportFileName(model())).toBe(
        'Oralign_Rapport_Paiements_Honoraires_2026-11-01_2026-11-06.pdf',
      );
      expect(
        paymentsReportFileName(
          model({ lang: 'en', kind: PaymentsReportKind.consolidated }),
        ),
      ).toBe('Oralign_Payments_Report_Consolidated_2026-11-01_2026-11-06.pdf');
      expect(
        paymentsReportFileName(
          model({ period: { from: null, to: '2026-11-06', allDates: true } }),
        ),
      ).toBe(
        'Oralign_Rapport_Paiements_Honoraires_toutes-dates_2026-11-06.pdf',
      );
    });

    it('escapes HTML', () => {
      expect(escapeHtml('<a href="x">\'&`')).toBe(
        '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#96;',
      );
    });
  });
});
