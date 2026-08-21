// Manual / admin invoicing.
// Import via '@/lib/types'.

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
  unitPrice: number | string;
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

  issueDate: string;
  dueDate: string | null;
  currency: string;

  // Prisma Decimal is serialised as a string over the wire — every
  // consumer must go through Number() before doing arithmetic.
  tvaRate: number;
  discountAmount: number | string;
  stampDuty: number | string;
  subTotalHt: number | string;
  tvaAmount: number | string;
  totalTtc: number | string;

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
  stampDuty?: number;
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
  /** Per-status counts of the current filter, IGNORING the status tab. */
  byStatus: Partial<Record<InvoiceStatus, number>>;
  totalAllStatuses: number;
}

/** A patient found by the create form, with the orders it can prefill from. */
export interface InvoiceClientMatch {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  doctor: {
    id: string;
    fullName: string;
    email: string;
    dentistProfile: {
      clinicName: string | null;
      clinicAddress: string | null;
      city: string | null;
      country: string | null;
      clinicPhone: string | null;
      clinicEmail: string | null;
      taxId: string | null;
    } | null;
  } | null;
  orders: {
    id: string;
    orderCode: string;
    status: string;
    createdAt: string;
    treatmentFeeAmount: number | string | null;
    quotation: {
      id: string;
      totalTtc: number | null;
      packName: string | null;
      status: string;
    } | null;
  }[];
}
