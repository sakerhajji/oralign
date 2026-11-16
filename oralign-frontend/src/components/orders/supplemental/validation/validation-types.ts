import type {
  OrderFile,
  SupplementalContactPurpose,
  SupplementalToothPurpose,
} from '@/lib/types';
import type { DraftField, SupplementalDraft } from '../supplemental-draft';

export type StepKey =
  | 'situation'
  | 'arches'
  | 'movement'
  | 'attachments'
  | 'finishing'
  | 'scans'
  | 'photos'
  | 'replacementDetails'
  | 'optionalPhotos'
  | 'transferDetails'
  | 'transferTeeth'
  | 'warrantyDetails'
  | 'evidencePhotos'
  | 'review';

export type ValidationField =
  | DraftField
  | 'scanFiles'
  | 'photos'
  | `teeth.${SupplementalToothPurpose}`
  | `contacts.${SupplementalContactPurpose}`;

/** Field → i18n key of the message shown under the question. */
export type FieldErrors = Partial<Record<ValidationField, string>>;

export interface ValidationContext {
  /** Aligners in the approved plan per arch; null when unknown. */
  planTotals: { upper: number | null; lower: number | null };
  /** Highest aligner already handed over; null when nothing was delivered. */
  deliveredUpTo: number | null;
  /** Today's business day, 'YYYY-MM-DD'. */
  today: string;
  /** The initial case's creation day, 'YYYY-MM-DD'. */
  caseOpenedOn: string | null;
  /** Files already uploaded on the request. */
  files: readonly Pick<OrderFile, 'category' | 'originalName'>[];
}

/** A rule over the NORMALISED draft (see `normaliseDraft`). */
export type Validator = (draft: SupplementalDraft, context: ValidationContext) => FieldErrors;

export const VALIDATION_KEY = {
  required: 'supplemental.validation.required',
  details: 'supplemental.validation.details',
  alignerNumber: 'supplemental.validation.alignerNumber',
  alignerAbovePlan: 'supplemental.validation.alignerAbovePlan',
  alignerNotDelivered: 'supplemental.validation.alignerNotDelivered',
  currentAlignerMissing: 'supplemental.validation.currentAlignerMissing',
  rangeOrder: 'supplemental.validation.rangeOrder',
  quantity: 'supplemental.validation.quantity',
  teeth: 'supplemental.validation.teeth',
  contacts: 'supplemental.validation.contacts',
  contactAmount: 'supplemental.validation.contactAmount',
  instructions: 'supplemental.validation.instructions',
  scanFiles: 'supplemental.validation.scanFiles',
  photos: 'supplemental.validation.photos',
  evidencePhotos: 'supplemental.validation.evidencePhotos',
  dateFuture: 'supplemental.validation.dateFuture',
  dateBeforeCase: 'supplemental.validation.dateBeforeCase',
} as const;
