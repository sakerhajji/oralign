/**
 * PDF label dictionary for the bilingual invoice (FACTURE) document.
 *
 * Mirrors the structure of `quotation-i18n.ts` but is scoped to FR/EN
 * only — the user requirement is that the invoice prints in the
 * language the doctor's dashboard is in (French or English). Arabic is
 * intentionally NOT modelled here so this file can stay font-light and
 * the renderer can skip the Amiri/Naskh embed.
 *
 * If a translation goes missing for whatever reason, French wins
 * (matches the platform's historical default and what the quote PDF
 * does too).
 */
export type InvoiceLanguage = 'fr' | 'en';

/**
 * The invoice language of a practitioner, from their stored
 * `preferredLanguage`. French unless they explicitly chose English: the
 * company invoices in Tunisia, so French is the document default.
 */
export function invoiceLanguageFor(
  preferred: string | null | undefined,
): InvoiceLanguage {
  const v = (preferred ?? '').trim().toLowerCase();
  return v === 'en' || v.startsWith('en-') || v.startsWith('en_') ? 'en' : 'fr';
}

export interface InvoiceLabels {
  // Document
  /**
   * Title of the document. Every payment produces a FACTURE (owner
   * decision, 2026-11-19): there is no "payment receipt" any more, the
   * legacy on-the-fly renderer included.
   */
  documentTitle: string;
  invoiceTitle: string;
  number: string;
  date: string;
  /** "Label : value" separator — French typography puts a space before the colon. */
  sep: string;
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
  /** Column headers of a stored invoice, whose rows are always HT. */
  unitPriceHt: string;
  amountHt: string;
  treatmentFee: string;
  cbctSupplement: string;
  packLabel: string;
  installmentLine: (n: number, total: number) => string;
  /**
   * Note of a fee facture minted for a fee whose receipt (TF-…) was handed
   * out before every payment got a facture: keeps that receipt traceable.
   */
  replacesReceipt: (receiptNumber: string) => string;
  // Totals
  subtotalHt: string;
  /** Gross lines before the discount, so "Total HT" is never printed twice. */
  grossHt: string;
  grossTtc: string;
  /** Global discount line — only rendered when an invoice has one. */
  discount: string;
  vatRate: string;
  vatAmount: string;
  totalTtc: string;
  stampDuty: string;
  totalDue: string;
  /** Rate already formatted for the language; null when unknown. */
  withholding: (rate: string | null) => string;
  netPayable: string;
  amountPaid: string;
  /**
   * What the devis still asks for right after the payment an installment
   * facture records (Invoice.quoteRemainingAfter, frozen at issue).
   */
  quoteRemaining: string;
  // Status (payment)
  status: string;
  statusPaid: string;
  statusPending: string;
  statusAwaitingConfirmation: string;
  statusFailed: string;
  statusCancelled: string;
  statusRejected: string;
  // Status (stored invoice) — feminine in French: "la facture".
  invoiceStatusDraft: string;
  invoiceStatusIssued: string;
  invoiceStatusPaid: string;
  invoiceStatusCancelled: string;
  // Payment method block
  paymentDetails: string;
  paymentMethod: string;
  paidVia: string;
  paidOn: string;
  settledOn: string;
  transactionRef: string;
  referenceShort: string;
  methodCard: string;
  methodBankTransfer: string;
  methodCash: string;
  methodCheque: string;
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
  documentTitle: 'Facture',
  invoiceTitle: 'Facture',
  number: 'Numéro',
  date: 'Date',
  sep: ' : ',
  issuedBy: 'Émis par',
  billedTo: 'Facturé à',
  doctor: 'Docteur',
  patient: 'Patient',
  forPatient: 'Pour le patient',
  order: 'Commande',
  clinic: 'Cabinet',
  description: 'Description',
  quantity: 'Qté',
  unitPrice: 'Prix unitaire',
  amount: 'Montant',
  unitPriceHt: 'Prix unitaire HT',
  amountHt: 'Montant HT',
  treatmentFee: 'Honoraires de traitement',
  cbctSupplement: 'Supplément CBCT',
  packLabel: 'Pack',
  installmentLine: (n, total) => `Échéance ${n} sur ${total}`,
  replacesReceipt: (receiptNumber) => `Remplace le reçu ${receiptNumber}`,
  subtotalHt: 'Total HT',
  grossHt: 'Total HT brut',
  grossTtc: 'Total TTC brut',
  discount: 'Remise',
  vatRate: 'TVA',
  vatAmount: 'Montant TVA',
  totalTtc: 'Total TTC',
  stampDuty: 'Droit de timbre',
  totalDue: 'Total à payer',
  withholding: (rate) =>
    rate ? `Retenue à la source (${rate} %)` : 'Retenue à la source',
  netPayable: 'Net à payer',
  amountPaid: 'Montant payé',
  quoteRemaining: 'Reste à payer sur le devis',
  status: 'Statut',
  statusPaid: 'Payé',
  statusPending: 'En attente',
  statusAwaitingConfirmation: 'En attente de confirmation',
  statusFailed: 'Échec',
  statusCancelled: 'Annulé',
  statusRejected: 'Rejeté',
  invoiceStatusDraft: 'Brouillon',
  invoiceStatusIssued: 'Émise',
  invoiceStatusPaid: 'Payée',
  invoiceStatusCancelled: 'Annulée',
  paymentDetails: 'Règlement',
  paymentMethod: 'Mode de paiement',
  paidVia: 'Payé par',
  paidOn: 'Payé le',
  settledOn: 'Réglée le',
  transactionRef: 'Référence',
  referenceShort: 'Réf.',
  methodCard: 'Carte bancaire',
  methodBankTransfer: 'Virement bancaire',
  methodCash: 'Espèces',
  methodCheque: 'Chèque',
  bankDetails: 'Coordonnées bancaires',
  bankName: 'Banque',
  accountName: 'Titulaire du compte',
  rib: 'RIB',
  iban: 'IBAN',
  swift: 'SWIFT',
  taxNumber: 'Matricule fiscal',
  legalNotice:
    'Facture émise conformément à la législation fiscale tunisienne.',
  pageOfTotal: (page, total) => `Page ${page} sur ${total}`,
};

