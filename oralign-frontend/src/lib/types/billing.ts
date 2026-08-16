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
}

/**
 * Payment lifecycle. CARD: `pending → success | failed | cancelled`.
 * BANK_TRANSFER: `awaiting_confirmation → success | rejected`.
 * CASH: created directly in `success` by an admin endpoint.
 */
export enum PaymentRecordStatus {
  PENDING = 'pending',
  AWAITING_CONFIRMATION = 'awaiting_confirmation',
  SUCCESS = 'success',
  FAILED = 'failed',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
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
  isUnlimitedSteps: boolean;
  isUnlimitedCorrections: boolean;
  isForOrthodontists: boolean;
  isActive: boolean;
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
}

export interface QuoteStepBatch {
  id: string;
  quotationId: string;
  installmentId: string;
  batchNumber: number;
  fromStep: number;
  toStep: number;
  status: BatchStatus;
  deliveredAt?: string | null;
  deliveredById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  quotationId: string;
  installmentId: string;
  amount: string;
  currency: string;
  // Backend serialises the Prisma column verbatim as `paymentMethod`.
  // `method` is kept as an optional alias for any legacy consumer
  // that still reads it; the table + every new caller should rely
  // on `paymentMethod`.
  paymentMethod: PaymentMethod;
  /** @deprecated — historical alias for `paymentMethod`. */
  method?: PaymentMethod;
  status: PaymentRecordStatus;
  idempotencyKey?: string | null;
  transactionId?: string | null;
  bankReference?: string | null;
  proofUrl?: string | null;
  receiptNumber?: string | null;
  /** Printed receipt/invoice number (sequential FAC-XXXXXX; admin-editable). */
  invoiceNumber?: string | null;
  notes?: string | null;
  rejectionReason?: string | null;
  initiatedById?: string | null;
  confirmedById?: string | null;
  rejectedById?: string | null;
  initiatedAt?: string | null;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeclareBankTransferDto {
  bankReference?: string;
  // proofFile is sent as multipart FormData — not on the DTO type itself.
}

export interface ConfirmPaymentDto {
  notes?: string;
}

export interface RejectPaymentDto {
  rejectionReason: string;
}

export interface RecordCashPaymentDto {
  receiptNumber?: string;
  notes?: string;
}

export enum PaymentSortBy {
  CREATED_AT = 'createdAt',
  AMOUNT = 'amount',
  PAID_AT = 'paidAt',
  STATUS = 'status',
}

export enum PaymentSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * Filter shape for the payment history + pending queue. Mirrors the
 * backend `PaymentFilterDto`. Multi-value `methods` and `statuses`
 * arrays are sent as comma-separated strings on the wire (service
 * layer handles the join).
 */
export interface PaymentFilterDto {
  page?: number;
  limit?: number;
  // Legacy single-value (kept for backward compat — multi versions win).
  method?: PaymentMethod;
  paymentMethod?: PaymentMethod;
  status?: PaymentRecordStatus;
  // Canonical multi-value filters.
  methods?: PaymentMethod[];
  statuses?: PaymentRecordStatus[];
  // Search + structural narrowing.
  search?: string;
  doctorId?: string;
  patientId?: string;
  // Date range.
  createdFrom?: string;
  createdTo?: string;
  // Sorting.
  sortBy?: PaymentSortBy;
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
