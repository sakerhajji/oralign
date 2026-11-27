// Packs, payment plan, payments, invoices
// Split out of the former 2,000-line lib/types/index.ts; import via '@/lib/types'.

import type { Localized } from './blog';

// ─── Packs + payment-plan + payments ──────────────────────────────────────
// Mirrors backend Prisma enums + models. Decimal money fields cross the
// wire as strings — never parse them with `Number()` before doing
// arithmetic; use a string-based decimal helper instead, otherwise
// totals will drift at the 3rd decimal place (TND is 3-decimal).

// Frontend mirror of the backend Prisma `ArchType` enum. Wire values
// MUST match the backend exactly — class-validator's `@IsEnum` on the
// server rejects anything else with "archType must be one of …". The
// constant NAMES (ONE_ARCH / TWO_ARCHES) are a frontend convention so
// every call site reads cleanly without leaking the snake_case wire
// format into the UI code.
export enum ArchType {
  ONE_ARCH = 'single_arch',
  TWO_ARCHES = 'two_arches',
}

export enum PaymentMode {
  FULL_PAYMENT = 'full_payment',
  INSTALLMENTS = 'installments',
}

export enum QuotationPaymentStatus {
  PENDING = 'pending',
  PARTIALLY_PAID = 'partially_paid',
  PAID = 'paid',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum InstallmentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
}

export enum BatchStatus {
  LOCKED = 'locked',
  UNLOCKED = 'unlocked',
  DELIVERED = 'delivered',
}

export enum PaymentMethod {
  CARD = 'card',
  BANK_TRANSFER = 'bank_transfer',
  CASH = 'cash',
  /** Recorded by an administrator only, like cash. */
  CHEQUE = 'cheque',
}

/**
 * Payment lifecycle. CARD: `pending → success | failed | cancelled`.
 * BANK_TRANSFER: `awaiting_confirmation → success | rejected`.
 * CASH: created directly in `success` by an admin endpoint.
 */
export enum PaymentRecordStatus {
  PENDING = 'pending',
  UNKNOWN = 'unknown',
  AWAITING_CONFIRMATION = 'awaiting_confirmation',
  SUCCESS = 'success',
  FAILED = 'failed',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  /** Hosted session that ran out of time. Terminal: a retry opens a new one. */
  EXPIRED = 'expired',
}

export enum PaymentPurpose {
  INSTALLMENT = 'installment',
  TREATMENT_FEE = 'treatment_fee',
}

export interface Pack {
  id: string;
  // `name` / `description` are the FRENCH fallback + legacy columns; the
  // localized `*I18n` bags below are the display source of truth. Old
  // packs have null bags → the UI falls back to these plain strings.
  name: string;
  nameI18n?: Partial<Localized<string>> | null;
  description?: string | null;
  descriptionI18n?: Partial<Localized<string>> | null;
  // Table-style multilingual labels (no legacy plain counterpart).
  treatmentExpirationLabel?: Partial<Localized<string>> | null;
  finishingIncludedLabel?: Partial<Localized<string>> | null;
  // `maxStepsPerArch` doubles as "aligners per arch" (null when unlimited).
  maxStepsPerArch?: number | null;
  includedCorrections?: number | null;
  treatmentValidityMonths?: number | null;
  isUnlimitedSteps: boolean;
  isUnlimitedCorrections: boolean;
  isForOrthodontists: boolean;
  isActive: boolean;
  /** Position in the catalogue, set by the admin (lowest first). */
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  prices?: PackPrice[];
}

