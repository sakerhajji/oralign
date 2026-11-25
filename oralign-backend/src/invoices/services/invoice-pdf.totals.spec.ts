// puppeteer-core is ESM-only and nothing here launches a browser.
jest.mock('puppeteer-core', () => ({
  __esModule: true,
  default: { launch: jest.fn() },
}));

import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CompanyBillingSettingsService } from '../../quotations/services/company-billing-settings.service';
import { getInvoiceLabels, invoiceLanguageFor } from './invoice-i18n';
import {
  buildInvoiceRecordTotals,
  invoiceRecordPaymentText,
  InvoicePdfService,
  type InvoiceRecordMoney,
  type InvoiceRenderPayload,
} from './invoice-pdf.service';

const fr = getInvoiceLabels('fr');
const en = getInvoiceLabels('en');
const money = (v: number) => v.toFixed(3);
const rate = (v: number) => String(v);

// Installment 2380 TTC = HT 2000 + TVA 380; the stamp is added: 2381.
const BASE: InvoiceRecordMoney = {
  status: InvoiceStatus.paid,
  pricesIncludeTax: true,
  tvaRate: 19,
  discountAmount: 0,
  stampDuty: 1,
  subTotalHt: 2000,
  tvaAmount: 380,
  totalTtc: 2381,
  withholdingRate: null,
  withholdingAmount: 0,
  netPayable: 2381,
};

const rows = (inv: InvoiceRecordMoney, labels = fr) =>
  buildInvoiceRecordTotals(inv, labels, money, rate).map((l) => [
    l.label,
    l.value,
    l.kind ?? 'normal',
  ]);

describe('buildInvoiceRecordTotals — remise typed as a percentage', () => {
  it('prints the percentage next to the remise', () => {
    const labels = rows({
      ...BASE,
      discountAmount: 238,
      discountPercent: 10,
      totalTtc: 2142,
    }).map(([label]) => label);
    expect(labels).toContain(`${fr.discount} (10 %)`);
  });

  it('keeps the plain label for a remise typed as an amount', () => {
    const labels = rows({ ...BASE, discountAmount: 238, totalTtc: 2142 }).map(
      ([label]) => label,
    );
    expect(labels).toContain(fr.discount);
  });
});

