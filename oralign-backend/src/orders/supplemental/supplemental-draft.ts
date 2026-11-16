import {
  ArchTreatment,
  OrderType,
  type SupplementalOrderRequest,
} from '@prisma/client';
import { ELASTIC_CUTOUT_OPTIONS } from './supplemental.constants';
import type { UpdateSupplementalOrderDto } from '../dto/supplemental-order.dto';
import {
  describeContacts,
  describeTeeth,
  normaliseContact,
  normaliseDetails,
  type RequestDetails,
} from './supplemental-details';
import type { AuditChanges, AuditValue } from './supplemental-audit';
import type { SupplementalOrderType } from './supplemental.types';

/**
 * Draft PUT semantics, pure: which answers a kind has, how a whole-form
 * update merges into the stored draft (undefined = unchanged, null =
 * cleared), the normalisation every save applies, and the audit diff.
 */

/** Every answer the doctor gives on one of the four forms. */
export const DRAFT_ANSWER_FIELDS = [
  'reason',
  'reasonDetails',
  'currentUpperAligner',
  'currentLowerAligner',
  'passiveOppositeArch',
  'newUpperScan',
  'newLowerScan',
  'clinicalObjective',
  'movementRestriction',
  'apRelationshipRight',
  'apRelationshipLeft',
  'apOptions',
  'elasticCutouts',
  'attachmentPolicy',
  'existingAttachmentPolicy',
  'iprPolicy',
  'previousIpr',
  'precisionCutPolicy',
  'residualSpacePolicy',
  'upperInstructions',
  'lowerInstructions',
  'impressionMethod',
  'replacementFromAligner',
  'replacementToAligner',
  'quantity',
  'replacementReason',
  'urgency',
  'sourceTreatmentPlanId',
  'transferPurpose',
  'transferNotes',
  'warrantyDefectCategory',
  'warrantyDiscoveredAt',
  'warrantyLotReference',
  'warrantyComments',
] as const satisfies readonly (keyof SupplementalOrderRequest)[];

export type DraftAnswerField = (typeof DRAFT_ANSWER_FIELDS)[number];
export type SupplementalAnswers = Pick<
  SupplementalOrderRequest,
  DraftAnswerField
>;

/** The answers each kind asks; a PUT ignores the others. */
export const ANSWER_FIELDS_BY_TYPE: Record<
  SupplementalOrderType,
  readonly DraftAnswerField[]
> = {
  additional_aligners: [
    'reason',
    'reasonDetails',
    'currentUpperAligner',
    'currentLowerAligner',
    'passiveOppositeArch',
    'newUpperScan',
    'newLowerScan',
    'clinicalObjective',
    'movementRestriction',
    'apRelationshipRight',
    'apRelationshipLeft',
    'apOptions',
    'elasticCutouts',
    'attachmentPolicy',
    'existingAttachmentPolicy',
    'iprPolicy',
    'previousIpr',
    'precisionCutPolicy',
    'residualSpacePolicy',
    'upperInstructions',
    'lowerInstructions',
    'impressionMethod',
  ],
  replacement: [
    'replacementFromAligner',
    'replacementToAligner',
    'quantity',
    'replacementReason',
    'reasonDetails',
    'urgency',
  ],
  transfer_template: [
    'sourceTreatmentPlanId',
    'transferPurpose',
    'transferNotes',
    'quantity',
  ],
  warranty: [
    'replacementFromAligner',
    'warrantyDefectCategory',
    'warrantyDiscoveredAt',
    'warrantyLotReference',
    'warrantyComments',
  ],
};

/** A stored draft, as the rules see it. */
export interface DraftState {
  archTreatment: ArchTreatment | null;
  answers: SupplementalAnswers;
  details: RequestDetails;
}

/** One PUT, already validated by the pipe (strings trimmed, '' → null). */
export interface DraftUpdate {
  archTreatment?: ArchTreatment | null;
  answers: Partial<SupplementalAnswers>;
  /** Replace the request's teeth / contacts; null clears them. */
  teeth?: RequestDetails['teeth'] | null;
  contacts?: RequestDetails['contacts'] | null;
}

/** 'YYYY-MM-DD' → the instant stored for that calendar day (00:00 UTC). */
export function calendarDayToDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** The calendar day a stored day-instant stands for. */
export function dateToCalendarDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The pipe-validated PUT body as a draft update: the calendar day becomes
 * its stored instant, a cleared option list becomes [], contacts are
 * normalised (lower tooth first).
 */
