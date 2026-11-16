'use client';

import { useT } from '@/lib/i18n/lang-context';
import { ArchTreatment, SupplementalClinicalObjective } from '@/lib/types';
import { ClinicalQuestion, questionErrorId } from '../../clinical-question';
import { OptionGroup, YesNoGroup } from '../../option-group';
import { isSingleArch } from '../../supplemental-draft';
import type { StepProps } from '../step-props';

const ARCHES = [ArchTreatment.BOTH, ArchTreatment.UPPER, ArchTreatment.LOWER] as const;
const OBJECTIVES = Object.values(SupplementalClinicalObjective);
const OPPOSITE_NOTHING = 'nothing';
const OPPOSITE_PASSIVE = 'passive';
const OPPOSITE_ARCH = [OPPOSITE_NOTHING, OPPOSITE_PASSIVE] as const;
const SCAN_ROWS = [
  { field: 'newUpperScan', arch: 'upper' },
  { field: 'newLowerScan', arch: 'lower' },
] as const;

/** Q3 (arches and opposite arch), Q4 (new records per arch), Q5 (plan set-up). */
export function ArchesStep({ draft, set, errors }: StepProps) {
  const { t } = useT();
  const oppositeArch =
    draft.passiveOppositeArch === null
      ? null
      : draft.passiveOppositeArch
        ? OPPOSITE_PASSIVE
        : OPPOSITE_NOTHING;

  return (
    <div className="space-y-6">
      <ClinicalQuestion
        fields={['archTreatment', 'passiveOppositeArch']}
        errors={errors}
        number={3}
        required
        legend={t('supplemental.questions.archTreatment.legend')}
      >
        <OptionGroup
          group="archTreatment"
          layout="cardsTrio"
          withHints
          options={ARCHES}
          value={draft.archTreatment}
          onChange={(arch) => set('archTreatment', arch)}
          ariaLabel={t('supplemental.questions.archTreatment.legend')}
          describedBy={questionErrorId('archTreatment')}
          invalid={!!errors.archTreatment}
        />
        {isSingleArch(draft.archTreatment) && (
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <p className="text-sm font-medium">
              {t('supplemental.questions.archTreatment.opposite')}
            </p>
            <OptionGroup
              group="oppositeArch"
              layout="pills"
              options={OPPOSITE_ARCH}
              value={oppositeArch}
              onChange={(choice) => set('passiveOppositeArch', choice === OPPOSITE_PASSIVE)}
              ariaLabel={t('supplemental.questions.archTreatment.opposite')}
              describedBy={questionErrorId('archTreatment')}
              invalid={!!errors.passiveOppositeArch}
            />
          </div>
        )}
      </ClinicalQuestion>

      <ClinicalQuestion
        fields={['newUpperScan', 'newLowerScan']}
        errors={errors}
        number={4}
        required
        legend={t('supplemental.questions.newScans.legend')}
        hint={t('supplemental.questions.newScans.hint')}
      >
        <div className="space-y-3">
          {SCAN_ROWS.map(({ field, arch }) => (
            <div
              key={field}
              className="grid gap-2 sm:grid-cols-[10rem_1fr] sm:items-center"
            >
              <span className="text-sm font-medium">
                {t(`supplemental.options.archTreatment.${arch}`)}
              </span>
              <YesNoGroup
                value={draft[field]}
                onChange={(answer) => set(field, answer)}
                ariaLabel={t(`supplemental.questions.newScans.${arch}`)}
                describedBy={questionErrorId('newUpperScan')}
                invalid={!!errors[field]}
              />
            </div>
          ))}
        </div>
      </ClinicalQuestion>

      <ClinicalQuestion
        fields={['clinicalObjective']}
        errors={errors}
        number={5}
        required
        legend={t('supplemental.questions.clinicalObjective.legend')}
      >
        <OptionGroup
          group="clinicalObjective"
          layout="stack"
          withHints
          options={OBJECTIVES}
          value={draft.clinicalObjective}
          onChange={(objective) => set('clinicalObjective', objective)}
          ariaLabel={t('supplemental.questions.clinicalObjective.legend')}
          describedBy={questionErrorId('clinicalObjective')}
          invalid={!!errors.clinicalObjective}
        />
      </ClinicalQuestion>
    </div>
  );
}
