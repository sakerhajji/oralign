'use client';

import { TextAreaField } from '@/components/orders/wizard';
import { useT } from '@/lib/i18n/lang-context';
import {
  SupplementalContactPurpose,
  SupplementalCutoutPlan,
  SupplementalResidualSpaces,
  SupplementalToothPurpose,
} from '@/lib/types';
import { ClinicalQuestion, fieldDomId, questionErrorId } from '../../clinical-question';
import { NoticeBox } from '../../notice-box';
import { TEXT_LIMITS } from '../../supplemental-constants';
import { needsInstructions } from '../../supplemental-validation';
import type { StepProps } from '../step-props';
import { ChoiceWithContacts, ChoiceWithTeeth } from './choice-with-details';

const CUTOUT_PLANS = Object.values(SupplementalCutoutPlan);
const RESIDUAL_SPACES = Object.values(SupplementalResidualSpaces);
const CUTOUT = SupplementalToothPurpose.CUTOUT;
const RESIDUAL_SPACE = SupplementalContactPurpose.RESIDUAL_SPACE;
const IMPORTANT_KEYS = ['singleArchOcclusion', 'newPlanApproval'] as const;

/** Q11 (elastic cut-outs), Q12 (residual spaces), Q13 (instructions). */
export function FinishingStep({ draft, set, setTeeth, setContact, errors }: StepProps) {
  const { t } = useT();
  const legends = {
    cutouts: t('supplemental.questions.precisionCutPolicy.legend'),
    spaces: t('supplemental.questions.residualSpacePolicy.legend'),
  };
  const instructionsError = errors.upperInstructions ? t(errors.upperInstructions) : undefined;

  return (
    <div className="space-y-6">
      <ClinicalQuestion
        fields={['precisionCutPolicy', `teeth.${CUTOUT}`]}
        inline={[`teeth.${CUTOUT}`]}
        errors={errors}
        number={11}
        required
        legend={legends.cutouts}
        hint={t('supplemental.questions.precisionCutPolicy.hint')}
      >
        <ChoiceWithTeeth
          group="cutoutPlan"
          options={CUTOUT_PLANS}
          value={draft.precisionCutPolicy}
          onChange={(plan) => set('precisionCutPolicy', plan)}
          ariaLabel={legends.cutouts}
          describedBy={questionErrorId('precisionCutPolicy')}
          invalid={!!errors.precisionCutPolicy}
          purpose={CUTOUT}
          arch={draft.archTreatment}
          teeth={draft.teeth}
          onTeethChange={setTeeth}
          errors={errors}
        />
      </ClinicalQuestion>

      <ClinicalQuestion
        fields={['residualSpacePolicy', `contacts.${RESIDUAL_SPACE}`]}
        inline={[`contacts.${RESIDUAL_SPACE}`]}
        errors={errors}
        number={12}
        required
        legend={legends.spaces}
      >
        <ChoiceWithContacts
          group="residualSpaces"
          options={RESIDUAL_SPACES}
          value={draft.residualSpacePolicy}
          onChange={(policy) => set('residualSpacePolicy', policy)}
          ariaLabel={legends.spaces}
          describedBy={questionErrorId('residualSpacePolicy')}
          invalid={!!errors.residualSpacePolicy}
          purpose={RESIDUAL_SPACE}
          arch={draft.archTreatment}
          contacts={draft.contacts}
          onContactChange={setContact}
          errors={errors}
        />
      </ClinicalQuestion>

      <ClinicalQuestion
        fields={['upperInstructions', 'lowerInstructions']}
        inline={['upperInstructions']}
        errors={errors}
        number={13}
        required={needsInstructions(draft)}
        legend={t('supplemental.questions.instructions.legend')}
        hint={
          needsInstructions(draft)
            ? t('supplemental.questions.instructions.requiredHint')
            : t('supplemental.questions.instructions.hint')
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <TextAreaField
            id={fieldDomId('upperInstructions')}
            label={t('supplemental.questions.instructions.upper')}
            value={draft.upperInstructions}
            onChange={(value) => set('upperInstructions', value)}
            maxLength={TEXT_LIMITS.instructions}
            error={instructionsError}
          />
          <TextAreaField
            id={fieldDomId('lowerInstructions')}
            label={t('supplemental.questions.instructions.lower')}
            value={draft.lowerInstructions}
            onChange={(value) => set('lowerInstructions', value)}
            maxLength={TEXT_LIMITS.instructions}
          />
        </div>
      </ClinicalQuestion>

      <NoticeBox title={t('supplemental.notices.important.title')}>
        <ul className="list-disc space-y-1 pl-5">
          {IMPORTANT_KEYS.map((key) => (
            <li key={key}>{t(`supplemental.notices.important.${key}`)}</li>
          ))}
        </ul>
      </NoticeBox>
    </div>
  );
}
