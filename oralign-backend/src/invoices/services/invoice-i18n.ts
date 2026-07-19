/**
 * PDF label dictionary for the bilingual Invoice / Receipt document.
 *
 * Mirrors the structure of `quotation-i18n.ts` but is scoped to FR/EN
 * only — the user requirement is that the receipt prints in the
 * language the doctor's dashboard is in (French or English). Arabic is
 * intentionally NOT modelled here so this file can stay font-light and
 * the renderer can skip the Amiri/Naskh embed.
 *
 * If a translation goes missing for whatever reason, French wins
 * (matches the platform's historical default and what the quote PDF
 * does too).
 */
export type InvoiceLanguage = 'fr' | 'en';

export interface InvoiceLabels {
  // Document
  documentTitle: string;
  number: string;
  date: string;
  // Parties
  issuedBy: string;
  billedTo: string;
  doctor: string;
  patient: string;
  forPatient: string;
  order: string;
  clinic: string;
  // Line items
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  treatmentFee: string;
  cbctSupplement: string;
  packLabel: string;
  installmentLine: (n: number, total: number) => string;
  // Totals
  subtotalHt: string;
  vatRate: string;
  vatAmount: string;
  totalTtc: string;
  stampDuty: string;
  totalDue: string;
  amountPaid: string;
  // Status
  status: string;
  statusPaid: string;
  statusPending: string;
  statusAwaitingConfirmation: string;
  statusFailed: string;
  statusCancelled: string;
  statusRejected: string;
  // Payment method block
  paymentDetails: string;
  paidVia: string;
  paidOn: string;
  transactionRef: string;
  methodCard: string;
  methodBankTransfer: string;
  methodCash: string;
  // Bank + footer
  bankDetails: string;
  bankName: string;
  accountName: string;
  rib: string;
  iban: string;
  swift: string;
  taxNumber: string;
  legalNotice: string;
  pageOfTotal: (page: number, total: number) => string;
}

const FR: InvoiceLabels = {
  documentTitle: 'Reçu de paiement',
  number: 'Numéro',
  date: 'Date',
  issuedBy: 'Émis par',
  billedTo: 'Facturé à',
  doctor: 'Médecin',
  patient: 'Patient',
  forPatient: 'Pour le patient',
  order: 'Commande',
  clinic: 'Cabinet',
  description: 'Description',
  quantity: 'Qté',
  unitPrice: 'Prix unitaire',
  amount: 'Montant',
  treatmentFee: 'Honoraires de traitement',
  cbctSupplement: 'Supplément CBCT',
  packLabel: 'Pack',
  installmentLine: (n, total) => `Échéance ${n} sur ${total}`,
  subtotalHt: 'Total HT',
  vatRate: 'TVA',
  vatAmount: 'Montant TVA',
  totalTtc: 'Total TTC',
  stampDuty: 'Droit de timbre',
  totalDue: 'Total à payer',
  amountPaid: 'Montant payé',
  status: 'Statut',
  statusPaid: 'Payé',
  statusPending: 'En attente',
  statusAwaitingConfirmation: 'En attente de confirmation',
  statusFailed: 'Échec',
  statusCancelled: 'Annulé',
  statusRejected: 'Rejeté',
  paymentDetails: 'Détails du paiement',
  paidVia: 'Payé par',
  paidOn: 'Payé le',
  transactionRef: 'Référence',
  methodCard: 'Carte',
  methodBankTransfer: 'Virement bancaire',
  methodCash: 'Espèces',
  bankDetails: 'Coordonnées bancaires',
  bankName: 'Banque',
  accountName: 'Titulaire du compte',
  rib: 'RIB',
  iban: 'IBAN',
  swift: 'SWIFT',
  taxNumber: 'Matricule fiscal',
  legalNotice:
    'Ce document constitue un reçu de paiement officiel émis conformément à la législation fiscale tunisienne.',
  pageOfTotal: (page, total) => `Page ${page} sur ${total}`,
};

const EN: InvoiceLabels = {
  documentTitle: 'Payment receipt',
  number: 'Number',
  date: 'Date',
  issuedBy: 'Issued by',
  billedTo: 'Bill to',
  doctor: 'Doctor',
  patient: 'Patient',
  forPatient: 'For patient',
  order: 'Order',
  clinic: 'Clinic',
  description: 'Description',
  quantity: 'Qty',
  unitPrice: 'Unit price',
  amount: 'Amount',
  treatmentFee: 'Treatment fee',
  cbctSupplement: 'CBCT supplement',
  packLabel: 'Pack',
  installmentLine: (n, total) => `Installment ${n} of ${total}`,
  subtotalHt: 'Subtotal',
  // Even in English we use "TVA" — the platform operates in Tunisia
  // (TND), the bills carry Tunisian tax registration, and TVA is the
  // term clinics and labs actually invoice with. Keeping the label
  // consistent across languages avoids the "VAT vs TVA" confusion in
  // audit trails — same call as quotation-i18n.ts.
  vatRate: 'TVA',
  vatAmount: 'TVA amount',
  totalTtc: 'Total incl. TVA',
  stampDuty: 'Stamp duty',
  totalDue: 'Total due',
  amountPaid: 'Amount paid',
  status: 'Status',
  statusPaid: 'Paid',
  statusPending: 'Pending',
  statusAwaitingConfirmation: 'Awaiting confirmation',
  statusFailed: 'Failed',
  statusCancelled: 'Cancelled',
  statusRejected: 'Rejected',
  paymentDetails: 'Payment details',
  paidVia: 'Paid via',
  paidOn: 'Paid on',
  transactionRef: 'Reference',
  methodCard: 'Card',
  methodBankTransfer: 'Bank transfer',
  methodCash: 'Cash',
  bankDetails: 'Bank details',
  bankName: 'Bank',
  accountName: 'Account name',
  rib: 'RIB',
  iban: 'IBAN',
  swift: 'SWIFT',
  taxNumber: 'Tax number',
  legalNotice:
    'This is an official payment receipt issued in compliance with Tunisian tax law.',
  pageOfTotal: (page, total) => `Page ${page} of ${total}`,
};

const TABLES: Record<InvoiceLanguage, InvoiceLabels> = {
  fr: FR,
  en: EN,
};

export function getInvoiceLabels(language: InvoiceLanguage): InvoiceLabels {
  return TABLES[language] ?? FR;
}

/**
 * Resolve a translation map (e.g. legalText / footerText carried on the
 * company snapshot) using the active language with French/English
 * fallback. Lifted verbatim from `quotation-i18n.pickTranslation` so the
 * two PDFs behave consistently when faced with a legacy snapshot.
 */
export function pickInvoiceTranslation(
  translations: unknown,
  language: InvoiceLanguage,
): string {
  if (!translations || typeof translations !== 'object') return '';
  const map = translations as Record<string, unknown>;
  const order: string[] = [language, 'fr', 'en'];
  for (const lang of order) {
    const v = map[lang];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  for (const v of Object.values(map)) {
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return '';
}