export function draftUpdateFromDto(
  dto: UpdateSupplementalOrderDto,
): DraftUpdate {
  const {
    archTreatment,
    teeth,
    contacts,
    warrantyDiscoveredAt,
    apOptions,
    ...answers
  } = dto;
  return {
    archTreatment,
    answers: {
      ...answers,
      ...(warrantyDiscoveredAt === undefined
        ? {}
        : {
            warrantyDiscoveredAt:
              warrantyDiscoveredAt === null
                ? null
                : calendarDayToDate(warrantyDiscoveredAt),
          }),
      ...(apOptions === undefined ? {} : { apOptions: apOptions ?? [] }),
    },
    // null (clear) and undefined (unchanged) pass through as they are.
    teeth:
      teeth === undefined || teeth === null
        ? teeth
        : teeth.map(({ purpose, toothNumber }) => ({ purpose, toothNumber })),
    contacts:
      contacts === undefined || contacts === null
        ? contacts
        : contacts.map(({ purpose, fromTooth, toTooth, amountMm }) =>
            normaliseContact({ purpose, fromTooth, toTooth, amountMm }),
          ),
  };
}

/** Only the answers `type` asks, defined ones only. */
export function answersOf<K extends DraftAnswerField>(
  source: Partial<SupplementalAnswers>,
  fields: readonly K[],
): Partial<Pick<SupplementalAnswers, K>> {
  const picked: Partial<Pick<SupplementalAnswers, K>> = {};
  for (const field of fields) {
    if (source[field] !== undefined) picked[field] = source[field];
  }
  return picked;
}

/**
 * Answers that only exist under another answer are cleared when that
 * answer goes: the passive-opposite-arch question when both arches are
 * treated, the elastic cut-outs when no option that needs them is chosen.
 */
export function normaliseAnswers(
  type: SupplementalOrderType,
  archTreatment: ArchTreatment | null,
  answers: SupplementalAnswers,
): SupplementalAnswers {
  if (type !== OrderType.additional_aligners) return answers;
  const needsCutouts = answers.apOptions.some((option) =>
    ELASTIC_CUTOUT_OPTIONS.includes(option),
  );
  return {
    ...answers,
    passiveOppositeArch:
      archTreatment === ArchTreatment.both ? null : answers.passiveOppositeArch,
    elasticCutouts: needsCutouts ? answers.elasticCutouts : null,
  };
}

/**
 * The draft after one PUT: merged, normalised, details re-owned and kept
 * to the treated arches (stored ones too, so an arch change drops the
 * teeth of the arch it left).
 */
export function applyDraftUpdate(
  type: SupplementalOrderType,
  current: DraftState,
  update: DraftUpdate,
): DraftState {
  const archTreatment =
    update.archTreatment === undefined
      ? current.archTreatment
      : update.archTreatment;
  const answers = normaliseAnswers(type, archTreatment, {
    ...current.answers,
    ...answersOf(update.answers, ANSWER_FIELDS_BY_TYPE[type]),
  });
  const details = normaliseDetails(archTreatment, answers, {
    teeth:
      update.teeth === undefined ? current.details.teeth : (update.teeth ?? []),
    contacts:
      update.contacts === undefined
        ? current.details.contacts
        : (update.contacts ?? []),
  });
  return { archTreatment, answers, details };
}

/** An answer as the audit shows it: the warranty day as YYYY-MM-DD. */
function auditValue(
  answers: SupplementalAnswers,
  field: DraftAnswerField,
): AuditValue {
  const value = answers[field];
  return value instanceof Date ? dateToCalendarDay(value) : value;
}

/**
 * `{ field: { from, to } }` between two drafts: arch, every answer, the
 * teeth and the contacts (one readable line each). Empty when nothing
 * changed, so an idle autosave writes no audit row.
 */
export function draftChanges(
  before: DraftState,
  after: DraftState,
): AuditChanges {
  const changes: AuditChanges = {};
  const record = (field: string, from: AuditValue, to: AuditValue) => {
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes[field] = { from, to };
    }
  };
  record('archTreatment', before.archTreatment, after.archTreatment);
  for (const field of DRAFT_ANSWER_FIELDS) {
    record(
      field,
      auditValue(before.answers, field),
      auditValue(after.answers, field),
    );
  }
  record(
    'teeth',
    describeTeeth(before.details.teeth),
    describeTeeth(after.details.teeth),
  );
  record(
    'contacts',
    describeContacts(before.details.contacts),
    describeContacts(after.details.contacts),
  );
  return changes;
}
