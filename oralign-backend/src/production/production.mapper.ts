import {
  BatchStatus,
  OrderType,
  ProductionArch,
  ProductionEventType,
  type Prisma,
} from '@prisma/client';
import type { Caller } from '../common/access/caller';
import { businessToday } from '../common/time/business-day';
import { PRODUCTION_ACTS } from './production.constants';
import type {
  ArchPair,
  ProductionDossier,
  ProductionEventView,
  ProductionEventWithOrder,
  ProductionFileView,
  ProductionOrderRef,
  ProductionOrderSummary,
  ProductionPlanView,
  ProductionSupplementalAnswers,
  ProductionWarningCode,
  ReleasedRange,
  ReleasedRangeState,
} from './production.contract';
import {
  countersFromProgress,
  firstUncoveredStep,
  isDeliveryComplete,
  mergeStepRanges,
  orderKindOf,
  treatedArches,
  type StepRange,
} from './kernel';
import {
  orderFactsOf,
  releaseSummaryOf,
  trimmedBatchSpan,
  type OrderFacts,
} from './production-state';
import { canCancel, liveRanges, type RangeEvent } from './production.rules';
import type {
  DossierRow,
  EventViewRow,
  EventWithOrderRow,
  OrderRefRow,
  OrderSummaryRow,
} from './production.selects';

/**
 * Rows (from production.selects.ts) → the response contract
 * (production.contract.ts). Every function copies NAMED fields only and
 * never spreads a row, so a column added to a select can never reach a
 * response by accident (the leak-guard spec feeds them rows where every
 * fee, contact and path column is filled).
 */

const iso = (date: Date | null): string | null =>
  date ? date.toISOString() : null;

export function toEventView(
  row: EventViewRow,
  caller: Caller,
  now: Date,
): ProductionEventView {
  return {
    id: row.id,
    orderId: row.orderId,
    declarationId: row.declarationId,
    type: row.type,
    arch: row.arch,
    stepFrom: row.stepFrom,
    stepTo: row.stepTo,
    quantity: row.quantity,
    performedAt: row.performedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    createdByName: row.createdByName,
    createdByRole: row.createdByRole,
    deliveredTo: row.deliveredTo,
    deliveredToName: row.deliveredToName,
    note: row.note,
    // Stored as text[]: only codes the declare path wrote.
    warnings: row.warnings as ProductionWarningCode[],
    origin: row.origin,
    notifiedAt: iso(row.notifiedAt),
    cancelledAt: iso(row.cancelledAt),
    cancelledById: row.cancelledById,
    cancelledByName: row.cancelledByName,
    cancelReason: row.cancelReason,
    canCancel: canCancel(row, caller, now),
  };
}

export function toOrderRef(row: OrderRefRow): ProductionOrderRef {
  return {
    orderId: row.id,
    orderCode: row.orderCode,
    kind: orderKindOf(row.orderType),
    orderType: row.orderType,
    patientName: row.patient.fullName,
  };
}

export function toEventWithOrder(
  row: EventWithOrderRow,
  caller: Caller,
  now: Date,
): ProductionEventWithOrder {
  return { ...toEventView(row, caller, now), order: toOrderRef(row.order) };
}

/**
 * The summary head (one argument: the queue maps rows with it). The
 * release block is computed from the rules' reading of the same row
 * (orderFactsOf), i.e. exactly what a declaration is checked against.
 */
export function toOrderSummary(row: OrderSummaryRow): ProductionOrderSummary {
  return toOrderSummaryWith(row, orderFactsOf(row));
}

/** toOrderSummary() for a caller that already holds the row's facts (the sheet). */
export function toOrderSummaryWith(
  row: OrderSummaryRow,
  facts: OrderFacts,
): ProductionOrderSummary {
  const { planned } = facts;
  const counters = countersFromProgress(row.productionProgress);
  return {
    orderId: row.id,
    orderCode: row.orderCode,
    kind: orderKindOf(row.orderType),
    orderType: row.orderType,
    parentOrderId: row.parentOrderId,
    parentOrderCode: row.parentOrder?.orderCode ?? null,
    patientName: row.patient.fullName,
    practitionerName: row.doctor.fullName,
    status: row.status,
    archTreatment: row.archTreatment,
    treatedArches: facts.treated,
    planned,
    counters,
    lastActionAt: iso(row.productionProgress?.lastActionAt ?? null),
    deliveryComplete: isDeliveryComplete(planned, counters),
    release: releaseSummaryOf(facts),
  };
}

const RANGE_STATE: Readonly<Record<BatchStatus, ReleasedRangeState>> = {
  [BatchStatus.locked]: 'locked',
  [BatchStatus.unlocked]: 'released',
  [BatchStatus.delivered]: 'delivered',
};

/**
 * The live quotation's batches as step ranges, ascending; null without
 * any. Never an amount. Each range ends at the highest approved total of
 * the treated arches (a batch cut from the pack maximum never shows
 * aligners the plan does not have); a batch wholly beyond it is left out.
 */
