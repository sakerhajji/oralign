'use client';

import { FieldError, TextAreaField, TextInput, fieldErrorId } from '@/components/orders/wizard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n/lang-context';
import { ArchTreatment, WarrantyDefectCategory } from '@/lib/types';
import { ClinicalQuestion, fieldDomId, questionErrorId } from '../clinical-question';
import { OptionGroup } from '../option-group';
import { ALIGNER_NUMBER_MAX, TEXT_LIMITS } from '../supplemental-constants';
import type { StepProps } from './step-props';
import { WholeNumberField } from './whole-number-field';

const ARCHES = [ArchTreatment.UPPER, ArchTreatment.LOWER] as const;
const DEFECTS = Object.values(WarrantyDefectCategory);

/** The defective aligner, the defect, when it was noticed, and the lot. */
export function WarrantyStep({ draft, set, errors, context }: StepProps) {
  const { t } = useT();
  const legend = (key: string) => t(`supplemental.questions.warranty.${key}`);
  const delivered = context.eligibility.deliveredUpTo;
  const dateId = fieldDomId('warrantyDiscoveredAt');
  const dateError = errors.warrantyDiscoveredAt ? t(errors.warrantyDiscoveredAt) : undefined;

  return (
    <div className="space-y-6">
      <ClinicalQuestion fields={['archTreatment']} errors={errors} number={1} required legend={legend('arch')}>
        <OptionGroup
          group="archTreatment"
          layout="pair"
          options={ARCHES}
          value={draft.archTreatment}
          onChange={(arch) => set('archTreatment', arch)}
          ariaLabel={legend('arch')}
          describedBy={questionErrorId('archTreatment')}
          invalid={!!errors.archTreatment}
        />
      </ClinicalQuestion>

      <ClinicalQuestion
        fields={['replacementFromAligner']}
        inline={['replacementFromAligner']}
        errors={errors}
        number={2}
        required
        legend={legend('aligner')}
        hint={
          delivered !== null
            ? t('supplemental.questions.currentAligner.delivered', { max: delivered })
            : undefined
        }
      >
        <div className="sm:max-w-xs">
          <WholeNumberField
            id={fieldDomId('replacementFromAligner')}
            label={legend('alignerLabel')}
            value={draft.replacementFromAligner}
            onChange={(value) => set('replacementFromAligner', value)}
            min={1}
            max={delivered ?? ALIGNER_NUMBER_MAX}
            error={errors.replacementFromAligner}
          />
        </div>
      </ClinicalQuestion>

      <ClinicalQuestion fields={['warrantyDefectCategory']} errors={errors} number={3} required legend={legend('defect')}>
        <OptionGroup
          group="defect"
          options={DEFECTS}
          value={draft.warrantyDefectCategory}
          onChange={(defect) => set('warrantyDefectCategory', defect)}
          ariaLabel={legend('defect')}
          describedBy={questionErrorId('warrantyDefectCategory')}
          invalid={!!errors.warrantyDefectCategory}
        />
      </ClinicalQuestion>

      <ClinicalQuestion
        fields={['warrantyDiscoveredAt']}
        inline={['warrantyDiscoveredAt']}
        errors={errors}
        number={4}
        required
        legend={legend('discoveredAt')}
      >
        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor={dateId}>{legend('discoveredAtLabel')}</Label>
          <Input
            id={dateId}
            type="date"
            className="h-11"
            min={context.caseOpenedOn ?? undefined}
            max={context.today}
            value={draft.warrantyDiscoveredAt}
            onChange={(event) => set('warrantyDiscoveredAt', event.target.value)}
            aria-invalid={dateError ? true : undefined}
            aria-describedby={dateError ? fieldErrorId(dateId) : undefined}
          />
          <FieldError id={fieldErrorId(dateId)} message={dateError} />
        </div>
      </ClinicalQuestion>

      <ClinicalQuestion
        fields={['warrantyComments', 'warrantyLotReference']}
        inline={['warrantyComments']}
        errors={errors}
        number={5}
        required
        legend={legend('description')}
      >
        <TextAreaField
          id={fieldDomId('warrantyComments')}
          label={legend('commentsLabel')}
          value={draft.warrantyComments}
          onChange={(value) => set('warrantyComments', value)}
          maxLength={TEXT_LIMITS.warrantyComments}
          error={errors.warrantyComments ? t(errors.warrantyComments) : undefined}
        />
        <TextInput
          id={fieldDomId('warrantyLotReference')}
          label={legend('lotLabel')}
          value={draft.warrantyLotReference}
          onChange={(value) => set('warrantyLotReference', value)}
          maxLength={TEXT_LIMITS.warrantyLotReference}
        />
      </ClinicalQuestion>
    </div>
  );
}
