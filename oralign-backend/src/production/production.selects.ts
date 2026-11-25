import {
  Prisma,
  TreatmentAttachmentCategory,
  TreatmentPlanStatus,
} from '@prisma/client';
import {
  PLANNED_TOTALS_ORDER_SELECT,
  PROGRESS_COUNTERS_SELECT,
  PROGRESS_EVENT_SELECT,
} from './kernel';

/**
 * Prisma select WHITELISTS of the production read and write paths. Every
 * production query uses one of these (never `include`, never the order
 * module's orderInclude): a column only reaches a response if it is named
 * here AND copied by production.mapper.ts. Each nested relation costs one
 * batched statement per call, whatever the number of rows (CONTRACT §1).
 */

/** The plan attachment categories the lab may open: deliverables, never chat files (§2.1 #3, #5). */
export const PLAN_ATTACHMENT_CATEGORIES: readonly TreatmentAttachmentCategory[] =
  [
    TreatmentAttachmentCategory.treatment_result,
    TreatmentAttachmentCategory.treatment_file,
    TreatmentAttachmentCategory.container,
  ];

/** The latest APPROVED, live plan of an order (nest under treatmentPlans). */
export const LATEST_APPROVED_PLAN = {
  where: { status: TreatmentPlanStatus.approved, deletedAt: null },
  orderBy: [
    { approvedAt: { sort: 'desc', nulls: 'last' } },
    { version: 'desc' },
  ],
  take: 1,
} satisfies Prisma.DentalOrder$treatmentPlansArgs;

// ── Events ─────────────────────────────────────────────────────────────

/** Every column of ProductionEventView (no idempotency key: it is the client's). */
export const EVENT_VIEW_SELECT = {
  id: true,
  orderId: true,
  declarationId: true,
  type: true,
  arch: true,
  stepFrom: true,
  stepTo: true,
  quantity: true,
  performedAt: true,
  createdAt: true,
  createdById: true,
  createdByName: true,
  createdByRole: true,
  deliveredTo: true,
  deliveredToName: true,
  note: true,
  warnings: true,
  origin: true,
  notifiedAt: true,
  cancelledAt: true,
  cancelledById: true,
  cancelledByName: true,
  cancelReason: true,
} satisfies Prisma.ProductionEventSelect;

export type EventViewRow = Prisma.ProductionEventGetPayload<{
  select: typeof EVENT_VIEW_SELECT;
}>;

/** An order's events as the declare rules, the progress and the projection read them. */
export const STATE_EVENT_SELECT = {
  ...PROGRESS_EVENT_SELECT,
  id: true,
  origin: true,
  createdById: true,
} satisfies Prisma.ProductionEventSelect;

export type StateEventRow = Prisma.ProductionEventGetPayload<{
  select: typeof STATE_EVENT_SELECT;
}>;

/** What a row of another list needs to name its case (ProductionOrderRef). */
export const ORDER_REF_SELECT = {
  id: true,
  orderCode: true,
  orderType: true,
  patient: { select: { fullName: true } },
} satisfies Prisma.DentalOrderSelect;

export type OrderRefRow = Prisma.DentalOrderGetPayload<{
  select: typeof ORDER_REF_SELECT;
}>;

/** An event with its case (Ma journée): 3 statements. */
export const EVENT_WITH_ORDER_SELECT = {
  ...EVENT_VIEW_SELECT,
  order: { select: ORDER_REF_SELECT },
} satisfies Prisma.ProductionEventSelect;

export type EventWithOrderRow = Prisma.ProductionEventGetPayload<{
  select: typeof EVENT_WITH_ORDER_SELECT;
}>;

// ── Orders ─────────────────────────────────────────────────────────────

/** A step batch without its installment: range and state only, never an amount. */
export const BATCH_STATE_SELECT = {
  id: true,
  fromStep: true,
  toStep: true,
  status: true,
  deliveredByProduction: true,
} satisfies Prisma.QuoteStepBatchSelect;

