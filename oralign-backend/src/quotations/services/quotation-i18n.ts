import { DevisLanguage } from '@prisma/client';

/**
 * PDF label dictionary keyed by DevisLanguage.
 *
 * Each label appears verbatim in the rendered PDF (header, table
 * headers, totals block, status pill, footer). When the admin chooses a
 * language for a Quote, the matching column wins. When a translation is
 * missing — for whatever reason — French is the fallback, which
 * matches the historical default of the platform.
 */
export interface QuotationLabels {
  // Document
  documentTitle: string;
  number: string;
  date: string;
  // Parties
  issuedBy: string;
  billedTo: string;
  doctor: string;
  patient: string;
  order: string;
  // Line items
  description: string;
  amount: string;
  /** Column header when the line amounts include TVA (every current devis). */
  amountTtc: string;
  treatmentFees: string;
  fabricationFees: string;
  deliveryFees: string;
  discount: string;
  // Totals
  subtotalHt: string;
  vatRate: string;
  vatAmount: string;
  totalTtc: string;
  currencyLabel: string;
  /** Printed under the totals of a TTC-priced devis. */
  pricesIncludeTax: string;
  /**
   * Same note, about the fiscal stamp ADDED to each payment (owner
   * decision 2026-11-20: one facture per payment, one stamp per facture).
   */
  stampPerPayment: (stamp: string) => string;
  /** Totals row under Total TTC when the devis has a payment plan: "Droit de timbre (3 × 1,000)". */
  stampRow: (count: number, stamp: string) => string;
  /** Final totals row: the TTC plus every payment's stamp. */
  totalWithStamps: string;
  // Status
  status: string;
  statusDraft: string;
  statusSent: string;
  statusApproved: string;
  statusRejected: string;
  statusPending: string;
  statusCanceled: string;
  // Notes
  notes: string;
  adminMessage: string;
  // Bank / footer
  bankDetails: string;
  bankName: string;
  accountName: string;
  rib: string;
  iban: string;
  swift: string;
  taxNumber: string;
}

const FR: QuotationLabels = {
  documentTitle: 'Devis',
  number: 'Numéro',
  date: 'Date',
  issuedBy: 'Émis par',
  billedTo: 'Adressé à',
  doctor: 'Médecin',
  patient: 'Patient',
  order: 'Commande',
  description: 'Description',
  amount: 'Montant',
  amountTtc: 'Montant TTC',
  treatmentFees: 'Frais de traitement',
  fabricationFees: 'Frais de fabrication',
  deliveryFees: 'Frais de livraison',
  discount: 'Remise',
  subtotalHt: 'Total HT',
  vatRate: 'TVA',
  vatAmount: 'Montant TVA',
  totalTtc: 'Total TTC',
  currencyLabel: 'Devise',
  pricesIncludeTax: 'Prix TTC (TVA incluse).',
  stampPerPayment: (stamp) =>
    `Droit de timbre (${stamp}) ajouté à chaque paiement : une facture par paiement.`,
  stampRow: (count, stamp) => `Droit de timbre (${count} × ${stamp})`,
  totalWithStamps: 'Total à payer',
  status: 'Statut',
  statusDraft: 'Brouillon',
  statusSent: 'Envoyé',
  statusApproved: 'Approuvé',
  statusRejected: 'Rejeté',
  statusPending: 'En attente',
  statusCanceled: 'Annulé',
  notes: 'Remarques',
  adminMessage: 'Message',
  bankDetails: 'Coordonnées bancaires',
  bankName: 'Banque',
  accountName: 'Titulaire du compte',
  rib: 'RIB',
  iban: 'IBAN',
  swift: 'SWIFT',
  taxNumber: 'Matricule fiscal',
};

