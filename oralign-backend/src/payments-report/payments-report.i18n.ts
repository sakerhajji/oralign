import type { PaymentMethod, PaymentRecordStatus } from '@prisma/client';
import type { PaymentsReportLanguage } from './dto/payments-report.dto';

/** The two money kinds a report section covers. */
export type ReportSectionKind = 'treatment_fee' | 'installment';

/**
 * Every word the payments report prints, in French and English (the
 * dashboard's two languages). The vocabulary follows the dashboard:
 * "Honoraires de traitement" / "Paiements échelonnés", the payment
 * statuses of the desk, "Espèces / Carte bancaire / Virement bancaire".
 */
export interface PaymentsReportLabels {
  locale: string;
  /** "Label :" in French (a space before the colon), "Label:" in English. */
  colon: (label: string) => string;
  labelled: (label: string, value: string) => string;
  documentTitle: string;
  kinds: Record<ReportSectionKind | 'consolidated', string>;
  reportType: string;
  period: string;
  from: string;
  to: string;
  allDates: string;
  upTo: (day: string) => string;
  generatedOn: string;
  generatedAt: (date: string, time: string) => string;
  generatedBy: string;
  timeZone: string;
  timeZoneValue: string;
  issuer: string;
  taxNumber: string;
  tradeRegister: string;
  criteria: string;
  practitioner: string;
  allPractitioners: string;
  paymentMethod: string;
  allMethods: string;
  status: string;
  allStatuses: string;
  search: string;
  noSearch: string;
  installment: string;
  allInstallments: string;
  installmentRange: (min: number | null, max: number | null) => string;
  summaryTitle: string;
  methods: Record<PaymentMethod, string>;
  count: string;
  /** The count heading of a narrow column (consolidated summary). */
  countShort: string;
  amount: string;
  collectedAmount: string;
  totalCollected: string;
  total: string;
  summaryNote: string;
  statusesInDetails: string;
  detailsTitle: string;
  rows: (count: number) => string;
  columns: {
    date: string;
    order: string;
    practitioner: string;
    patient: string;
    method: string;
    status: string;
    transaction: string;
    amount: string;
  };
  installmentOf: (rank: number, total: number | null) => string;
  receipt: string;
  toConfirm: string;
  statuses: Record<PaymentRecordStatus, string>;
  subtotalCollected: string;
  overallTotal: string;
  empty: string;
  endOfReport: string;
  page: string;
  automaticNotice: string;
}

