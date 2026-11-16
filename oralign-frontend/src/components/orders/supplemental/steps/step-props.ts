import type {
  OrderFile,
  SupplementalEligibility,
  SupplementalKind,
  SupplementalOrderView,
} from '@/lib/types';
import type { ContactChange } from '../contacts-picker';
import type { DraftField, SupplementalDraft } from '../supplemental-draft';
import type { FieldErrors } from '../supplemental-validation';
import type { TeethChange } from '../teeth-picker';

export type DraftSetter = <K extends DraftField>(field: K, value: SupplementalDraft[K]) => void;

/** Read-only facts every step may need. */
export interface StepContext {
  kind: SupplementalKind;
  view: SupplementalOrderView;
  eligibility: SupplementalEligibility;
  /** Files uploaded on the request (photos, scans). */
  files: readonly OrderFile[];
  /** Today's business day, 'YYYY-MM-DD'. */
  today: string;
  /** The initial case's creation day; null until the case is loaded. */
  caseOpenedOn: string | null;
}

export interface StepProps {
  /** The editing state, as typed (not normalised). */
  draft: SupplementalDraft;
  set: DraftSetter;
  setTeeth: TeethChange;
  setContact: ContactChange;
  /** Field → i18n key, from the last "Continuer" / submit attempt. */
  errors: FieldErrors;
  context: StepContext;
}
