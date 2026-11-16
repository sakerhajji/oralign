import {
  ArchTreatment,
  OrderType,
  ReplacementReason,
  SupplementalApOption,
  SupplementalRequestReason,
  type SupplementalKind,
  type SupplementalOrderView,
  type SupplementalRequestAnswers,
  type UpdateSupplementalOrderDto,
} from '@/lib/types';
import { toothArch } from '@/components/orders/wizard/tooth-contacts';
import {
  ALIGNER_NUMBER_MAX,
  CONTACT_PURPOSE_OWNER,
  KIND_CONTACT_PURPOSES,
  KIND_TOOTH_PURPOSES,
  QUANTITY_RANGE,
  TOOTH_PURPOSE_OWNER,
} from './supplemental-constants';
import { isValidContact } from './tooth-details';

/** Free-text answers: kept as strings while typing, sent as `null` when blank. */
const TEXT_FIELDS = [
  'reasonDetails',
  'upperInstructions',
  'lowerInstructions',
  'transferNotes',
  'warrantyDiscoveredAt',
  'warrantyLotReference',
  'warrantyComments',
] as const;
type TextField = (typeof TEXT_FIELDS)[number];

/** Everything the wizard edits. `null` = not answered yet. */
export type SupplementalDraft = {
  [K in keyof SupplementalRequestAnswers]: K extends TextField
    ? string
    : SupplementalRequestAnswers[K];
} & { archTreatment: ArchTreatment | null };

export type DraftField = keyof SupplementalDraft;

/** The questions each kind asks — and therefore what its PUT carries. */
export const KIND_FIELDS: Record<SupplementalKind, readonly DraftField[]> = {
  [OrderType.ADDITIONAL_ALIGNERS]: [
    'archTreatment', 'reason', 'reasonDetails', 'currentUpperAligner',
    'currentLowerAligner', 'passiveOppositeArch', 'newUpperScan', 'newLowerScan',
    'clinicalObjective', 'movementRestriction', 'apRelationshipRight',
    'apRelationshipLeft', 'apOptions', 'elasticCutouts', 'attachmentPolicy',
    'existingAttachmentPolicy', 'iprPolicy', 'previousIpr', 'precisionCutPolicy',
    'residualSpacePolicy', 'upperInstructions', 'lowerInstructions',
    'impressionMethod', 'teeth', 'contacts',
  ],
  [OrderType.REPLACEMENT]: [
    'archTreatment', 'replacementFromAligner', 'replacementToAligner', 'quantity',
    'replacementReason', 'reasonDetails', 'urgency',
  ],
  [OrderType.TRANSFER_TEMPLATE]: [
    'archTreatment', 'transferPurpose', 'transferNotes', 'quantity', 'teeth',
  ],
  [OrderType.WARRANTY]: [
    'archTreatment', 'replacementFromAligner', 'warrantyDefectCategory',
    'warrantyDiscoveredAt', 'warrantyLotReference', 'warrantyComments',
  ],
};

/** Options of Q7 that call for the "elastic cut-outs" follow-up. */
const CUTOUT_OPTIONS: readonly SupplementalApOption[] = [
  SupplementalApOption.ELASTICS_SIMULATION,
  SupplementalApOption.SEQUENTIAL_DISTALIZATION,
];

/** Kinds that treat exactly one arch. */
const SINGLE_ARCH_KINDS: readonly SupplementalKind[] = [OrderType.WARRANTY];

export function treatsUpper(arch: ArchTreatment | null): boolean {
  return arch === ArchTreatment.UPPER || arch === ArchTreatment.BOTH;
}

export function treatsLower(arch: ArchTreatment | null): boolean {
  return arch === ArchTreatment.LOWER || arch === ArchTreatment.BOTH;
}

export function isSingleArch(arch: ArchTreatment | null): boolean {
  return arch === ArchTreatment.UPPER || arch === ArchTreatment.LOWER;
}

/** A tooth of an arch the request treats (11–28 upper, 31–48 lower). */
export function isInTreatedArch(tooth: number, arch: ArchTreatment | null): boolean {
  const row = toothArch(tooth);
  if (row === 'upper') return treatsUpper(arch);
  if (row === 'lower') return treatsLower(arch);
  return false;
}

export function asksElasticCutouts(options: readonly SupplementalApOption[]): boolean {
  return options.some((option) => CUTOUT_OPTIONS.includes(option));
}

export function draftFromView(view: SupplementalOrderView): SupplementalDraft {
  const r = view.request;
  return {
    archTreatment: view.order.archTreatment ?? null,
    reason: r.reason ?? null,
    reasonDetails: r.reasonDetails ?? '',
    currentUpperAligner: r.currentUpperAligner ?? null,
    currentLowerAligner: r.currentLowerAligner ?? null,
    passiveOppositeArch: r.passiveOppositeArch ?? null,
    newUpperScan: r.newUpperScan ?? null,
    newLowerScan: r.newLowerScan ?? null,
    clinicalObjective: r.clinicalObjective ?? null,
    movementRestriction: r.movementRestriction ?? null,
    apRelationshipRight: r.apRelationshipRight ?? null,
    apRelationshipLeft: r.apRelationshipLeft ?? null,
    apOptions: r.apOptions ?? [],
    elasticCutouts: r.elasticCutouts ?? null,
    attachmentPolicy: r.attachmentPolicy ?? null,
    existingAttachmentPolicy: r.existingAttachmentPolicy ?? null,
    iprPolicy: r.iprPolicy ?? null,
    previousIpr: r.previousIpr ?? null,
    precisionCutPolicy: r.precisionCutPolicy ?? null,
    residualSpacePolicy: r.residualSpacePolicy ?? null,
    upperInstructions: r.upperInstructions ?? '',
    lowerInstructions: r.lowerInstructions ?? '',
    impressionMethod: r.impressionMethod ?? null,
    replacementFromAligner: r.replacementFromAligner ?? null,
    replacementToAligner: r.replacementToAligner ?? null,
    quantity: r.quantity ?? null,
    replacementReason: r.replacementReason ?? null,
    urgency: r.urgency ?? null,
    transferPurpose: r.transferPurpose ?? null,
    transferNotes: r.transferNotes ?? '',
    warrantyDefectCategory: r.warrantyDefectCategory ?? null,
    // The API may send an ISO instant; the date input wants the day.
    warrantyDiscoveredAt: r.warrantyDiscoveredAt?.slice(0, 10) ?? '',
    warrantyLotReference: r.warrantyLotReference ?? '',
    warrantyComments: r.warrantyComments ?? '',
    teeth: r.teeth ?? [],
    contacts: (r.contacts ?? []).map((contact) => ({
      ...contact,
      // DECIMAL(4,2) column: tolerate a serialised string.
      amountMm: Number(contact.amountMm),
    })),
  };
}

