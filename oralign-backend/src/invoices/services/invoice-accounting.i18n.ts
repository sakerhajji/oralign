import type { PaymentMethod } from '@prisma/client';

export type AccountingLanguage = 'fr' | 'en';

/** Every word the "Récapitulatif comptable" PDF prints, per language. */
export interface AccountingLabels {
  locale: string;
  documentTitle: string;
  kindChip: string;
  // Meta box
  period: string;
  generatedOn: string;
  generatedBy: string;
  timeZone: string;
  timeZoneValue: string;
  currency: string;
  allPeriod: string;
  periodBetween: (from: string, to: string) => string;
  periodOn: (day: string) => string;
  periodSince: (from: string) => string;
  periodUntil: (to: string) => string;
  generatedAt: (day: string, time: string) => string;
  /** "Matricule fiscal : X" (French spacing) / "Tax ID: X". */
  labelled: (label: string, value: string) => string;
  // Issuer + scope
  issuer: string;
  taxNumber: string;
  tradeRegister: string;
  scope: string;
  countedInvoices: string;
  countedSplit: (issued: number, paid: number) => string;
  excluded: string;
  excludedValue: (drafts: number, cancelled: number) => string;
  excludedAmounts: (drafts: string, cancelled: string) => string;
  rule: string;
  ruleValue: string;
  // KPIs
  keyFigures: string;
  revenueHt: string;
  revenueHtSub: (count: number) => string;
  vatCollected: string;
  vatCollectedSub: string;
  stampDuty: string;
  stampDutySub: (count: number) => string;
  totalTtc: string;
  totalTtcSub: string;
  withholding: string;
  withholdingSub: (practitioners: number) => string;
  collected: string;
  toCollect: (amount: string, count: number) => string;
  check: string;
  checkHtTvaStamp: string;
  checkNet: string;
  // TVA table
  vatTitle: string;
  vatHint: string;
  rate: string;
  rateExempt: string;
  invoices: string;
  invoicesShort: string;
  baseHt: string;
  vatAmount: string;
  totalVat: string;
  declarationTitle: string;
  declTaxableBase: string;
  declExemptBase: string;
  declVat: string;
  declStamp: (count: number) => string;
  declNote: string;
  // Withholding
  withholdingTitle: string;
  practitioner: string;
  practitionerTaxId: string;
  baseTtc: string;
  withheld: string;
  certificate: string;
  certificateBox: string;
  totalWithholding: string;
  noWithholding: string;
  withholdingNote: string;
  // Methods
  methodsTitle: string;
  method: string;
  netCollected: string;
  totalCollected: string;
  noPaid: string;
  methodsNote: string;
  remaining: (count: number, amount: string) => string;
  methods: Record<PaymentMethod, string>;
  methodUnknown: string;
  // Months
  monthsTitle: string;
  month: string;
  ht: string;
  tva: string;
  stamp: string;
  ttc: string;
  retenue: string;
  net: string;
  total: string;
  // Notes
  notesTitle: string;
  amountsIn: (currency: string) => string;
  noteCounting: string;
  noteExcluded: (
    drafts: number,
    draftsAmount: string,
    cancelled: number,
    cancelledAmount: string,
  ) => string;
  noteAmounts: string;
  noteMixed: string;
  noteDiscount: (amount: string) => string;
  noteJournal: string;
  empty: string;
  endOfReport: string;
  automaticNotice: string;
  page: string;
}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count > 1 ? many : one}`;

const FR: AccountingLabels = {
  locale: 'fr-FR',
  documentTitle: 'Récapitulatif comptable',
  kindChip: 'Ventes · TVA · Timbre · Retenues',
  period: 'Période',
  generatedOn: 'Généré le',
  generatedBy: 'Généré par',
  timeZone: 'Fuseau',
  timeZoneValue: 'Heure de Tunis',
  currency: 'Devise',
  allPeriod: 'Toute la période',
  periodBetween: (from, to) => `du ${from} au ${to}`,
  periodOn: (day) => `le ${day}`,
  periodSince: (from) => `depuis le ${from}`,
  periodUntil: (to) => `jusqu’au ${to}`,
  generatedAt: (day, time) => `${day} à ${time}`,
  labelled: (label, value) => `${label}${String.fromCharCode(0xa0)}: ${value}`,
  issuer: 'Émetteur',
  taxNumber: 'Matricule fiscal',
  tradeRegister: 'RC',
  scope: 'Périmètre',
  countedInvoices: 'Factures comptabilisées',
  countedSplit: (issued, paid) =>
    `${plural(issued, 'émise', 'émises')} · ${plural(paid, 'payée', 'payées')}`,
  excluded: 'Écartées des totaux',
  excludedValue: (drafts, cancelled) =>
    `${plural(drafts, 'brouillon', 'brouillons')} · ${plural(cancelled, 'annulée', 'annulées')}`,
  excludedAmounts: (drafts, cancelled) => `Brouillons ${drafts} · annulées ${cancelled} (TTC)`,
  rule: 'Règle',
  ruleValue: 'Date d’émission dans la période, factures non archivées',
  keyFigures: 'Chiffres clés',
  revenueHt: 'Chiffre d’affaires HT',
  revenueHtSub: (count) => plural(count, 'facture', 'factures'),
  vatCollected: 'TVA collectée',
  vatCollectedSub: 'À déclarer, détail par taux ci-dessous',
  stampDuty: 'Droit de timbre',
  stampDutySub: (count) => plural(count, 'facture timbrée', 'factures timbrées'),
  totalTtc: 'Total TTC',
  totalTtcSub: 'HT + TVA + timbre',
  withholding: 'Retenues à la source',
  withholdingSub: (n) =>
    n === 0 ? 'Aucune retenue subie' : `${plural(n, 'praticien', 'praticiens')} · crédit d’impôt`,
  collected: 'Encaissé',
  toCollect: (amount, count) => `Reste à encaisser : ${amount} (${count})`,
  check: 'Contrôle',
  checkHtTvaStamp: 'HT + TVA + timbre = TTC',
  checkNet: 'TTC − retenues = net à payer',
  vatTitle: 'TVA collectée par taux',
  vatHint: 'Pour la déclaration mensuelle',
  rate: 'Taux',
  rateExempt: 'exonéré',
  invoices: 'Factures',
  invoicesShort: 'Fact.',
  baseHt: 'Base HT',
  vatAmount: 'TVA collectée',
  totalVat: 'Total',
  declarationTitle: 'À reporter sur la déclaration',
  declTaxableBase: 'Chiffre d’affaires HT taxable',
  declExemptBase: 'Chiffre d’affaires HT à 0 %',
  declVat: 'TVA collectée',
  declStamp: (count) => `Droit de timbre (${plural(count, 'facture', 'factures')})`,
  declNote:
    'Le droit de timbre s’ajoute à chaque facture et n’entre pas dans la base de la TVA.',
  withholdingTitle: 'Retenues à la source subies, par praticien',
  practitioner: 'Praticien',
  practitionerTaxId: 'Matricule fiscal',
  baseTtc: 'Base TTC hors timbre',
  withheld: 'Retenue',
  certificate: 'Certificat',
  certificateBox: 'reçu',
  totalWithholding: 'Total retenues',
  noWithholding: 'Aucune retenue à la source sur la période.',
  withholdingNote:
    'Les retenues subies sont un crédit d’impôt, imputable sur l’impôt dû (acomptes provisionnels, déclaration annuelle) sur présentation du certificat de retenue à la source que chaque praticien doit remettre. Réclamez un certificat par praticien et cochez-le à réception.',
  methodsTitle: 'Encaissements par mode de paiement',
  method: 'Mode de paiement',
  netCollected: 'Net encaissé',
  totalCollected: 'Total encaissé',
  noPaid: 'Aucune facture payée sur la période.',
  methodsNote:
    'Factures au statut « Payée » : net encaissé = total TTC − retenue à la source.',
  remaining: (count, amount) =>
    `Reste à encaisser : ${plural(count, 'facture émise', 'factures émises')}, ${amount}.`,
  methods: {
    card: 'Carte bancaire',
    bank_transfer: 'Virement bancaire',
    cash: 'Espèces',
    cheque: 'Chèque',
  },
  methodUnknown: 'Non précisé',
  monthsTitle: 'Ventilation mensuelle',
  month: 'Mois',
  ht: 'HT',
  tva: 'TVA',
  stamp: 'Timbre',
  ttc: 'TTC',
  retenue: 'Retenues',
  net: 'Net',
  total: 'Total',
  notesTitle: 'Notes',
  amountsIn: (currency) => `Montants en ${currency}`,
  noteCounting:
    'Sont comptabilisées les factures émises ou payées, non archivées, dont la date d’émission (heure de Tunis) tombe dans la période, bornes incluses.',
  noteExcluded: (drafts, draftsAmount, cancelled, cancelledAmount) =>
    `Écartées des totaux : ${plural(drafts, 'brouillon', 'brouillons')} (${draftsAmount} TTC) et ${plural(cancelled, 'facture annulée', 'factures annulées')} (${cancelledAmount} TTC). Une facture annulée garde son numéro : la séquence reste continue.`,
  noteAmounts:
    'HT = hors taxes ; TTC = TVA comprise, droit de timbre compris. La retenue à la source est calculée sur le TTC hors timbre ; net à payer = TTC − retenue.',
  noteMixed:
    'Une facture à plusieurs taux figure sur chaque ligne de taux concernée : le nombre de factures par taux peut dépasser le total. Les bases et la TVA, elles, s’additionnent exactement.',
  noteDiscount: (amount) =>
    `Remises accordées sur la période : ${amount} (telles que saisies sur chaque facture), déjà déduites des bases et de la TVA.`,
  noteJournal:
    'Le journal des ventes détaillé (une ligne par facture) s’obtient par l’export CSV de la même période.',
  empty: 'Aucune facture comptabilisée sur la période.',
  endOfReport: 'Fin du récapitulatif',
  automaticNotice:
    'Document généré automatiquement à partir des factures enregistrées. Il ne remplace pas les factures elles-mêmes.',
  page: 'Page',
};

const EN: AccountingLabels = {
  locale: 'en-GB',
  documentTitle: 'Accounting summary',
  kindChip: 'Sales · VAT · Stamp duty · Withholding',
  period: 'Period',
  generatedOn: 'Generated on',
  generatedBy: 'Generated by',
  timeZone: 'Time zone',
  timeZoneValue: 'Tunis time',
  currency: 'Currency',
  allPeriod: 'All dates',
  periodBetween: (from, to) => `${from} to ${to}`,
  periodOn: (day) => `on ${day}`,
  periodSince: (from) => `since ${from}`,
  periodUntil: (to) => `up to ${to}`,
  generatedAt: (day, time) => `${day} at ${time}`,
  labelled: (label, value) => `${label}: ${value}`,
  issuer: 'Issuer',
  taxNumber: 'Tax ID',
  tradeRegister: 'Trade register',
  scope: 'Scope',
  countedInvoices: 'Invoices booked',
  countedSplit: (issued, paid) => `${issued} issued · ${paid} paid`,
  excluded: 'Left out of the totals',
  excludedValue: (drafts, cancelled) =>
    `${plural(drafts, 'draft', 'drafts')} · ${cancelled} cancelled`,
  excludedAmounts: (drafts, cancelled) => `Drafts ${drafts} · cancelled ${cancelled} (incl. VAT)`,
  rule: 'Rule',
  ruleValue: 'Issue date within the period, invoices not archived',
  keyFigures: 'Key figures',
  revenueHt: 'Revenue excl. VAT',
  revenueHtSub: (count) => plural(count, 'invoice', 'invoices'),
  vatCollected: 'VAT collected',
  vatCollectedSub: 'To declare, per rate below',
  stampDuty: 'Stamp duty',
  stampDutySub: (count) => plural(count, 'stamped invoice', 'stamped invoices'),
  totalTtc: 'Total incl. VAT',
  totalTtcSub: 'Excl. VAT + VAT + stamp',
  withholding: 'Withholding tax',
  withholdingSub: (n) =>
    n === 0 ? 'None withheld' : `${plural(n, 'practitioner', 'practitioners')} · tax credit`,
  collected: 'Collected',
  toCollect: (amount, count) => `Still to collect: ${amount} (${count})`,
  check: 'Check',
  checkHtTvaStamp: 'excl. VAT + VAT + stamp = incl. VAT',
  checkNet: 'incl. VAT − withholding = net payable',
  vatTitle: 'VAT collected per rate',
  vatHint: 'For the monthly return',
  rate: 'Rate',
  rateExempt: 'exempt',
  invoices: 'Invoices',
  invoicesShort: 'Inv.',
  baseHt: 'Base excl. VAT',
  vatAmount: 'VAT collected',
  totalVat: 'Total',
  declarationTitle: 'To carry to the return',
  declTaxableBase: 'Taxable revenue excl. VAT',
  declExemptBase: 'Revenue excl. VAT at 0 %',
  declVat: 'VAT collected',
  declStamp: (count) => `Stamp duty (${plural(count, 'invoice', 'invoices')})`,
  declNote: 'The stamp duty is added to every invoice and is not part of the VAT base.',
  withholdingTitle: 'Withholding tax suffered, per practitioner',
  practitioner: 'Practitioner',
  practitionerTaxId: 'Tax ID',
  baseTtc: 'Base incl. VAT, excl. stamp',
  withheld: 'Withheld',
  certificate: 'Certificate',
  certificateBox: 'received',
  totalWithholding: 'Total withheld',
  noWithholding: 'No withholding tax in the period.',
  withholdingNote:
    'Withholding tax suffered is a tax credit, set against the tax due (instalments, annual return) on presentation of the withholding certificate each practitioner must hand over. Ask each practitioner for their certificate and tick it once received.',
  methodsTitle: 'Collections per payment method',
  method: 'Payment method',
  netCollected: 'Net collected',
  totalCollected: 'Total collected',
  noPaid: 'No paid invoice in the period.',
  methodsNote: 'Invoices with status “Paid”: net collected = total incl. VAT − withholding.',
  remaining: (count, amount) =>
    `Still to collect: ${plural(count, 'issued invoice', 'issued invoices')}, ${amount}.`,
  methods: {
    card: 'Card',
    bank_transfer: 'Bank transfer',
    cash: 'Cash',
    cheque: 'Cheque',
  },
  methodUnknown: 'Not stated',
  monthsTitle: 'Monthly breakdown',
  month: 'Month',
  ht: 'Excl. VAT',
  tva: 'VAT',
  stamp: 'Stamp',
  ttc: 'Incl. VAT',
  retenue: 'Withheld',
  net: 'Net',
  total: 'Total',
  notesTitle: 'Notes',
  amountsIn: (currency) => `Amounts in ${currency}`,
  noteCounting:
    'Booked: issued or paid invoices, not archived, whose issue date (Tunis time) falls within the period, both bounds included.',
  noteExcluded: (drafts, draftsAmount, cancelled, cancelledAmount) =>
    `Left out of the totals: ${plural(drafts, 'draft', 'drafts')} (${draftsAmount} incl. VAT) and ${plural(cancelled, 'cancelled invoice', 'cancelled invoices')} (${cancelledAmount} incl. VAT). A cancelled invoice keeps its number, so the sequence has no gap.`,
  noteAmounts:
    'Excl. VAT = before tax; incl. VAT = VAT and stamp duty included. Withholding tax is computed on the amount incl. VAT without the stamp; net payable = incl. VAT − withholding.',
  noteMixed:
    'An invoice with several rates appears on each of its rate lines, so the invoice count per rate may exceed the total. Bases and VAT add up exactly.',
  noteDiscount: (amount) =>
    `Discounts granted in the period: ${amount} (as entered on each invoice), already taken off the bases and the VAT.`,
  noteJournal:
    'The detailed sales journal (one line per invoice) is the CSV export of the same period.',
  empty: 'No invoice booked in the period.',
  endOfReport: 'End of summary',
  automaticNotice:
    'Generated automatically from the recorded invoices. It does not replace the invoices themselves.',
  page: 'Page',
};

export function accountingLabels(language: AccountingLanguage): AccountingLabels {
  return language === 'en' ? EN : FR;
}
