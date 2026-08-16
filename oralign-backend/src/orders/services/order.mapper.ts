import { OrderFile, Prisma, TreatmentPlanStatus } from '@prisma/client';
import { OrderFileResponseDto, OrderResponseDto } from '../dto/order.dto';
import { MediaVariantInfo } from '../../media/media.types';

/**
 * Order read model + DTO mapping, shared by every order-domain service
 * (core, files, export, treatment fee). Pure functions — no I/O, no DI —
 * so the services can stay focused on their own rules and the DTO shape
 * is defined exactly once.
 */

export const orderInclude = Prisma.validator<Prisma.DentalOrderInclude>()({
  doctor: {
    select: {
      id: true,
      fullName: true,
      email: true,
      dentistProfile: { select: { clinicName: true } },
    },
  },
  patient: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      gender: true,
      dateOfBirth: true,
      profilePhotoUrl: true,
    },
  },
  toothInstructions: {
    select: { toothNumber: true, type: true, value: true, note: true },
    orderBy: [{ toothNumber: 'asc' }, { type: 'asc' }],
  },
  files: {
    where: { deletedAt: null },
    // Saved upload order first (orderIndex is per order+category); the
    // createdAt tie-break keeps legacy rows (all index 0) stable.
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
  },
  // Used to compute notification badges in the orders list. `take: 1` keeps
  // the join tiny — Postgres only fetches one row per order, so this scales
  // with page size, not with plan-history size.
  //
  // PENDING plans are excluded: a pending plan is the planner's in-progress
  // draft, not a plan that has been issued to the doctor. Counting / badging
  // it would (a) leak a phantom "2nd treatment" to the doctor's tab and (b)
  // raise a premature "action required" dot. Planners still see every plan
  // (incl. drafts) via TreatmentPlanService.listForOrder + the always-on
  // treatment-plans tab, so nothing is hidden from them.
  treatmentPlans: {
    where: { deletedAt: null, status: { not: TreatmentPlanStatus.pending } },
    select: { id: true, status: true },
    orderBy: { version: 'desc' },
    take: 1,
  },
  _count: {
    select: {
      treatmentPlans: {
        where: { deletedAt: null, status: { not: TreatmentPlanStatus.pending } },
      },
    },
  },
});

export type OrderWithRelations = Prisma.DentalOrderGetPayload<{
  include: typeof orderInclude;
}>;