const EN: InvoiceLabels = {
  documentTitle: 'Invoice',
  invoiceTitle: 'Invoice',
  number: 'Number',
  date: 'Date',
  sep: ': ',
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
  unitPriceHt: 'Unit price excl. TVA',
  amountHt: 'Amount excl. TVA',
  treatmentFee: 'Treatment fee',
  cbctSupplement: 'CBCT supplement',
  packLabel: 'Pack',
  installmentLine: (n, total) => `Installment ${n} of ${total}`,
  replacesReceipt: (receiptNumber) => `Replaces receipt ${receiptNumber}`,
  subtotalHt: 'Subtotal',
  grossHt: 'Gross subtotal',
  grossTtc: 'Gross total incl. TVA',
  discount: 'Discount',
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
  withholding: (rate) =>
    rate ? `Withholding tax (${rate} %)` : 'Withholding tax',
  netPayable: 'Net amount due',
  amountPaid: 'Amount paid',
  quoteRemaining: 'Remaining on the quotation',
  status: 'Status',
  statusPaid: 'Paid',
  statusPending: 'Pending',
  statusAwaitingConfirmation: 'Awaiting confirmation',
  statusFailed: 'Failed',
  statusCancelled: 'Cancelled',
  statusRejected: 'Rejected',
  invoiceStatusDraft: 'Draft',
  invoiceStatusIssued: 'Issued',
  invoiceStatusPaid: 'Paid',
  invoiceStatusCancelled: 'Cancelled',
  paymentDetails: 'Payment',
  paymentMethod: 'Payment method',
  paidVia: 'Paid via',
  paidOn: 'Paid on',
  settledOn: 'Paid on',
  transactionRef: 'Reference',
  referenceShort: 'Ref.',
  methodCard: 'Bank card',
  methodBankTransfer: 'Bank transfer',
  methodCash: 'Cash',
  methodCheque: 'Cheque',
  bankDetails: 'Bank details',
  bankName: 'Bank',
  accountName: 'Account name',
  rib: 'RIB',
  iban: 'IBAN',
  swift: 'SWIFT',
  taxNumber: 'Tax number',
  legalNotice: 'Invoice issued in compliance with Tunisian tax law.',
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