export function toReleasedRanges(
  batches:
    | readonly { fromStep: number; toStep: number; status: BatchStatus }[]
    | null,
  facts: Pick<OrderFacts, 'treated' | 'planned'>,
): ReleasedRange[] | null {
  if (!batches || batches.length === 0) return null;
  return [...batches]
    .sort((a, b) => a.fromStep - b.fromStep || a.toStep - b.toStep)
    .flatMap((batch) => {
      const span = trimmedBatchSpan(batch, facts.treated, facts.planned);
      return span ? [{ ...span, state: RANGE_STATE[batch.status] }] : [];
    });
}

/**
 * Per act and arch, the lowest RELEASED step the live events do not
 * cover; null when untreated, or when every released step up to the
 * planned total is covered (the next steps are locked: the form never
 * proposes them by default).
 */
export function nextStepFromOf(
  events: readonly RangeEvent[],
  planned: ProductionOrderSummary['planned'],
  released: readonly StepRange[],
): Record<ProductionEventType, ArchPair<number | null>> {
  const spans = mergeStepRanges(released);
  const next = {} as Record<ProductionEventType, ArchPair<number | null>>;
  for (const act of PRODUCTION_ACTS) {
    const forArch = (arch: ProductionArch): number | null => {
      const target = planned[arch];
      if (target === null) return null;
      const covered = liveRanges(events, act, arch);
      for (const span of spans) {
        const start = Math.max(span.from, 1);
        const limit = Math.min(
          span.to,
          target.total ?? Number.MAX_SAFE_INTEGER,
        );
        if (limit < start) continue;
        const step = firstUncoveredStep(covered, limit, start);
        if (step !== null) return step;
      }
      return null;
    };
    next[act] = {
      upper: forArch(ProductionArch.upper),
      lower: forArch(ProductionArch.lower),
    };
  }
  return next;
}

/** Whole years between a birth date (a calendar day) and `today` ('YYYY-MM-DD'). */
export function ageOn(dateOfBirth: Date | null, today: string): number | null {
  if (!dateOfBirth) return null;
  const [birthYear, birthMonth, birthDay] = dateOfBirth
    .toISOString()
    .slice(0, 10)
    .split('-')
    .map(Number);
  const [year, month, day] = today.split('-').map(Number);
  const beforeBirthday =
    month < birthMonth || (month === birthMonth && day < birthDay);
  const age = year - birthYear - (beforeBirthday ? 1 : 0);
  return age >= 0 ? age : null;
}

type VariantMap = NonNullable<ProductionFileView['variants']>;

/**
 * The variants JSON without its disk paths (same whitelist as the order
 * module's sanitizeVariantsForApi): clients address a variant by name.
 */
export function variantsWithoutPaths(
  variants: Prisma.JsonValue | null,
): VariantMap | null {
  if (!variants || typeof variants !== 'object' || Array.isArray(variants)) {
    return null;
  }
  const out: VariantMap = {};
  for (const [name, raw] of Object.entries(variants)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const info = raw as Record<string, unknown>;
    out[name] = {
      width: typeof info.width === 'number' ? info.width : undefined,
      height: typeof info.height === 'number' ? info.height : undefined,
      sizeBytes:
        typeof info.sizeBytes === 'number' ? info.sizeBytes : undefined,
      format: typeof info.format === 'string' ? info.format : undefined,
    };
  }
  return Object.keys(out).length > 0 ? out : null;
}

function mediaMetadataOf(
  value: Prisma.JsonValue | null,
): Record<string, unknown> | null {
  // zip / 3D descriptors are counts, names and a bbox: never disk paths.
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toFileView(file: DossierRow['files'][number]): ProductionFileView {
  return {
    id: file.id,
    category: file.category,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    createdAt: file.createdAt.toISOString(),
    orderIndex: file.orderIndex,
    width: file.width,
    height: file.height,
    processingStatus: file.processingStatus,
    variants: variantsWithoutPaths(file.variants),
    mediaMetadata: mediaMetadataOf(file.mediaMetadata),
  };
}

function toPlanView(
  plan: DossierRow['treatmentPlans'][number] | undefined,
): ProductionPlanView | null {
  if (!plan) return null;
  const attachments = plan.messages
    .flatMap((message) => message.attachments)
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  return {
    id: plan.id,
    version: plan.version,
    name: plan.name,
    approvedAt: iso(plan.approvedAt),
    totalUpperAligners: plan.totalUpperAligners,
    totalLowerAligners: plan.totalLowerAligners,
    resultViewUrl: plan.resultViewUrl,
    hasMovementTable: Boolean(plan.movementTableImagePath),
    hasDentalTable: Boolean(plan.dentalTreatmentTableImagePath),
    ipr: plan.iprEntries.map((entry) => ({
      fromTooth: entry.fromTooth,
      toTooth: entry.toTooth,
      value: entry.value,
      note: entry.note,
    })),
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      category: attachment.category,
      createdAt: attachment.createdAt.toISOString(),
      width: attachment.width,
      height: attachment.height,
      processingStatus: attachment.processingStatus,
    })),
  };
}

