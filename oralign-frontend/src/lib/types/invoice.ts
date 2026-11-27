// Manual / admin invoicing.
// Import via '@/lib/types'.

import type { PaymentMethod } from './billing';

export enum InvoiceStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

export interface InvoiceLine {
  id: string;
  position: number;
  description: string;
  /** Server-computed line HT — read-only on the client. */
  lineHt: number | string;
  quantity: number | string;
  /** HT unit price (derived by the server when the invoice is TTC-priced). */
  unitPrice: number | string;
  /** The unit price as typed, TVA included (TTC-priced invoices only). */
  unitPriceTtc?: number | string | null;
  /** null = the invoice rate applies. */
  tvaRate: number | null;
}

export interface InvoiceAuditEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;

  orderId: string | null;
  patientId: string | null;
  doctorId: string | null;
  /** Set when this invoice was generated automatically from a payment. */
  paymentId?: string | null;
  order?: { id: string; orderCode: string } | null;
  patient?: { id: string; fullName: string } | null;
  doctor?: { id: string; fullName: string; email: string } | null;

  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  clientAddress: string | null;
  clientCity: string | null;
  clientCountry: string | null;
  clientTaxId: string | null;
  /** Snapshot of the billed practitioner's clinic (spec §6). */
  clientClinicName?: string | null;
  /** Billed to its practitioner in his own name (decided at creation). */
  clientIsPractitioner?: boolean;
  /** Snapshot of the practitioner's registration number (not printed). */
  clientRegistrationNumber?: string | null;

  issueDate: string;
  dueDate: string | null;
  currency: string;

  // Prisma Decimal is serialised as a string over the wire — every
  // consumer must go through Number() before doing arithmetic.
  tvaRate: number;
  discountAmount: number | string;
  /** Set when the remise was typed as a percentage of the lines' gross. */
  discountPercent?: number | string | null;
  stampDuty: number | string;
  subTotalHt: number | string;
  tvaAmount: number | string;
  /** HT + TVA + stamp. */
  totalTtc: number | string;

  /** Lines typed TTC (TVA included): HT and TVA derived backwards, the stamp added. */
  pricesIncludeTax?: boolean;
  paymentMethod?: PaymentMethod | null;
  paymentReference?: string | null;
  /** Retenue à la source: rate (%), amount kept back, and what is actually paid. */
  withholdingRate?: number | string | null;
  withholdingAmount?: number | string;
  netPayable?: number | string;
  /** Retenue threshold in force at issue (snapshot); null before the rule. */
  withholdingThreshold?: number | string | null;
  /** "Reste à payer" on the devis right after this payment, frozen at issue. */
  quoteRemainingAfter?: number | string | null;
  /** Set on the automatic invoice of a treatment fee (+ CBCT). */
  treatmentFeeOrderId?: string | null;
  /** Last time the PDF was e-mailed to the practitioner, and to whom. */
  emailedAt?: string | null;
  emailedTo?: string | null;

  notes: string | null;
  language: 'fr' | 'en';
  createdByName: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;

  lines: InvoiceLine[];
  auditLogs?: InvoiceAuditEntry[];
}

/** What the editor posts. Note: no totals — the server owns them. */
export interface InvoiceLineInput {
  description: string;
  quantity?: number;
  /** TTC (TVA included) when the invoice has pricesIncludeTax, HT otherwise. */
  unitPrice?: number;
  tvaRate?: number;
}

export interface CreateInvoiceInput {
  orderId?: string;
  patientId?: string;
  doctorId?: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  clientCity?: string;
  clientCountry?: string;
  clientTaxId?: string;
  issueDate?: string;
  dueDate?: string;
  status?: InvoiceStatus;
  language?: 'fr' | 'en';
  tvaRate?: number;
  discountAmount?: number;
  /** A number: the server derives the remise from it. null: typed as an amount. */
  discountPercent?: number | null;
  stampDuty?: number;
  pricesIncludeTax?: boolean;
  paymentMethod?: PaymentMethod | null;
  paymentReference?: string | null;
  /** Retenue à la source (%); null or 0 = none. */
  withholdingRate?: number | null;
  notes?: string;
  invoiceNumber?: string;
  lines: InvoiceLineInput[];
}

export type UpdateInvoiceInput = Partial<CreateInvoiceInput>;

export interface InvoiceFilters {
  page?: number;
  limit?: number;
  search?: string;
  statuses?: InvoiceStatus[];
  issuedFrom?: string;
  issuedTo?: string;
  patientId?: string;
  doctorId?: string;
  orderId?: string;
  includeDeleted?: boolean;
  sortBy?: 'issueDate' | 'createdAt' | 'totalTtc' | 'invoiceNumber' | 'status';
  sortOrder?: 'asc' | 'desc';
}