describe('buildInvoiceRecordTotals (the FACTURE totals block)', () => {
  it('HT, TVA, the stamp ADDED, Total TTC final, then the amount paid', () => {
    expect(rows(BASE)).toEqual([
      ['Total HT', '2000.000', 'normal'],
      ['TVA (19 %)', '380.000', 'normal'],
      ['Droit de timbre', '1.000', 'normal'],
      ['Total TTC', '2381.000', 'final'],
      ['Montant payé', '2381.000', 'paid'],
    ]);
  });

  it('the owner example: 1000 + stamp 1, retenue 1 % => Total TTC 1001, retenue 10, net 991', () => {
    expect(
      rows({
        ...BASE,
        subTotalHt: 840.336,
        tvaAmount: 159.664,
        totalTtc: 1001,
        withholdingRate: 1,
        withholdingAmount: 10,
        netPayable: 991,
      }),
    ).toEqual([
      ['Total HT', '840.336', 'normal'],
      ['TVA (19 %)', '159.664', 'normal'],
      ['Droit de timbre', '1.000', 'normal'],
      ['Total TTC', '1001.000', 'normal'],
      ['Retenue à la source (1 %)', '- 10.000', 'normal'],
      ['Net à payer', '991.000', 'final'],
      ['Montant payé', '991.000', 'paid'],
    ]);
  });

  it('with a retenue: Total TTC, the retenue as a negative line, Net à payer final, paid = net', () => {
    expect(
      rows({
        ...BASE,
        withholdingRate: 1.5,
        withholdingAmount: 35.7,
        netPayable: 2345.3,
      }),
    ).toEqual([
      ['Total HT', '2000.000', 'normal'],
      ['TVA (19 %)', '380.000', 'normal'],
      ['Droit de timbre', '1.000', 'normal'],
      ['Total TTC', '2381.000', 'normal'],
      ['Retenue à la source (1.5 %)', '- 35.700', 'normal'],
      ['Net à payer', '2345.300', 'final'],
      ['Montant payé', '2345.300', 'paid'],
    ]);
  });

  it('TTC pricing with a discount opens with the gross TTC of the lines (stamp excluded) and the discount', () => {
    // 2400 of lines - 20 = 2380, + 1 stamp = 2381: the gross is 2400.
    expect(
      rows({ ...BASE, discountAmount: 20, status: InvoiceStatus.issued }).slice(0, 3),
    ).toEqual([
      ['Total TTC brut', '2400.000', 'normal'],
      ['Remise', '- 20.000', 'normal'],
      ['Total HT', '2000.000', 'normal'],
    ]);
  });

  it('HT pricing with a discount labels the gross line "Total HT brut", never "Total HT" twice', () => {
    const labels = rows({
      ...BASE,
      pricesIncludeTax: false,
      discountAmount: 10,
      subTotalHt: 90,
    }).map(([label]) => label);
    expect(labels.slice(0, 3)).toEqual(['Total HT brut', 'Remise', 'Total HT']);
    expect(labels.filter((l) => l === 'Total HT')).toHaveLength(1);
  });

  it('an unpaid invoice prints no "Montant payé"; no stamp line when there is none', () => {
    const out = rows({ ...BASE, status: InvoiceStatus.issued, stampDuty: 0 });
    expect(out.map(([label]) => label)).toEqual(['Total HT', 'TVA (19 %)', 'Total TTC']);
  });

  it('a legacy row left at netPayable 0 pays its total', () => {
    expect(rows({ ...BASE, netPayable: 0 }).pop()).toEqual([
      'Montant payé',
      '2381.000',
      'paid',
    ]);
  });

  it('English labels', () => {
    expect(
      rows(
        { ...BASE, withholdingRate: 1, withholdingAmount: 23.8, netPayable: 2357.2 },
        en,
      ).map(([label]) => label),
    ).toEqual([
      'Subtotal',
      'TVA (19 %)',
      'Stamp duty',
      'Total incl. TVA',
      'Withholding tax (1 %)',
      'Net amount due',
      'Amount paid',
    ]);
  });
});

describe('invoiceRecordPaymentText (the settlement line)', () => {
  const formatDate = () => '19 nov. 2026';

  it('method, "Réglée le" when paid, and the reference', () => {
    expect(
      invoiceRecordPaymentText({
        method: PaymentMethod.card,
        reference: 'CTP-42',
        paidAt: new Date(),
        paid: true,
        labels: fr,
        formatDate,
      }),
    ).toBe('Mode de paiement : Carte bancaire · Réglée le 19 nov. 2026 · Réf. CTP-42');
  });

  it('no "Réglée le" on an unpaid invoice; cheque has its own label', () => {
    expect(
      invoiceRecordPaymentText({
        method: PaymentMethod.cheque,
        reference: null,
        paidAt: null,
        paid: false,
        labels: fr,
        formatDate,
      }),
    ).toBe('Mode de paiement : Chèque');
  });

  it('a generated placeholder (cash_<uuid>, bank_<uuid>…) is not a reference', () => {
    for (const reference of [
      'cash_1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
      'cheque_1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
      'bank_1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
      'mock_cb_1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
    ]) {
      expect(
        invoiceRecordPaymentText({
          method: PaymentMethod.cash,
          reference,
          paidAt: null,
          paid: false,
          labels: fr,
          formatDate,
        }),
      ).toBe('Mode de paiement : Espèces');
    }
    // A real reference that merely starts the same way stays.
    expect(
      invoiceRecordPaymentText({
        method: PaymentMethod.cheque,
        reference: 'cheque_000123',
        paidAt: null,
        paid: false,
        labels: fr,
        formatDate,
      }),
    ).toBe('Mode de paiement : Chèque · Réf. cheque_000123');
  });

  it('nothing to say => null (the block is hidden)', () => {
    expect(
      invoiceRecordPaymentText({
        method: null,
        reference: '  ',
        paidAt: null,
        paid: false,
        labels: fr,
        formatDate,
      }),
    ).toBeNull();
  });
});