export interface PackPrice {
  id: string;
  packId: string;
  archType: ArchType;
  price: string;          // decimal-as-string
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePackDto {
  // FR name required (sent via nameI18n.fr; legacy `name` still accepted).
  name?: string;
  nameI18n?: { fr?: string; en?: string };
  description?: string;
  descriptionI18n?: { fr?: string; en?: string };
  treatmentExpirationLabel?: { fr?: string; en?: string };
  finishingIncludedLabel?: { fr?: string; en?: string };
  maxStepsPerArch?: number;
  includedCorrections?: number;
  treatmentValidityMonths?: number | null;
  isUnlimitedSteps?: boolean;
  isUnlimitedCorrections?: boolean;
  isForOrthodontists?: boolean;
  isActive?: boolean;
  // Legacy single inline price (→ two_arches). Prefer the arch-specific
  // fields below; the backend atomically creates the matching PackPrice
  // rows. At least one price is required.
  price?: number;
  priceTwoArches?: number;
  // null / omitted = single-arch not offered (orders disable "Arcade
  // unique" for this pack).
  priceSingleArch?: number | null;
  currency?: string;
}

export type UpdatePackDto = Partial<CreatePackDto>;

export interface CreatePackPriceDto {
  archType: ArchType;
  price: number;          // sent as number, persisted as Decimal
  currency?: string;
}

export type UpdatePackPriceDto = Partial<CreatePackPriceDto> & {
  isActive?: boolean;
};

export interface AttachPackToQuotationDto {
  packId: string;
  // Optional — defaults to two_arches on the backend. The admin UI
  // consolidated to a single price per pack, so callers don't need
  // to pass an arch.
  archType?: ArchType;
}

export interface PaymentPlanBatchDto {
  fromStep: number;
  toStep: number;
}

export interface PaymentPlanInstallmentDto {
  amount: number;
  availableFrom?: string;   // ISO date
  dueDate?: string;         // ISO date
  batch: PaymentPlanBatchDto;
}

export interface ConfigurePaymentPlanDto {
  paymentMode: PaymentMode;
  installments: PaymentPlanInstallmentDto[];
}

export interface QuoteInstallment {
  id: string;
  quotationId: string;
  installmentNumber: number;
  amount: string;
  availableFrom: string;
  dueDate?: string | null;
  status: InstallmentStatus;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * The installment's latest bank-transfer declaration (P-A, one grouped
   * query per quote), null when it has none. Optional while an older API
   * omits it: the panel then reads the installment status alone.
   */
  latestTransfer?: InstallmentLatestTransfer | null;
}