/**
 * The quotation columns the production rules read: the planned-total
 * inputs, the release state and the coverage validity. No money column.
 */
const RULES_QUOTATION_SELECT = {
  ...PLANNED_TOTALS_ORDER_SELECT.quotation.select,
  paymentStatus: true,
  treatmentValidityMonths: true,
  stepBatches: {
    select: BATCH_STATE_SELECT,
    orderBy: [{ fromStep: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.QuotationSelect;

/**
 * The order under the lock, for a declare or a cancel: status and dates,
 * the planned-total inputs, the coverage columns, the live quotation's
 * release state and the progress row (4-5 statements, one call).
 */
export const STATE_ORDER_SELECT = {
  id: true,
  status: true,
  deletedAt: true,
  createdAt: true,
  orderType: true,
  coverageStartedAt: true,
  coverageExpiresAt: true,
  ...PLANNED_TOTALS_ORDER_SELECT,
  quotation: { select: RULES_QUOTATION_SELECT },
  productionProgress: { select: PROGRESS_COUNTERS_SELECT },
} satisfies Prisma.DentalOrderSelect;

export type StateOrderRow = Prisma.DentalOrderGetPayload<{
  select: typeof STATE_ORDER_SELECT;
}>;

/** The head every per-case list shares (ProductionOrderSummary): 7 statements. */
export const ORDER_SUMMARY_SELECT = {
  id: true,
  orderCode: true,
  orderType: true,
  parentOrderId: true,
  status: true,
  parentOrder: { select: { orderCode: true } },
  patient: { select: { fullName: true } },
  doctor: { select: { fullName: true } },
  productionProgress: { select: PROGRESS_COUNTERS_SELECT },
  ...PLANNED_TOTALS_ORDER_SELECT,
} satisfies Prisma.DentalOrderSelect;

export type OrderSummaryRow = Prisma.DentalOrderGetPayload<{
  select: typeof ORDER_SUMMARY_SELECT;
}>;

/** The case sheet's order: the summary + clinic, dates and batches (9 statements). */
export const SHEET_ORDER_SELECT = {
  ...ORDER_SUMMARY_SELECT,
  createdAt: true,
  deletedAt: true,
  doctor: {
    select: {
      fullName: true,
      dentistProfile: { select: { clinicName: true } },
    },
  },
  quotation: { select: RULES_QUOTATION_SELECT },
} satisfies Prisma.DentalOrderSelect;

export type SheetOrderRow = Prisma.DentalOrderGetPayload<{
  select: typeof SHEET_ORDER_SELECT;
}>;

// ── Dossier (D9) ───────────────────────────────────────────────────────

/** ProductionFileView's columns, plus orderIndex/category for the neutral name. No path. */
export const FILE_VIEW_SELECT = {
  id: true,
  category: true,
  originalName: true,
  mimeType: true,
  size: true,
  createdAt: true,
  orderIndex: true,
  width: true,
  height: true,
  processingStatus: true,
  variants: true,
  mediaMetadata: true,
} satisfies Prisma.OrderFileSelect;

export const ATTACHMENT_VIEW_SELECT = {
  id: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  category: true,
  createdAt: true,
  width: true,
  height: true,
  processingStatus: true,
} satisfies Prisma.TreatmentMessageAttachmentSelect;

/** The clinical answers of a supplemental child: no coverage, review or audit column. */
const SUPPLEMENTAL_ANSWERS_SELECT = {
  reason: true,
  reasonDetails: true,
  currentUpperAligner: true,
  currentLowerAligner: true,
  passiveOppositeArch: true,
  newUpperScan: true,
  newLowerScan: true,
  clinicalObjective: true,
  movementRestriction: true,
  apRelationshipRight: true,
  apRelationshipLeft: true,
  apOptions: true,
  elasticCutouts: true,
  attachmentPolicy: true,
  existingAttachmentPolicy: true,
  iprPolicy: true,
  previousIpr: true,
  precisionCutPolicy: true,
  residualSpacePolicy: true,
  upperInstructions: true,
  lowerInstructions: true,
  impressionMethod: true,
  replacementFromAligner: true,
  replacementToAligner: true,
  quantity: true,
  replacementReason: true,
  urgency: true,
  sourceTreatmentPlanVersion: true,
  transferPurpose: true,
  transferNotes: true,
  defectiveAligners: true,
  warrantyDefectCategory: true,
  warrantyDiscoveredAt: true,
  warrantyLotReference: true,
  warrantyComments: true,
  teeth: {
    select: { purpose: true, toothNumber: true },
    orderBy: [{ purpose: 'asc' }, { toothNumber: 'asc' }],
  },
  contacts: {
    select: { purpose: true, fromTooth: true, toTooth: true, amountMm: true },
    orderBy: [{ purpose: 'asc' }, { fromTooth: 'asc' }, { toTooth: 'asc' }],
  },
} satisfies Prisma.SupplementalOrderRequestSelect;

/**
 * The finance-free dossier (D9) in ONE call, 14 statements: order,
 * patient, doctor, clinic, parent, tooth instructions, files, plan, IPR,
 * messages, attachments, request, teeth, contacts. Patient: name, gender
 * and birth date only (the age is computed, the date never sent).
 */
export const DOSSIER_SELECT = {
  id: true,
  orderCode: true,
  orderType: true,
  parentOrderId: true,
  status: true,
  createdAt: true,
  submittedAt: true,
  patientStage: true,
  archTreatment: true,
  treatBothArch: true,
  chiefComplaint: true,
  treatmentPlan: true,
  dontMoveOption: true,
  apRelationship: true,
  anteroposteriorRelationship: true,
  elastics: true,
  openBite: true,
  midline: true,
  ipr: true,
  biteRamps: true,
  expansion: true,
  crossbite: true,
  spaces: true,
  extractions: true,
  specialInstructions: true,
  additionalInstructions: true,
  materials: true,
  useCbctWithScans: true,
  wantsManufacturing: true,
  totalAligners: true,
  parentOrder: { select: { orderCode: true } },
  patient: { select: { fullName: true, gender: true, dateOfBirth: true } },
  doctor: {
    select: {
      fullName: true,
      dentistProfile: { select: { clinicName: true } },
    },
  },
  toothInstructions: {
    select: { toothNumber: true, type: true, value: true, note: true },
    orderBy: [{ toothNumber: 'asc' }, { type: 'asc' }],
  },
  files: {
    where: { deletedAt: null },
    select: FILE_VIEW_SELECT,
    orderBy: [
      { category: 'asc' },
      { orderIndex: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  },
  treatmentPlans: {
    ...LATEST_APPROVED_PLAN,
    select: {
      id: true,
      version: true,
      name: true,
      approvedAt: true,
      totalUpperAligners: true,
      totalLowerAligners: true,
      resultViewUrl: true,
      movementTableImagePath: true,
      dentalTreatmentTableImagePath: true,
      iprEntries: {
        select: { fromTooth: true, toTooth: true, value: true, note: true },
        orderBy: [{ fromTooth: 'asc' }, { toTooth: 'asc' }],
      },
      // Only the messages that carry a deliverable: a long chat never
      // inflates the read.
      messages: {
        where: {
          deletedAt: null,
          attachments: {
            some: {
              deletedAt: null,
              category: { in: [...PLAN_ATTACHMENT_CATEGORIES] },
            },
          },
        },
        select: {
          attachments: {
            where: {
              deletedAt: null,
              category: { in: [...PLAN_ATTACHMENT_CATEGORIES] },
            },
            select: ATTACHMENT_VIEW_SELECT,
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      },
    },
  },
  supplementalRequest: { select: SUPPLEMENTAL_ANSWERS_SELECT },
} satisfies Prisma.DentalOrderSelect;

export type DossierRow = Prisma.DentalOrderGetPayload<{
  select: typeof DOSSIER_SELECT;
}>;