describe('invoice labels', () => {
  it('a FACTURE, never a payment receipt', () => {
    expect(fr.documentTitle).toBe('Facture');
    expect(en.documentTitle).toBe('Invoice');
    expect(fr.legalNotice).not.toMatch(/reçu/i);
    expect(en.legalNotice).not.toMatch(/receipt/i);
    expect(fr.invoiceStatusCancelled).toBe('Annulée');
  });

  it('the practitioner language: English only when chosen, French otherwise', () => {
    expect(invoiceLanguageFor('en')).toBe('en');
    expect(invoiceLanguageFor('en-GB')).toBe('en');
    expect(invoiceLanguageFor('fr')).toBe('fr');
    expect(invoiceLanguageFor(null)).toBe('fr');
    expect(invoiceLanguageFor('ar')).toBe('fr');
  });
});

describe('InvoicePdfService — stored invoice rendered as a FACTURE (HTML)', () => {
  const D = (v: string) => new Prisma.Decimal(v);

  const INVOICE = {
    id: 'inv-1',
    invoiceNumber: 'FAC-000100',
    status: InvoiceStatus.paid,
    language: 'fr',
    currency: 'TND',
    doctorId: 'doc-1',
    clientName: 'Dr Amel Ben Salah',
    clientEmail: 'contact@lespins.tn',
    clientPhone: '+21671000000',
    clientAddress: '12 rue des Pins',
    clientCity: 'Tunis',
    clientCountry: 'TN',
    clientTaxId: '1234567/A',
    issueDate: new Date('2026-03-04T10:00:00.000Z'),
    paidAt: new Date('2026-03-04T10:00:00.000Z'),
    pricesIncludeTax: true,
    tvaRate: 19,
    discountAmount: D('0'),
    stampDuty: D('1.000'),
    subTotalHt: D('2000.000'),
    tvaAmount: D('380.000'),
    totalTtc: D('2381.000'),
    withholdingRate: D('1.50'),
    withholdingAmount: D('35.700'),
    netPayable: D('2345.300'),
    paymentMethod: PaymentMethod.card,
    paymentReference: 'CTP-42',
    companySnapshot: null,
    lines: [
      {
        description: 'Pack Confort — Échéance 1 sur 2',
        quantity: D('1'),
        unitPrice: D('2000.000'),
        lineHt: D('2000.000'),
      },
    ],
    order: { orderCode: 'ORD-001' },
    patient: { fullName: 'Sami Trabelsi' },
    doctor: {
      fullName: 'Dr Amel Ben Salah',
      dentistProfile: { clinicName: 'Cabinet Les Pins' },
    },
  };
  const SETTINGS = {
    companyName: 'Oralign',
    companyLogoPath: null,
    defaultCurrency: 'TND',
    defaultTvaRate: 19,
    stampDuty: D('1.000'),
    legalTextTranslations: null,
    bankDetails: { bankName: 'BIAT', rib: '08 000 0000000000000 00' },
  };

  async function html(over: Record<string, unknown> = {}) {
    const prisma = {
      invoice: { findFirst: jest.fn().mockResolvedValue({ ...INVOICE, ...over }) },
    };
    const settings = { requireActive: jest.fn().mockResolvedValue(SETTINGS) };
    const service = new InvoicePdfService(
      prisma as unknown as PrismaService,
      settings as unknown as CompanyBillingSettingsService,
    );
    // The two private steps of renderInvoiceRecordBuffer, minus Chromium.
    const internals = service as unknown as {
      loadInvoiceRecordForRender(
        id: string,
        lang: undefined,
      ): Promise<InvoiceRenderPayload>;
      renderHtml(payload: InvoiceRenderPayload): string;
    };
    const payload = await internals.loadInvoiceRecordForRender('inv-1', undefined);
    return internals.renderHtml(payload).replace(/\s+/g, ' ');
  }

  it('titles it Facture, dates it on its issue date, and bills the practitioner', async () => {
    const out = await html();
    expect(out).toContain('FACTURE');
    expect(out).toMatch(/Date: 04 mars 2026/);
    expect(out).toContain('Statut: Payée');
    expect(out).toContain('Docteur : Dr Amel Ben Salah');
    expect(out).toContain('Cabinet Les Pins');
    expect(out).toContain('Patient : Sami Trabelsi');
    expect(out).toContain('Commande : ORD-001');
    // The e-mail and phone are printed once, not twice.
    expect(out.split('contact@lespins.tn')).toHaveLength(2);
    expect(out.split('+21671000000')).toHaveLength(2);
    expect(out).toContain('Prix unitaire HT');
    expect(out).toContain(
      'Mode de paiement : Carte bancaire · Réglée le 04 mars 2026 · Réf. CTP-42',
    );
    expect(out).toContain('Retenue à la source (1,5 %)');
    expect(out).toContain('Net à payer');
    expect(out).toContain('Facture émise conformément');
    expect(out).not.toMatch(/reçu de paiement/i);
    // Paid by card: no RIB block.
    expect(out).not.toContain('BIAT');
  });

  it('a cancelled invoice says "Annulée", never "Échec"; an issued one shows the RIB', async () => {
    const cancelled = await html({ status: InvoiceStatus.cancelled, paidAt: null });
    expect(cancelled).toContain('Statut: Annulée');
    expect(cancelled).not.toContain('Échec');
    expect(cancelled).not.toContain('Réglée le');

    const issued = await html({
      status: InvoiceStatus.issued,
      paidAt: null,
      paymentMethod: null,
      paymentReference: null,
    });
    expect(issued).toContain('Statut: Émise');
    expect(issued).toContain('BIAT');
    expect(issued).not.toContain('Montant payé');
  });

  // Rows written before "the customer is the practitioner": a manual
  // invoice billed to a PATIENT (doctorId = the patient's dentist), or an
  // old automatic one billed to the clinic name.
  it('an old invoice billed to a patient keeps the plain name: never "Docteur : <patient>", no clinic line', async () => {
    const out = await html({ clientName: 'Sami Trabelsi' });
    expect(out).not.toContain('Docteur :');
    expect(out).toContain('Sami Trabelsi');
    expect(out).not.toContain('Cabinet Les Pins');
    expect(out).toContain('Patient : Sami Trabelsi');
  });

  it('an old automatic invoice billed to the clinic name prints that name once, not as "Docteur"', async () => {
    const out = await html({ clientName: 'Cabinet Ennasr' });
    expect(out).not.toContain('Docteur :');
    expect(out.split('Cabinet Ennasr')).toHaveLength(2);
    expect(out).not.toContain('Cabinet Les Pins');
  });

  it('an invoice with no practitioner linked prints its client name plainly', async () => {
    const out = await html({
      doctorId: null,
      doctor: null,
      clientName: 'Clinique Les Pins SARL',
    });
    expect(out).not.toContain('Docteur :');
    expect(out).toContain('Clinique Les Pins SARL');
  });

  it('the practitioner name matches despite stray spaces', async () => {
    const out = await html({ clientName: '  Dr Amel Ben Salah ' });
    expect(out).toContain('Docteur : Dr Amel Ben Salah');
    expect(out).toContain('Cabinet Les Pins');
  });

  it('never prints a generated transaction id as the reference', async () => {
    const out = await html({
      paymentMethod: PaymentMethod.cash,
      paymentReference: 'cash_1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
    });
    expect(out).toContain(
      'Mode de paiement : Espèces · Réglée le 04 mars 2026',
    );
    expect(out).not.toContain('cash_1b9d6bcd');
    expect(out).not.toContain('Réf.');
  });
});

