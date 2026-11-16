'use client';

import { TextAreaField } from '@/components/orders/wizard';
import { useT } from '@/lib/i18n/lang-context';
import {
  ArchTreatment,
  OrderType,
  ReplacementReason,
  SupplementalUrgency,
} from '@/lib/types';
import { ClinicalQuestion, fieldDomId, questionErrorId } from '../clinical-question';
import { OptionGroup } from '../option-group';
import { ALIGNER_NUMBER_MAX, QUANTITY_RANGE, TEXT_LIMITS } from '../supplemental-constants';
import type { StepProps } from './step-props';
import { WholeNumberField } from './whole-number-field';

const ARCHES = [ArchTreatment.UPPER, ArchTreatment.LOWER, ArchTreatment.BOTH] as const;
const REASONS = Object.values(ReplacementReason);
const URGENCIES = Object.values(SupplementalUrgency);
const QUANTITY = QUANTITY_RANGE[OrderType.REPLACEMENT];

/** Which aligners to remake, how many copies, why and how fast. */
export function ReplacementStep({ draft, set, errors, context }: StepProps) {
  const { t } = useT();
  const delivered = context.eligibility.deliveredUpTo;
  const legend = (key: string) => t(`supplemental.questions.replacement.${key}`);

  return (
    <div className="space-y-6">
      <ClinicalQuestion fields={['archTreatment']} errors={errors} number={1} required legend={legend('arch')}>
        <OptionGroup
          group="archTreatment"
          options={ARCHES}
          value={draft.archTreatment}
          onChange={(arch) => set('archTreatment', arch)}
          ariaLabel={legend('arch')}
          describedBy={questionErrorId('archTreatment')}
          invalid={!!errors.archTreatment}
        />
      </ClinicalQuestion>

      <ClinicalQuestion
        fields={['replacementFromAligner', 'replacementToAligner']}
        inline={['replacementFromAligner', 'replacementToAligner']}
        errors={errors}
        number={2}
        required
        legend={legend('range')}
        hint={
          delivered !== null
            ? t('supplemental.questions.currentAligner.delivered', { max: delivered })
            : legend('rangeHint')
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <WholeNumberField
            id={fieldDomId('replacementFromAligner')}
            label={legend('from')}
            value={draft.replacementFromAligner}
            onChange={(value) => set('replacementFromAligner', value)}
            min={1}
            max={delivered ?? ALIGNER_NUMBER_MAX}
            error={errors.replacementFromAligner}
          />
          <WholeNumberField
            id={fieldDomId('replacementToAligner')}
            label={legend('to')}
            value={draft.replacementToAligner}
            onChange={(value) => set('replacementToAligner', value)}
            min={draft.replacementFromAligner ?? 1}
            max={delivered ?? ALIGNER_NUMBER_MAX}
            error={errors.replacementToAligner}
          />
        </div>
      </ClinicalQuestion>

      <ClinicalQuestion
        fields={['quantity']}
        inline={['quantity']}
        errors={errors}
        number={3}
        required
        legend={legend('quantity')}
        hint={t('supplemental.questions.replacement.quantityHint', QUANTITY)}
      >
        <div className="sm:max-w-xs">
          <WholeNumberField
            id={fieldDomId('quantity')}
            label={legend('quantityLabel')}
            value={draft.quantity}
            onChange={(value) => set('quantity', value)}
            min={QUANTITY.min}
            max={QUANTITY.max}
            error={errors.quantity}
          />
        </div>
      </ClinicalQuestion>

      <ClinicalQuestion
        fields={['replacementReason', 'reasonDetails']}
        inline={['reasonDetails']}
        errors={errors}
        number={4}
        required
        legend={legend('reason')}
      >
        <OptionGroup
          group="replacementReason"
          options={REASONS}
          value={draft.replacementReason}
          onChange={(reason) => set('replacementReason', reason)}
          ariaLabel={legend('reason')}
          describedBy={questionErrorId('replacementReason')}
          invalid={!!errors.replacementReason}
        />
        {draft.replacementReason === ReplacementReason.OTHER && (
          <TextAreaField
            id={fieldDomId('reasonDetails')}
            compact
            label={t('supplemental.questions.reason.details')}
            value={draft.reasonDetails}
            onChange={(value) => set('reasonDetails', value)}
            maxLength={TEXT_LIMITS.reasonDetails}
            error={errors.reasonDetails ? t(errors.reasonDetails) : undefined}
          />
        )}
      </ClinicalQuestion>

      <ClinicalQuestion fields={['urgency']} errors={errors} number={5} required legend={legend('urgency')}>
        <OptionGroup
          group="urgency"
          layout="cards"
          withHints
          options={URGENCIES}
          value={draft.urgency}
          onChange={(urgency) => set('urgency', urgency)}
          ariaLabel={legend('urgency')}
          describedBy={questionErrorId('urgency')}
          invalid={!!errors.urgency}
        />
      </ClinicalQuestion>
    </div>
  );
}
