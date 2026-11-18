'use client';

import { FieldError, TextAreaField, TextInput, fieldErrorId } from '@/components/orders/wizard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n/lang-context';
import { ArchTreatment, WarrantyDefectCategory } from '@/lib/types';
import { ClinicalQuestion, fieldDomId, questionErrorId } from '../clinical-question';
import { OptionGroup } from '../option-group';
import { TEXT_LIMITS } from '../supplemental-constants';
import { alignerCeiling, treatedArches, type Arch } from '../validation/rule-helpers';
import { DefectiveAlignersField } from './defective-aligners-field';
import type { StepProps } from './step-props';

const ARCHES = [ArchTreatment.UPPER, ArchTreatment.LOWER] as const;
const DEFECTS = Object.values(WarrantyDefectCategory);
const ALL_ARCHES: readonly Arch[] = ['upper', 'lower'];

/** The defective aligners, the defect, when it was noticed, and the lot. */
export function WarrantyStep({ draft, set, errors, context }: StepProps) {
  const { t } = useT();
  const legend = (key: string) => t(`supplemental.questions.warranty.${key}`);
  const chosenArches = treatedArches(draft.archTreatment);
  const archChosen = chosenArches.length > 0;
  // Before an arch is chosen both count, so the buttons do not turn into a
  // text field once one is picked. Null: nothing limits the numbers.
  const maxAligner = alignerCeiling(archChosen ? chosenArches : ALL_ARCHES, {
    planTotals: context.eligibility.alignerLimits,
    deliveredUpTo: context.eligibility.deliveredUpTo,
  });
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
        fields={['defectiveAligners']}
        errors={errors}
        number={2}
        required
        legend={legend('aligner')}
        hint={
          archChosen && maxAligner !== null && maxAligner >= 1
            ? t('supplemental.questions.warranty.alignerRange', { max: maxAligner })
            : undefined
        }
      >
        <DefectiveAlignersField
          value={draft.defectiveAligners}
          onChange={(value) => set('defectiveAligners', value)}
          max={maxAligner}
          archChosen={archChosen}
          invalid={!!errors.defectiveAligners}
        />
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
