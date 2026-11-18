/**
 * Client mirror of the server's submit rules (SPEC §2.4), per wizard step.
 * Pure: every rule maps (draft, context) to `{ field: i18nKey }`, so the
 * wizard can block "Continuer", show each message under its question and
 * jump to the first failing step on submit. Rules read the NORMALISED
 * draft (`normaliseDraft`): what would be sent, not the editing state.
 * The server stays the source of truth and re-checks everything.
 */
import type { SupplementalDraft } from './supplemental-draft';
import {
  arches,
  attachments,
  finishing,
  movement,
  photos,
  scans,
  situation,
} from './validation/additional-rules';
import {
  evidencePhotos,
  replacementDetails,
  transferDetails,
  transferTeeth,
  warrantyDetails,
} from './validation/request-rules';
import type {
  FieldErrors,
  StepKey,
  ValidationContext,
  Validator,
} from './validation/validation-types';

export {
  countScanFiles,
  expectedScanFiles,
  missingIntraoralPhotos,
  needsInstructions,
} from './validation/additional-rules';
export { VALIDATION_KEY } from './validation/validation-types';
export type {
  FieldErrors,
  StepKey,
  ValidationContext,
  ValidationField,
} from './validation/validation-types';

const noRules: Validator = () => ({});

const STEP_VALIDATORS: Record<StepKey, Validator> = {
  situation,
  arches,
  movement,
  attachments,
  finishing,
  scans,
  photos,
  replacementDetails,
  transferDetails,
  transferTeeth,
  warrantyDetails,
  evidencePhotos,
  review: noRules,
};

export function validateStep(
  step: StepKey,
  draft: SupplementalDraft,
  context: ValidationContext,
): FieldErrors {
  return STEP_VALIDATORS[step](draft, context);
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** The first step (in wizard order) that still has errors, if any. */
export function firstInvalidStep(
  steps: readonly StepKey[],
  draft: SupplementalDraft,
  context: ValidationContext,
): { index: number; errors: FieldErrors } | null {
  for (const [index, step] of steps.entries()) {
    const errors = validateStep(step, draft, context);
    if (hasErrors(errors)) return { index, errors };
  }
  return null;
}