/** Totals of the WHOLE filter, not of the visible page. */
export interface InvoiceSummary {
  count: number;
  billableCount: number;
  subTotalHt: number;
  tvaAmount: number;
  totalTtc: number;
  /** Sums of the retenue à la source and of what is actually paid. */
  withholdingAmount?: number;
  netPayable?: number;
  /** Per-status counts of the current filter, IGNORING the status tab. */
  byStatus: Partial<Record<InvoiceStatus, number>>;
  totalAllStatuses: number;
}

// ─── Accounting summary (récapitulatif comptable) ─────────────────────

/**
 * A period of Africa/Tunis days, both bounds included ('YYYY-MM-DD').
 * Neither bound = every date.
 */
export interface InvoicePeriodParams {
  issuedFrom?: string;
  issuedTo?: string;
}

/**
 * Totals of the "factures comptabilisées": status issued or paid, not
 * archived, issueDate inside the period. Drafts and cancelled invoices
 * are reported apart and never counted here. Amounts have 3 decimals.
 */
export interface InvoiceAccountingTotals {
  count: number;
  subTotalHt: number;
  discountAmount: number;
  tvaAmount: number;
  stampDuty: number;
  /** Invoices carrying a droit de timbre. */
  stampCount: number;
  /** HT + TVA + stamp. */
  totalTtc: number;
  withholdingAmount: number;
  /** totalTtc - withholdingAmount. */
  netPayable: number;
}

export interface InvoiceAccountingRate {
  /** TVA rate in % (19, 13, 7, 0). */
  rate: number;
  /** Invoices with at least one line at this rate. */
  count: number;
  baseHt: number;
  tvaAmount: number;
}

export interface InvoiceAccountingMethod {
  /** null = "Non précisé". */
  method: PaymentMethod | null;
  count: number;
  netPayable: number;
}

export interface InvoiceAccountingWithholding {
  /** null when the invoice has no practitioner account (grouped by name). */
  doctorId: string | null;
  name: string;
  /** Matricule fiscal (latest non-empty one). */
  taxId: string | null;
  count: number;
  /** TTC without the stamp: what the retenue is computed on. */
  baseTtc: number;
  withholdingAmount: number;
}

export interface InvoiceAccountingMonth {
  /** Tunis month 'YYYY-MM'. */
  month: string;
  count: number;
  subTotalHt: number;
  tvaAmount: number;
  stampDuty: number;
  totalTtc: number;
  withholdingAmount: number;
  netPayable: number;
}

/** GET admin/invoices/accounting-summary. */
export interface InvoiceAccountingSummary {
  period: { from: string | null; to: string | null };
  counted: InvoiceAccountingTotals;
  /** Counted invoices with status paid. */
  paid: { count: number; netPayable: number };
  /** Counted invoices with status issued: still to collect. */
  unpaid: { count: number; netPayable: number };
  drafts: { count: number; totalTtc: number };
  cancelled: { count: number; totalTtc: number };
  /** Rate descending. */
  byRate: InvoiceAccountingRate[];
  /** Paid invoices only. */
  byMethod: InvoiceAccountingMethod[];
  /** Withholding descending. */
  withholdingByDoctor: InvoiceAccountingWithholding[];
  byMonth: InvoiceAccountingMonth[];
}

/** A practitioner found by the create form, with the orders it can prefill from. */
export interface InvoiceClientMatch {
  /** The practitioner's user id (becomes the invoice's doctorId). */
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  clinicName: string | null;
  clinicAddress: string | null;
  city: string | null;
  country: string | null;
  clinicPhone: string | null;
  clinicEmail: string | null;
  taxId: string | null;
  orders: {
    id: string;
    orderCode: string;
    status: string;
    createdAt: string;
    patientId: string | null;
    patientName: string | null;
    /** Cash collected for the treatment fee (net of any retenue). */
    treatmentFeeAmount: number | string | null;
    /** The fee due: cash + retenue. */
    treatmentFeeDue: number | string | null;
    quotation: {
      id: string;
      totalTtc: number | null;
      packName: string | null;
      status: string;
    } | null;
    /**
     * Already invoiced against the quote (non-cancelled, non-archived
     * invoices of this order that are not its treatment-fee facture), TTC.
     */
    quoteInvoicedTotal: number | string;
    /** TTC of the order's treatment-fee facture(s); 0 when there is none. */
    feeInvoicedTotal: number | string;
  }[];
}