/** French ordinals of an installment rank: 1re, 2e, 3e… */
const frRank = (n: number) => (n === 1 ? '1re' : `${n}e`);
/** English ordinals: 1st, 2nd, 3rd, 4th… 11th, 12th, 13th, 21st… */
function enRank(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

const FR: PaymentsReportLabels = {
  locale: 'fr-FR',
  colon: (label) => `${label} :`,
  labelled: (label, value) => `${label} : ${value}`,
  documentTitle: 'Rapport des paiements',
  kinds: {
    treatment_fee: 'Honoraires de traitement',
    installment: 'Paiements échelonnés',
    consolidated: 'Rapport consolidé',
  },
  reportType: 'Type de rapport',
  period: 'Période',
  from: 'Du',
  to: 'Au',
  allDates: 'Toutes les dates',
  upTo: (day) => `jusqu’au ${day}`,
  generatedOn: 'Généré le',
  generatedAt: (date, time) => `${date} à ${time}`,
  generatedBy: 'Généré par',
  timeZone: 'Fuseau horaire',
  timeZoneValue: 'Africa/Tunis (heure de Tunis)',
  issuer: 'Émetteur',
  taxNumber: 'Matricule fiscal',
  tradeRegister: 'Registre de commerce',
  criteria: 'Critères du rapport',
  practitioner: 'Praticien',
  allPractitioners: 'Tous les praticiens',
  paymentMethod: 'Mode de paiement',
  allMethods: 'Tous les modes',
  status: 'Statut',
  allStatuses: 'Tous les statuts',
  search: 'Recherche',
  noSearch: 'Aucune',
  installment: 'Échéance',
  allInstallments: 'Toutes les échéances',
  installmentRange: (min, max) => {
    if (min !== null && max !== null && min === max)
      return `${frRank(min)} échéance`;
    if (min !== null && max !== null)
      return `De la ${frRank(min)} à la ${frRank(max)} échéance`;
    if (min !== null) return `${frRank(min)} échéance et suivantes`;
    if (max !== null) return `Jusqu’à la ${frRank(max)} échéance`;
    return 'Toutes les échéances';
  },
  summaryTitle: 'Synthèse financière',
  methods: {
    cash: 'Espèces',
    card: 'Carte bancaire',
    bank_transfer: 'Virement bancaire',
  },
  count: 'Nombre',
  countShort: 'Nb',
  amount: 'Montant',
  collectedAmount: 'Montant encaissé',
  totalCollected: 'Total encaissé',
  total: 'Total',
  summaryNote:
    'Seuls les paiements réussis sont comptabilisés comme encaissés. Les paiements en attente, échoués, annulés ou à vérifier peuvent figurer dans le détail ; ils ne sont jamais inclus dans les totaux.',
  statusesInDetails: 'Statuts dans le détail',
  detailsTitle: 'Détail des paiements',
  rows: (count) =>
    count === 0 ? 'aucune ligne' : count === 1 ? '1 ligne' : `${count} lignes`,
  columns: {
    date: 'Date du paiement',
    order: 'Réf. commande',
    practitioner: 'Praticien',
    patient: 'Patient',
    method: 'Mode',
    status: 'Statut',
    transaction: 'Réf. transaction',
    amount: 'Montant',
  },
  installmentOf: (rank, total) =>
    total ? `Échéance ${rank}/${total}` : `Échéance ${rank}`,
  receipt: 'Reçu',
  toConfirm: 'À confirmer',
  statuses: {
    success: 'Succès',
    pending: 'En attente',
    unknown: 'Vérification requise',
    awaiting_confirmation: 'À confirmer',
    failed: 'Échoué',
    rejected: 'Rejeté',
    cancelled: 'Annulé',
    expired: 'Expiré',
  },
  subtotalCollected: 'Sous-total encaissé',
  overallTotal: 'Total général encaissé',
  empty: 'Aucun paiement trouvé pour les critères sélectionnés.',
  endOfReport: 'Fin du rapport',
  page: 'Page',
  automaticNotice:
    'Document généré automatiquement à partir des enregistrements de la plateforme Oralign.',
};

const EN: PaymentsReportLabels = {
  locale: 'en-GB',
  colon: (label) => `${label}:`,
  labelled: (label, value) => `${label}: ${value}`,
  documentTitle: 'Payments report',
  kinds: {
    treatment_fee: 'Treatment fees',
    installment: 'Installment payments',
    consolidated: 'Consolidated report',
  },
  reportType: 'Report type',
  period: 'Period',
  from: 'From',
  to: 'To',
  allDates: 'All dates',
  upTo: (day) => `up to ${day}`,
  generatedOn: 'Generated on',
  generatedAt: (date, time) => `${date} at ${time}`,
  generatedBy: 'Generated by',
  timeZone: 'Time zone',
  timeZoneValue: 'Africa/Tunis (Tunis time)',
  issuer: 'Issuer',
  taxNumber: 'Tax number',
  tradeRegister: 'Trade register',
  criteria: 'Report criteria',
  practitioner: 'Practitioner',
  allPractitioners: 'All practitioners',
  paymentMethod: 'Payment method',
  allMethods: 'All methods',
  status: 'Status',
  allStatuses: 'All statuses',
  search: 'Search',
  noSearch: 'None',
  installment: 'Installment',
  allInstallments: 'All installments',
  installmentRange: (min, max) => {
    if (min !== null && max !== null && min === max)
      return `${enRank(min)} installment`;
    if (min !== null && max !== null)
      return `${enRank(min)} to ${enRank(max)} installment`;
    if (min !== null) return `${enRank(min)} installment onwards`;
    if (max !== null) return `Up to the ${enRank(max)} installment`;
    return 'All installments';
  },
  summaryTitle: 'Financial summary',
  methods: {
    cash: 'Cash',
    card: 'Bank card',
    bank_transfer: 'Bank transfer',
  },
  count: 'Count',
  countShort: 'No.',
  amount: 'Amount',
  collectedAmount: 'Amount collected',
  totalCollected: 'Total collected',
  total: 'Total',
  summaryNote:
    'Only successful payments count as collected. Pending, failed, cancelled or unverified payments may appear in the details; they are never included in the totals.',
  statusesInDetails: 'Statuses in the details',
  detailsTitle: 'Payment details',
  rows: (count) =>
    count === 0 ? 'no rows' : count === 1 ? '1 row' : `${count} rows`,
  columns: {
    date: 'Payment date',
    order: 'Order ref.',
    practitioner: 'Practitioner',
    patient: 'Patient',
    method: 'Method',
    status: 'Status',
    transaction: 'Transaction ref.',
    amount: 'Amount',
  },
  installmentOf: (rank, total) =>
    total ? `Installment ${rank}/${total}` : `Installment ${rank}`,
  receipt: 'Receipt',
  toConfirm: 'To be confirmed',
  statuses: {
    success: 'Successful',
    pending: 'Pending',
    unknown: 'Verification required',
    awaiting_confirmation: 'To be confirmed',
    failed: 'Failed',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    expired: 'Expired',
  },
  subtotalCollected: 'Subtotal collected',
  overallTotal: 'Overall total collected',
  empty: 'No payments found for the selected criteria.',
  endOfReport: 'End of report',
  page: 'Page',
  automaticNotice:
    'Document generated automatically from the records of the Oralign platform.',
};

export function paymentsReportLabels(
  lang: PaymentsReportLanguage,
): PaymentsReportLabels {
  return lang === 'en' ? EN : FR;
}
