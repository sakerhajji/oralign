'use client';

import { useT } from '@/lib/i18n/lang-context';
import { SupplementalTeethScope, SupplementalToothPurpose } from '@/lib/types';
import { ClinicalQuestion, questionErrorId } from '../../clinical-question';
import type { StepProps } from '../step-props';
import { ApRelationshipQuestion } from './ap-relationship-question';
import { ChoiceWithTeeth } from './choice-with-details';

const SCOPES = Object.values(SupplementalTeethScope);
const DO_NOT_MOVE = SupplementalToothPurpose.DO_NOT_MOVE;

/** Q6 (movement restrictions) and Q7 (antero-posterior relationship). */
export function MovementStep({ draft, set, setTeeth, errors }: StepProps) {
  const { t } = useT();
  const legend = t('supplemental.questions.movementRestriction.legend');
  return (
    <div className="space-y-6">
      <ClinicalQuestion
        fields={['movementRestriction', `teeth.${DO_NOT_MOVE}`]}
        inline={[`teeth.${DO_NOT_MOVE}`]}
        errors={errors}
        number={6}
        required
        legend={legend}
        hint={t('supplemental.questions.movementRestriction.hint')}
      >
        <ChoiceWithTeeth
          group="movementRestriction"
          options={SCOPES}
          value={draft.movementRestriction}
          onChange={(scope) => set('movementRestriction', scope)}
          ariaLabel={legend}
          describedBy={questionErrorId('movementRestriction')}
          invalid={!!errors.movementRestriction}
          purpose={DO_NOT_MOVE}
          arch={draft.archTreatment}
          teeth={draft.teeth}
          onTeethChange={setTeeth}
          errors={errors}
        />
        <p className="text-xs leading-5 text-muted-foreground">
          {t('supplemental.notices.practitionerResponsibility')}
        </p>
      </ClinicalQuestion>

      <ApRelationshipQuestion draft={draft} set={set} errors={errors} />
    </div>
  );
}