const EN: QuotationLabels = {
  documentTitle: 'Quotation',
  number: 'Number',
  date: 'Date',
  issuedBy: 'Issued by',
  billedTo: 'Billed to',
  doctor: 'Doctor',
  patient: 'Patient',
  order: 'Order',
  description: 'Description',
  amount: 'Amount',
  amountTtc: 'Amount incl. TVA',
  treatmentFees: 'Treatment fees',
  fabricationFees: 'Fabrication fees',
  deliveryFees: 'Delivery fees',
  discount: 'Discount',
  subtotalHt: 'Subtotal',
  // Even in English we use "TVA" — the platform operates in Tunisia
  // (TND), the bills carry Tunisian tax registration, and TVA is the
  // term clinics and labs actually invoice with. Keeping the label
  // consistent across languages avoids the "VAT vs TVA" confusion in
  // audit trails.
  vatRate: 'TVA',
  vatAmount: 'TVA amount',
  totalTtc: 'Total incl. TVA',
  currencyLabel: 'Currency',
  pricesIncludeTax: 'Prices include TVA.',
  stampPerPayment: (stamp) =>
    `Stamp duty (${stamp}) added to each payment: one invoice per payment.`,
  stampRow: (count, stamp) => `Stamp duty (${count} × ${stamp})`,
  totalWithStamps: 'Total to pay',
  status: 'Status',
  statusDraft: 'Draft',
  statusSent: 'Sent',
  statusApproved: 'Approved',
  statusRejected: 'Rejected',
  statusPending: 'Pending',
  statusCanceled: 'Canceled',
  notes: 'Notes',
  adminMessage: 'Message',
  bankDetails: 'Bank details',
  bankName: 'Bank',
  accountName: 'Account name',
  rib: 'RIB',
  iban: 'IBAN',
  swift: 'SWIFT',
  taxNumber: 'Tax number',
};

const AR: QuotationLabels = {
  documentTitle: 'عرض سعر',
  number: 'الرقم',
  date: 'التاريخ',
  issuedBy: 'صادر عن',
  billedTo: 'موجه إلى',
  doctor: 'الطبيب',
  patient: 'المريض',
  order: 'الطلب',
  description: 'الوصف',
  amount: 'المبلغ',
  amountTtc: 'المبلغ شامل الضريبة',
  treatmentFees: 'رسوم العلاج',
  fabricationFees: 'رسوم التصنيع',
  deliveryFees: 'رسوم التوصيل',
  discount: 'الخصم',
  subtotalHt: 'المجموع دون الضريبة',
  vatRate: 'الضريبة',
  vatAmount: 'مبلغ الضريبة',
  totalTtc: 'المجموع شامل الضريبة',
  currencyLabel: 'العملة',
  pricesIncludeTax: 'الأسعار شاملة للضريبة.',
  stampPerPayment: (stamp) =>
    `يُضاف معلوم الطابع الجبائي (${stamp}) إلى كل دفعة: فاتورة لكل دفعة.`,
  stampRow: (count, stamp) => `معلوم الطابع الجبائي (${count} × ${stamp})`,
  totalWithStamps: 'المبلغ الجملي للدفع',
  status: 'الحالة',
  statusDraft: 'مسودة',
  statusSent: 'مرسل',
  statusApproved: 'موافق عليه',
  statusRejected: 'مرفوض',
  statusPending: 'في الانتظار',
  statusCanceled: 'ملغى',
  notes: 'ملاحظات',
  adminMessage: 'رسالة',
  bankDetails: 'بيانات الحساب البنكي',
  bankName: 'البنك',
  accountName: 'اسم صاحب الحساب',
  rib: 'الرقم البنكي',
  iban: 'إيبان',
  swift: 'سويفت',
  taxNumber: 'المعرف الجبائي',
};

const TABLES: Record<DevisLanguage, QuotationLabels> = {
  [DevisLanguage.fr]: FR,
  [DevisLanguage.en]: EN,
  [DevisLanguage.ar]: AR,
};

export function getQuotationLabels(language: DevisLanguage): QuotationLabels {
  return TABLES[language] ?? FR;
}

/**
 * Pick the translated text for a given language, falling back to French
 * then English then the first non-empty value. Used by the snapshot
 * builder so old PDFs stay readable even if the admin removed a
 * translation later.
 */
export function pickTranslation(
  translations: unknown,
  language: DevisLanguage,
): string {
  if (!translations || typeof translations !== 'object') return '';
  const map = translations as Record<string, unknown>;
  const order: DevisLanguage[] = [language, DevisLanguage.fr, DevisLanguage.en];
  for (const lang of order) {
    const v = map[lang];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  // Last resort: any non-empty value.
  for (const v of Object.values(map)) {
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return '';
}

/** True when the language renders right-to-left. Used by the PDF service. */
export function isRtl(language: DevisLanguage): boolean {
  return language === DevisLanguage.ar;
}