function toSupplementalAnswers(
  request: NonNullable<DossierRow['supplementalRequest']>,
): ProductionSupplementalAnswers {
  return {
    reason: request.reason,
    reasonDetails: request.reasonDetails,
    currentUpperAligner: request.currentUpperAligner,
    currentLowerAligner: request.currentLowerAligner,
    passiveOppositeArch: request.passiveOppositeArch,
    newUpperScan: request.newUpperScan,
    newLowerScan: request.newLowerScan,
    clinicalObjective: request.clinicalObjective,
    movementRestriction: request.movementRestriction,
    apRelationshipRight: request.apRelationshipRight,
    apRelationshipLeft: request.apRelationshipLeft,
    apOptions: request.apOptions,
    elasticCutouts: request.elasticCutouts,
    attachmentPolicy: request.attachmentPolicy,
    existingAttachmentPolicy: request.existingAttachmentPolicy,
    iprPolicy: request.iprPolicy,
    previousIpr: request.previousIpr,
    precisionCutPolicy: request.precisionCutPolicy,
    residualSpacePolicy: request.residualSpacePolicy,
    upperInstructions: request.upperInstructions,
    lowerInstructions: request.lowerInstructions,
    impressionMethod: request.impressionMethod,
    replacementFromAligner: request.replacementFromAligner,
    replacementToAligner: request.replacementToAligner,
    quantity: request.quantity,
    replacementReason: request.replacementReason,
    urgency: request.urgency,
    sourceTreatmentPlanVersion: request.sourceTreatmentPlanVersion,
    transferPurpose: request.transferPurpose,
    transferNotes: request.transferNotes,
    defectiveAligners: request.defectiveAligners,
    warrantyDefectCategory: request.warrantyDefectCategory,
    // A calendar day stored at 00:00 UTC.
    warrantyDiscoveredAt: request.warrantyDiscoveredAt
      ? request.warrantyDiscoveredAt.toISOString().slice(0, 10)
      : null,
    warrantyLotReference: request.warrantyLotReference,
    warrantyComments: request.warrantyComments,
    teeth: request.teeth.map((tooth) => ({
      purpose: tooth.purpose,
      toothNumber: tooth.toothNumber,
    })),
    // The table's amountMm is millimetres of IPR, renamed so no key reads as money.
    contacts: request.contacts.map((contact) => ({
      purpose: contact.purpose,
      fromTooth: contact.fromTooth,
      toTooth: contact.toTooth,
      iprMm: contact.amountMm.toNumber(),
    })),
  };
}

export function toDossier(row: DossierRow, now: Date): ProductionDossier {
  const plan = row.treatmentPlans[0];
  return {
    order: {
      orderId: row.id,
      orderCode: row.orderCode,
      orderType: row.orderType,
      kind: orderKindOf(row.orderType),
      parentOrderId: row.parentOrderId,
      parentOrderCode: row.parentOrder?.orderCode ?? null,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      submittedAt: iso(row.submittedAt),
      patientStage: row.patientStage,
      archTreatment: row.archTreatment,
      treatBothArch: row.treatBothArch,
      treatedArches: treatedArches({
        archTreatment: row.archTreatment,
        treatBothArch: row.treatBothArch,
        approvedPlan: plan ?? null,
      }),
      chiefComplaint: row.chiefComplaint,
      treatmentPlan: row.treatmentPlan,
      dontMoveOption: row.dontMoveOption,
      apRelationship: row.apRelationship,
      anteroposteriorRelationship: row.anteroposteriorRelationship,
      elastics: row.elastics,
      openBite: row.openBite,
      midline: row.midline,
      ipr: row.ipr,
      biteRamps: row.biteRamps,
      expansion: row.expansion,
      crossbite: row.crossbite,
      spaces: row.spaces,
      extractions: row.extractions,
      specialInstructions: row.specialInstructions,
      additionalInstructions: row.additionalInstructions,
      materials: row.materials,
      useCbctWithScans: row.useCbctWithScans,
      wantsManufacturing: row.wantsManufacturing,
      totalAligners: row.totalAligners,
    },
    patient: {
      fullName: row.patient.fullName,
      gender: row.patient.gender,
      age: ageOn(row.patient.dateOfBirth, businessToday(now)),
    },
    practitioner: {
      fullName: row.doctor.fullName,
      clinicName: row.doctor.dentistProfile?.clinicName ?? null,
    },
    toothInstructions: row.toothInstructions.map((instruction) => ({
      toothNumber: instruction.toothNumber,
      type: instruction.type,
      value: instruction.value,
      note: instruction.note,
    })),
    files: row.files.map(toFileView),
    plan: toPlanView(plan),
    supplementalRequest:
      row.supplementalRequest && row.orderType !== OrderType.initial
        ? toSupplementalAnswers(row.supplementalRequest)
        : null,
  };
}