export function mapOrderToDto(order: OrderWithRelations): OrderResponseDto {
  return {
    id: order.id,
    orderCode: order.orderCode,
    doctorId: order.doctorId,
    patientId: order.patientId,
    assignedDesignerId: order.assignedDesignerId ?? undefined,
    status: order.status,
    patientStage: order.patientStage ?? undefined,
    chiefComplaint: order.chiefComplaint ?? undefined,
    archTreatment: order.archTreatment ?? undefined,
    treatBothArch: order.treatBothArch,
    treatmentPlan: order.treatmentPlan ?? undefined,
    dontMoveOption: order.dontMoveOption ?? undefined,
    apRelationship: order.apRelationship ?? undefined,
    anteroposteriorRelationship:
      order.anteroposteriorRelationship ?? undefined,
    elastics: order.elastics ?? undefined,
    openBite: order.openBite ?? undefined,
    midline: order.midline ?? undefined,
    ipr: order.ipr ?? undefined,
    biteRamps: order.biteRamps ?? undefined,
    expansion: order.expansion ?? undefined,
    crossbite: order.crossbite ?? undefined,
    spaces: order.spaces ?? undefined,
    extractions: order.extractions ?? undefined,
    specialInstructions: order.specialInstructions ?? undefined,
    additionalInstructions: order.additionalInstructions ?? undefined,
    useCbctWithScans: order.useCbctWithScans,
    wantsManufacturing: order.wantsManufacturing,
    materials: order.materials,
    // Prisma returns nullable columns as `null`, but ToothInstructionDto
    // declares `value?: string` / `note?: string` (i.e. undefined, not
    // null). Coerce here so the DTO shape stays clean and the strict
    // build doesn't reject the assignment.
    toothInstructions: order.toothInstructions.map((i) => ({
      toothNumber: i.toothNumber,
      type: i.type,
      value: i.value ?? undefined,
      note: i.note ?? undefined,
    })),
    files: order.files.map((file) => mapOrderFileToDto(file)),
    doctor: order.doctor
      ? {
          id: order.doctor.id,
          fullName: order.doctor.fullName,
          email: order.doctor.email,
          clinicName: order.doctor.dentistProfile?.clinicName ?? undefined,
        }
      : undefined,
    patient: {
      id: order.patient.id,
      fullName: order.patient.fullName,
      email: order.patient.email ?? undefined,
      phone: order.patient.phone ?? undefined,
      gender: order.patient.gender ?? undefined,
      dateOfBirth: order.patient.dateOfBirth ?? undefined,
      profilePhotoUrl: order.patient.profilePhotoUrl ?? undefined,
    },
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    submittedAt: order.submittedAt ?? undefined,
    treatmentFeePaidAt: order.treatmentFeePaidAt ?? undefined,
    // Decimal → Number at the DTO boundary so the frontend can format
    // it with the rest of the money fields without a Decimal lib.
    treatmentFeeAmount:
      order.treatmentFeeAmount !== null &&
      order.treatmentFeeAmount !== undefined
        ? Number(order.treatmentFeeAmount)
        : undefined,
    // CBCT supplement snapshot (Decimal → Number, same convention).
    cbctFeeAmount:
      order.cbctFeeAmount !== null && order.cbctFeeAmount !== undefined
        ? Number(order.cbctFeeAmount)
        : undefined,
    cbctFeeCurrency: order.cbctFeeCurrency ?? undefined,
    treatmentFeePaymentMethod: order.treatmentFeePaymentMethod ?? undefined,
    treatmentFeePaymentStatus: order.treatmentFeePaymentStatus ?? undefined,
    treatmentFeeProofPath: order.treatmentFeeProofPath ?? undefined,
    // Notification fields used by the orders list to render badges
    // ("Awaiting your review", "Approved", "Replanning requested", …).
    latestPlanStatus: order.treatmentPlans?.[0]?.status ?? undefined,
    treatmentPlansCount: order._count?.treatmentPlans ?? 0,
    deletedAt: order.deletedAt ?? null,
  };
}

export function mapOrderFileToDto(file: OrderFile): OrderFileResponseDto {
  return {
    id: file.id,
    category: file.category,
    originalName: file.originalName,
    fileName: file.fileName,
    relativePath: file.relativePath,
    mimeType: file.mimeType,
    size: file.size,
    createdAt: file.createdAt,
    generatedName: file.generatedName ?? undefined,
    orderIndex: file.orderIndex,
    width: file.width ?? undefined,
    height: file.height ?? undefined,
    processingStatus: file.processingStatus ?? undefined,
    variants: sanitizeVariantsForApi(file.variants),
    // zip/stl descriptors are safe by construction (counts, names,
    // bbox — never disk paths).
    mediaMetadata:
      (file.mediaMetadata as Record<string, unknown> | null) ?? undefined,
  };
}

/**
 * Strip disk paths from the variants JSON before it crosses the API:
 * clients address variants by NAME (`?variant=thumb`), never by path.
 */
function sanitizeVariantsForApi(
  variants: Prisma.JsonValue | null,
): Record<
  string,
  { width?: number; height?: number; sizeBytes?: number; format?: string }
> | undefined {
  if (!variants || typeof variants !== 'object' || Array.isArray(variants)) {
    return undefined;
  }
  const out: Record<
    string,
    { width?: number; height?: number; sizeBytes?: number; format?: string }
  > = {};
  for (const [name, raw] of Object.entries(variants)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const v = raw as Partial<MediaVariantInfo>;
    out[name] = {
      width: typeof v.width === 'number' ? v.width : undefined,
      height: typeof v.height === 'number' ? v.height : undefined,
      sizeBytes: typeof v.sizeBytes === 'number' ? v.sizeBytes : undefined,
      format: typeof v.format === 'string' ? v.format : undefined,
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