export interface QuoteStepBatch {
  id: string;
  quotationId: string;
  installmentId: string;
  batchNumber: number;
  fromStep: number;
  toStep: number;
  status: BatchStatus;
  unlockedAt?: string | null;
  /** What released the steps (spec §3); null on batches still locked. */
  unlockSource?: BatchUnlockSource | null;
  deliveredAt?: string | null;
  deliveredById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  quotationId: string | null;
  installmentId: string | null;
  orderId: string;
  /**
   * Cash charged or received: the installment (TTC) + the stamp - any
   * retenue à la source.
   */
  amount: string;
  /** Retenue à la source rate (%) the practitioner applied; null = none. */
  withholdingRate?: number | string | null;
  /** Amount the practitioner kept back (0 when none). */
  withholdingAmount?: number | string;
  /**
   * Droit de timbre charged on top with this payment (its facture's
   * stamp). 0 on payments made before 2026-11-20.
   */
  stampAmount?: number | string;
  /**
   * What this payment settles on the quote: amount + withholdingAmount -
   * stampAmount (= the installment amount).
   */
  settledAmount?: number | string;
  /** The facture's total: amount + withholdingAmount (stamp included). */
  grossAmount?: number | string;
  currency: string;
  purpose?: PaymentPurpose;
  /** The Prisma column, serialised verbatim. */
  paymentMethod: PaymentMethod;
  status: PaymentRecordStatus;
  idempotencyKey?: string | null;
  transactionId?: string | null;
  bankReference?: string | null;
  /**
   * Stored receipt path: the owning dentist and admins only, and never a
   * URL to open (the folder is private). Read the bytes through
   * GET payments/:paymentId/proof; test `hasProof` instead.
   */
  proofUrl?: string | null;
  /** Whether a transfer receipt is attached (every reader, P-A). */
  hasProof?: boolean;
  receiptNumber?: string | null;
  /** Printed receipt/invoice number (sequential FAC-XXXXXX; admin-editable). */
  invoiceNumber?: string | null;
  notes?: string | null;
  rejectionReason?: string | null;
  initiatedById?: string | null;
  confirmedById?: string | null;
  rejectedById?: string | null;
  initiatedAt?: string | null;
  /** Bank transfer: when the dentist declared it. */
  declaredAt?: string | null;
  /** When the money counts as received; null until the payment succeeds. */
  paidAt?: string | null;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
  /** Bank transfer: the FIRST time an admin opened the receipt ("À vérifier"). */
  reviewOpenedAt?: string | null;
  /** A declaration withdrawn or superseded (status cancelled): when. */
  cancelledAt?: string | null;
  /** Retenue threshold in force when the charge was computed (snapshot). */
  withholdingThreshold?: number | string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A row of the payment list endpoints (history, the dentist's own list,
 * the confirmation queue): the payment with its order, quote and
 * installment. Archived orders' payments never appear in these lists.
 */
export interface PaymentListItem extends Payment {
  order?: {
    id: string;
    orderCode: string;
    doctor?: { id: string; fullName: string } | null;
    patient?: { id: string; fullName: string } | null;
  } | null;
  quotation?: {
    id: string;
    orderId: string;
    packName?: string | null;
  } | null;
  installment?: {
    id: string;
    installmentNumber: number;
    amount: string;
  } | null;
}

export interface HostedPaymentSession {
  paymentId: string;
  orderId: string;
  quotationId: string | null;
  installmentId: string | null;
  purpose: PaymentPurpose;
  status: PaymentRecordStatus;
  providerStatus: number | null;
  /** Cash charged: what the payment settles + the stamp - the retenue. */
  amount: string;
  /** Droit de timbre added on top of this payment. */
  stampAmount?: number | string;
  /** What the payment settles (the installment, or the fee + CBCT, TTC). */
  settledAmount?: number | string;
  currency: string;
  paymentUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface DeclareBankTransferDto {
  bankReference?: string;
  /** Apply the retenue à la source (sent as a multipart string field). */
  applyWithholding?: boolean;
  // proofFile is sent as multipart FormData — not on the DTO type itself.
}

export interface RecordCashPaymentDto {
  receiptNumber?: string;
  notes?: string;
  /** The practitioner kept the retenue à la source back. */
  applyWithholding?: boolean;
  /** Cash by default; a cheque is recorded the same way. */
  method?: PaymentMethod.CASH | PaymentMethod.CHEQUE;
}

export enum PaymentSortBy {
  CREATED_AT = 'createdAt',
  AMOUNT = 'amount',
  PAID_AT = 'paidAt',
  STATUS = 'status',
  /**
   * The date the payment happened: when it was received, else when it
   * was made — the date `from`/`to` filter on and the desk's Date column.
   */
  EVENT_AT = 'eventAt',
}

export enum PaymentSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * Filter shape for the payment history + pending queue. Mirrors the
 * backend `PaymentFilterDto` (whose validation pipe refuses any unknown
 * field). Multi-value `methods` and `statuses` arrays are sent as
 * comma-separated strings on the wire (service layer handles the join).
 */
export interface PaymentFilterDto {
  page?: number;
  limit?: number;
  // Legacy single-value (kept for backward compat — multi versions win).
  paymentMethod?: PaymentMethod;
  status?: PaymentRecordStatus;
  // Canonical multi-value filters.
  methods?: PaymentMethod[];
  statuses?: PaymentRecordStatus[];
  /** Installments and treatment-fee card attempts share the table. */
  purpose?: PaymentPurpose;
  // Search + structural narrowing. The search also matches invoice
  // numbers, the gateway reference and an exact amount.
  search?: string;
  doctorId?: string;
  patientId?: string;
  /**
   * Inclusive calendar days 'YYYY-MM-DD', cut in Africa/Tunis days, on
   * the payment's event date: when it was paid, or when it was created
   * for a payment that never was.
   */
  from?: string;
  to?: string;
  /** Installment rank on its quote, both bounds included (1 = the first). */
  installmentMin?: number;
  installmentMax?: number;
  /** @deprecated creation-date range in UTC days; use `from` / `to`. */
  createdFrom?: string;
  /** @deprecated creation-date range in UTC days; use `from` / `to`. */
  createdTo?: string;
  // Sorting.
  sortBy?: PaymentSortBy;
  sortOrder?: PaymentSortOrder;
}

/** Money received in one bucket: amount with exactly 3 decimals, e.g. "1250.500". */
export interface PaymentsSummaryBucket {
  /** The cash received (net of any retenue), TND, 3 dp. */
  amount: string;
  count: number;
  /**
   * Brut = net + retenue (TND string, 3 dp). Sent since 2026-11-27; an
   * older API omits it (read it as `amount`).
   */
  gross?: string;
  /** The retenue à la source kept back by the practitioners (TND string, 3 dp). */
  withholding?: string;
}

export interface PaymentsSummaryByMethod {
  cash: PaymentsSummaryBucket;
  card: PaymentsSummaryBucket;
  bank_transfer: PaymentsSummaryBucket;
}

/**
 * GET /payments/summary — the money received (successful payments only)
 * over a range of Africa/Tunis days: installments and treatment fees,
 * each counted once, archived orders and waived fees left out. A dentist
 * only ever gets their own orders. `from` / `to` echo the resolved range
 * (no range asked → today).
 */
export interface PaymentsSummary {
  from: string | null;
  to: string | null;
  timeZone: 'Africa/Tunis';
  currency: 'TND';
  total: PaymentsSummaryBucket;
  methods: PaymentsSummaryByMethod;
  purposes: {
    installment: PaymentsSummaryBucket & { methods: PaymentsSummaryByMethod };
    treatment_fee: PaymentsSummaryBucket & { methods: PaymentsSummaryByMethod };
  };
}

export interface PaymentsSummaryParams {
  /** 'YYYY-MM-DD' (Africa/Tunis). Neither bound → today. */
  from?: string;
  to?: string;
  /** Admins only; the server ignores it for a dentist. */
  doctorId?: string;
}

/** GET /payments/practitioners: a dentist the payments filter can pick. */
export interface PaymentPractitioner {
  id: string;
  fullName: string;
  /** Tells two dentists of the same name apart. */
  email: string;
}

/** Which money a payments report covers. */
export type PaymentsReportKind = 'treatment_fee' | 'installment' | 'consolidated';

/** One tab's filters, as POST /payments/report takes them. */
export interface PaymentsReportSection {
  search?: string;
  doctorId?: string;
  methods?: PaymentMethod[];
  statuses?: PaymentRecordStatus[];
  sort?: 'recent' | 'oldest' | 'amount-desc' | 'amount-asc';
  /** Installments only. */
  installmentMin?: number;
  installmentMax?: number;
}

/**
 * POST /payments/report — the PDF of what the payments desk shows. No
 * date: today; `allDates`: no date filter on the rows (counted up to `to`).
 */
export interface PaymentsReportRequest {
  kind: PaymentsReportKind;
  from?: string;
  to?: string;
  allDates?: boolean;
  lang?: 'fr' | 'en';
  treatmentFees?: PaymentsReportSection;
  installments?: PaymentsReportSection;
}

export type TreatmentFeeSortBy = 'paidAt' | 'amount';

/**
 * GET /orders/admin/treatment-fees — mirrors the backend
 * `TreatmentFeeFilterDto`. `from` / `to` filter on the day the fee was
 * paid (a fee still to confirm has none, so a range leaves it out).
 * Newest first lists the fees still to confirm on top.
 */
export interface TreatmentFeeFilterParams {
  page?: number;
  limit?: number;
  search?: string;
  from?: string;
  to?: string;
  doctorId?: string;
  methods?: PaymentMethod[];
  statuses?: PaymentRecordStatus[];
  sortBy?: TreatmentFeeSortBy;
  sortOrder?: PaymentSortOrder;
}

export enum OrderFileCategory {
  RIGHT_PHOTO = 'right_photo',
  FRONT_PHOTO = 'front_photo',
  LEFT_PHOTO = 'left_photo',
  UPPER_PHOTO = 'upper_photo',
  LOWER_PHOTO = 'lower_photo',
  ORTHOPANTOMOGRAPHY = 'orthopantomography',
  STL = 'stl',
  PLY = 'ply',
  OBJ = 'obj',
  ZIP = 'zip',
  PDF = 'pdf',
  IMAGE = 'image',
  VIDEO = 'video',
  OTHER = 'other',
}

// ─── Programme contract (P0, CONTRACT.md): transfers, batches, retenue ────
// Mirrors oralign-backend: payments/services/transfer-state.ts,
// payments/services/transfer-queue.service.ts,
// common/exceptions/domain-error-codes.ts and the BatchUnlockSource enum.

/** QuoteStepBatch.unlockSource. manual = an admin, with a reason. */
export type BatchUnlockSource = 'payment' | 'installment_cancelled' | 'manual';

/** The two queues a bank-transfer declaration sits in. */
export type TransferKind = 'installment' | 'treatment_fee';

/**
 * The five spec states of a transfer, DERIVED from the status enum
 * (backend transfer-state.ts; frontend lib/payments/transfer-state.ts):
 * awaiting_receipt = payable, nothing in flight; receipt_sent =
 * awaiting_confirmation unopened; to_verify = awaiting_confirmation opened
 * by an admin; paid = success; refused = rejected.
 */
export type TransferState =
  | 'awaiting_receipt'
  | 'receipt_sent'
  | 'to_verify'
  | 'paid'
  | 'refused';

/**
 * Per installment on the quote response (P-A): its latest bank-transfer
 * declaration, null when it has none. Never a file path.
 */
export interface InstallmentLatestTransfer {
  paymentId: string;
  status: PaymentRecordStatus;
  state: TransferState;
  declaredAt: string | null;
  reviewOpenedAt: string | null;
  rejectionReason: string | null;
  hasProof: boolean;
}

/** ?filter= of GET admin/payments/transfer-queue, in tab order. */
export type TransferQueueFilter = 'nouveau' | 'a_verifier' | 'valide' | 'refuse';

/** Money of a queue row: JSON numbers, 3 decimals. */
export interface TransferQueueAmounts {
  /** What the transfer settles: the installment, or the fee + CBCT (TTC). */
  due: number;
  stamp: number;
  withholdingRate: number | null;
  withholding: number;
  /** due + stamp - withholding: the amount on the bank statement. */
  cash: number;
  currency: string;
}

/** One row of the merged admin transfer queue (installments + fees). */
export interface TransferQueueRow {
  kind: TransferKind;
  /** The row's identity for "Nouveau / Consulté" (notification subject). */
  subjectKey: string;
  paymentId: string | null;
  orderId: string;
  orderCode: string;
  quotationId: string | null;
  installmentNumber: number | null;
  doctor: { id: string; fullName: string } | null;
  patient: { id: string; fullName: string } | null;
  amounts: TransferQueueAmounts;
  status: PaymentRecordStatus;
  state: TransferState;
  hasProof: boolean;
  declaredAt: string | null;
  reviewOpenedAt: string | null;
  processedAt: string | null;
  rejectionReason: string | null;
  /** false = "Nouveau" for the calling admin. */
  seenByMe: boolean;
}

export interface TransferQueuePage {
  data: TransferQueueRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  counts: Record<TransferQueueFilter, number>;
}

/** Stable errorCode values of the transfer flows (backend domain-error-codes.ts). */
export const TRANSFER_ERROR = {
  /** 400: a dentist declared without a receipt (both flows). */
  PROOF_REQUIRED: 'PROOF_REQUIRED',
  /** 400: an admin skipped the receipt (declare or confirm) without a note. */
  PROOF_OVERRIDE_NOTE_REQUIRED: 'PROOF_OVERRIDE_NOTE_REQUIRED',
  /** 400: not JPEG / PNG / WebP / PDF (HEIC refused server-side). */
  RECEIPT_TYPE: 'RECEIPT_TYPE',
  /** 400: over 10 MB. */
  RECEIPT_TOO_LARGE: 'RECEIPT_TOO_LARGE',
  /** 400: refusal reason not 3-500 characters. */
  REJECTION_REASON_INVALID: 'REJECTION_REASON_INVALID',
  /** 409: already processed by another admin (or withdrawn): refetch, « déjà traité ». */
  TRANSFER_ALREADY_PROCESSED: 'TRANSFER_ALREADY_PROCESSED',
  /** 409: replace / withdraw on a transfer no longer awaiting confirmation. */
  TRANSFER_NOT_WITHDRAWABLE: 'TRANSFER_NOT_WITHDRAWABLE',
  /** 400: malformed Idempotency-Key header. */
  IDEMPOTENCY_KEY_INVALID: 'TRANSFER_IDEMPOTENCY_KEY_INVALID',
  /** 409: Idempotency-Key reused for another target. */
  IDEMPOTENCY_KEY_REUSED: 'TRANSFER_IDEMPOTENCY_KEY_REUSED',
  /** 404: no receipt, or not readable by this caller. */
  PROOF_NOT_FOUND: 'PROOF_NOT_FOUND',
  /** 400: malformed notification subject key. */
  SUBJECT_KEY_INVALID: 'NOTIFICATION_SUBJECT_INVALID',
} as const;
export type TransferErrorCode = (typeof TRANSFER_ERROR)[keyof typeof TRANSFER_ERROR];

/** Retenue à la source errorCode values. */
export const WITHHOLDING_ERROR = {
  /** 400: retenue asked while it is switched off (or the rate is 0). */
  WITHHOLDING_DISABLED: 'WITHHOLDING_DISABLED',
  /** 400: retenue asked on a payment below the threshold. */
  WITHHOLDING_BELOW_THRESHOLD: 'WITHHOLDING_BELOW_THRESHOLD',
} as const;
export type WithholdingErrorCode = (typeof WITHHOLDING_ERROR)[keyof typeof WITHHOLDING_ERROR];

/** Step-batch release errorCode values. */
export const BATCH_UNLOCK_ERROR = {
  /** 400: manual unlock without a 3-500 character reason. */
  UNLOCK_REASON_REQUIRED: 'UNLOCK_REASON_REQUIRED',
  /** 404: the batch is not on this quotation. */
  BATCH_NOT_FOUND: 'BATCH_NOT_FOUND',
} as const;
export type BatchUnlockErrorCode = (typeof BATCH_UNLOCK_ERROR)[keyof typeof BATCH_UNLOCK_ERROR];