function ownerSelected(
  draft: SupplementalDraft,
  owner: { field: DraftField; option: string } | null,
): boolean {
  return owner === null || draft[owner.field] === owner.option;
}

/**
 * The answers that actually apply. Hidden answers (a "details" text whose
 * "Other" was unticked, the opposite-arch choice once both arches are
 * treated, teeth under an option no longer chosen or on an arch no longer
 * treated…) are reset, so they are never sent, validated or summarised.
 * The editing state keeps them, which lets a doctor toggle an option (or
 * an arch) off and on without losing work.
 */
export function normaliseDraft(
  draft: SupplementalDraft,
  kind: SupplementalKind,
): SupplementalDraft {
  const next: SupplementalDraft = {
    ...draft,
    teeth: draft.teeth.filter(
      (tooth) =>
        KIND_TOOTH_PURPOSES[kind].includes(tooth.purpose) &&
        ownerSelected(draft, TOOTH_PURPOSE_OWNER[tooth.purpose]) &&
        isInTreatedArch(tooth.toothNumber, draft.archTreatment),
    ),
    contacts: draft.contacts.filter(
      (contact) =>
        KIND_CONTACT_PURPOSES[kind].includes(contact.purpose) &&
        ownerSelected(draft, CONTACT_PURPOSE_OWNER[contact.purpose]) &&
        isInTreatedArch(contact.fromTooth, draft.archTreatment) &&
        isInTreatedArch(contact.toTooth, draft.archTreatment),
    ),
  };
  if (SINGLE_ARCH_KINDS.includes(kind) && !isSingleArch(next.archTreatment)) {
    next.archTreatment = null;
  }
  if (kind === OrderType.ADDITIONAL_ALIGNERS) {
    if (next.reason !== SupplementalRequestReason.OTHER) next.reasonDetails = '';
    if (!treatsUpper(next.archTreatment)) next.currentUpperAligner = null;
    if (!treatsLower(next.archTreatment)) next.currentLowerAligner = null;
    if (!isSingleArch(next.archTreatment)) next.passiveOppositeArch = null;
    if (!asksElasticCutouts(next.apOptions)) next.elasticCutouts = null;
  }
  if (kind === OrderType.REPLACEMENT && next.replacementReason !== ReplacementReason.OTHER) {
    next.reasonDetails = '';
  }
  return next;
}

function isTextField(field: DraftField): field is TextField {
  return (TEXT_FIELDS as readonly DraftField[]).includes(field);
}

type NumberRange = { readonly min: number; readonly max: number };

const ALIGNER_NUMBER_RANGE: NumberRange = { min: 1, max: ALIGNER_NUMBER_MAX };
const ALIGNER_FIELDS: readonly DraftField[] = [
  'currentUpperAligner',
  'currentLowerAligner',
  'replacementFromAligner',
  'replacementToAligner',
];
const QUANTITY_LIMITS: Partial<Record<SupplementalKind, NumberRange>> = QUANTITY_RANGE;

/** The whole numbers the update DTO bounds, per field. */
function numberRange(field: DraftField, kind: SupplementalKind): NumberRange | null {
  if (ALIGNER_FIELDS.includes(field)) return ALIGNER_NUMBER_RANGE;
  if (field === 'quantity') return QUANTITY_LIMITS[kind] ?? null;
  return null;
}

function isAcceptedNumber(field: DraftField, value: unknown, kind: SupplementalKind): boolean {
  const range = numberRange(field, kind);
  return (
    range === null ||
    typeof value !== 'number' ||
    (Number.isInteger(value) && value >= range.min && value <= range.max)
  );
}

/**
 * The PUT body: the kind's questions only, blank text sent as `null`. A
 * number the server would refuse (aligner 0, eleven copies…) and an
 * invalid contact are left out — the server keeps its copy — so one bad
 * answer never blocks saving the others; the step's validation flags it.
 */
export function toUpdateDto(
  draft: SupplementalDraft,
  kind: SupplementalKind,
): UpdateSupplementalOrderDto {
  const normalised = normaliseDraft(draft, kind);
  const dto: Record<string, unknown> = {};
  for (const field of KIND_FIELDS[kind]) {
    const value = isTextField(field)
      ? normalised[field].trim() || null
      : field === 'contacts'
        ? normalised.contacts.filter(isValidContact)
        : normalised[field];
    if (isAcceptedNumber(field, value, kind)) dto[field] = value;
  }
  return dto as UpdateSupplementalOrderDto;
}
