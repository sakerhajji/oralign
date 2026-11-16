'use client';

import { CheckTile } from '@/components/orders/wizard';
import { useT } from '@/lib/i18n/lang-context';
import { SupplementalApCorrection, SupplementalApOption } from '@/lib/types';
import { ClinicalQuestion, questionErrorId } from '../../clinical-question';
import { OptionGroup, YesNoGroup, optionHintKey, optionLabelKey } from '../../option-group';
import { asksElasticCutouts } from '../../supplemental-draft';
import type { StepProps } from '../step-props';

const CORRECTIONS = Object.values(SupplementalApCorrection);
const THERAPEUTIC_OPTIONS = Object.values(SupplementalApOption);
const SIDES = [
  { field: 'apRelationshipRight', side: 'right' },
  { field: 'apRelationshipLeft', side: 'left' },
] as const;

/**
 * Q7: one radio group per side (columns from small screens up, stacked on
 * phones; rows share the same order so they line up), the therapeutic
 * options as check tiles, and the elastic cut-out follow-up.
 */
export function ApRelationshipQuestion({
  draft,
  set,
  errors,
}: Pick<StepProps, 'draft' | 'set' | 'errors'>) {
  const { t } = useT();

  const toggleOption = (option: SupplementalApOption, checked: boolean) =>
    set(
      'apOptions',
      THERAPEUTIC_OPTIONS.filter((candidate) =>
        candidate === option ? checked : draft.apOptions.includes(candidate),
      ),
    );

  return (
    <ClinicalQuestion
      fields={['apRelationshipRight', 'apRelationshipLeft', 'elasticCutouts']}
      errors={errors}
      number={7}
      required
      legend={t('supplemental.questions.apRelationship.legend')}
      hint={t('supplemental.questions.apRelationship.hint')}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {SIDES.map(({ field, side }) => (
          <div key={field} className="space-y-2">
            <p className="text-sm font-semibold">
              {t(`supplemental.questions.apRelationship.${side}`)}
            </p>
            <OptionGroup
              group="apCorrection"
              layout="stack"
              options={CORRECTIONS}
              value={draft[field]}
              onChange={(correction) => set(field, correction)}
              ariaLabel={t(`supplemental.questions.apRelationship.${side}`)}
              describedBy={questionErrorId('apRelationshipRight')}
              invalid={!!errors[field]}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t pt-4">
        <p className="text-sm font-semibold">
          {t('supplemental.questions.apRelationship.options')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('supplemental.questions.apRelationship.optionsHint')}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {THERAPEUTIC_OPTIONS.map((option) => (
            <CheckTile
              key={option}
              label={t(optionLabelKey('apOption', option))}
              description={t(optionHintKey('apOption', option))}
              checked={draft.apOptions.includes(option)}
              onCheckedChange={(checked) => toggleOption(option, checked)}
            />
          ))}
        </div>
      </div>

      {asksElasticCutouts(draft.apOptions) && (
        <div className="space-y-2 rounded-md border border-dashed p-3">
          <p className="text-sm font-medium">
            {t('supplemental.questions.apRelationship.elasticCutouts')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('supplemental.questions.apRelationship.elasticCutoutsHint')}
          </p>
          <YesNoGroup
            value={draft.elasticCutouts}
            onChange={(answer) => set('elasticCutouts', answer)}
            ariaLabel={t('supplemental.questions.apRelationship.elasticCutouts')}
            describedBy={questionErrorId('apRelationshipRight')}
            invalid={!!errors.elasticCutouts}
          />
        </div>
      )}
    </ClinicalQuestion>
  );
}