describe('InvoicePdfService — legacy on-the-fly renderer (no stored invoice)', () => {
  const D = (v: string) => new Prisma.Decimal(v);
  const service = new InvoicePdfService(
    {} as unknown as PrismaService,
    {} as unknown as CompanyBillingSettingsService,
  );
  const internals = service as unknown as {
    buildTotals(payload: InvoiceRenderPayload, labels: typeof fr): {
      label: string;
      value: string;
      kind?: string;
    }[];
    buildLineItems(
      payload: InvoiceRenderPayload,
      labels: typeof fr,
    ): { description: string; amount: number }[];
  };

  function payload(payment: Record<string, unknown>, over: Record<string, unknown> = {}) {
    return {
      payment: {
        id: 'p-1',
        status: 'success',
        paymentMethod: PaymentMethod.bank_transfer,
        transactionId: null,
        paidAt: new Date('2026-11-20T10:00:00.000Z'),
        createdAt: new Date('2026-11-20T10:00:00.000Z'),
        invoiceNumber: 'FAC-000100',
        ...payment,
      },
      quotation: { currency: 'TND', tvaRate: 19, packName: 'Pack Confort' },
      installment: { installmentNumber: 1, totalInstallments: 3 },
      settings: { defaultTvaRate: 19, stampDuty: D('1.000') },
      language: 'fr',
      ...over,
    } as unknown as InvoiceRenderPayload;
  }
  const plain = (lines: { label: string; value: string; kind?: string }[]) =>
    lines.map((l) => [l.label, l.value.replace(/\s/g, ' '), l.kind ?? 'normal']);

  it('ADDS the payment stamp on top of the settled installment, retenue off, net = the cash', () => {
    const p = payload({
      amount: D('991.000'),
      withholdingAmount: D('10.000'),
      stampAmount: D('1.000'),
    });
    expect(plain(internals.buildTotals(p, fr))).toEqual([
      ['Total HT', '840,336 TND', 'normal'],
      ['TVA (19 %)', '159,664 TND', 'normal'],
      ['Droit de timbre', '1,000 TND', 'normal'],
      ['Total TTC', '1 001,000 TND', 'normal'],
      ['Retenue à la source', '- 10,000 TND', 'normal'],
      ['Net à payer', '991,000 TND', 'final'],
      ['Montant payé', '991,000 TND', 'paid'],
    ]);
    // The line is what the payment settled: the installment, stamp excluded.
    expect(internals.buildLineItems(p, fr)[0].amount).toBe(1000);
  });

  it('a payment made before 2026-11-20 (stampAmount 0) prints no stamp, whatever the live setting', () => {
    const p = payload({
      amount: D('2380.000'),
      withholdingAmount: D('0'),
      stampAmount: D('0'),
    });
    const out = plain(internals.buildTotals(p, fr));
    expect(out.map(([label]) => label)).not.toContain('Droit de timbre');
    expect(out).toContainEqual(['Total TTC', '2 380,000 TND', 'final']);
  });

  it('a treatment fee with CBCT: the two lines sum to the fee due, the stamp is on its own row', () => {
    const p = payload(
      {
        amount: D('351.000'),
        withholdingAmount: D('0'),
        stampAmount: D('1.000'),
      },
      { installment: null, cbctFeeAmount: 50 },
    );
    expect(
      internals.buildLineItems(p, fr).map((l) => [l.description, l.amount]),
    ).toEqual([
      ['Honoraires de traitement', 300],
      ['Supplément CBCT', 50],
    ]);
    expect(plain(internals.buildTotals(p, fr))).toContainEqual([
      'Total TTC',
      '351,000 TND',
      'final',
    ]);
  });
});
