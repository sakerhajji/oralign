'use client';

import { TextAreaField } from '@/components/orders/wizard';
import { useT } from '@/lib/i18n/lang-context';
import {
  ArchTreatment,
  OrderType,
  SupplementalToothPurpose,
  TransferTemplatePurpose,
} from '@/lib/types';
import { ClinicalQuestion, fieldDomId, questionErrorId } from '../clinical-question';
import { NoticeBox } from '../notice-box';
import { OptionGroup } from '../option-group';
import { QUANTITY_RANGE, TEXT_LIMITS } from '../supplemental-constants';
import { formatDay } from '../supplemental-format';
import { TeethPicker } from '../teeth-picker';
import type { StepProps } from './step-props';
import { WholeNumberField } from './whole-number-field';

const ARCHES = [ArchTreatment.UPPER, ArchTreatment.LOWER, ArchTreatment.BOTH] as const;
const PURPOSES = Object.values(TransferTemplatePurpose);
const QUANTITY = QUANTITY_RANGE[OrderType.TRANSFER_TEMPLATE];
const TRANSFER_TRAY = SupplementalToothPurpose.TRANSFER_TRAY;

/** Arch, source plan, tray purpose, number of trays and lab notes. */
export function TransferTemplateStep({ draft, set, errors, context }: StepProps) {
  const { t, lang } = useT();
  const legend = (key: string) => t(`supplemental.questions.transfer.${key}`);
  const { sourceTreatmentPlanVersion } = context.view.request;
  const plan = context.eligibility.approvedPlan;
  const planDate = plan?.version === sourceTreatmentPlanVersion ? formatDay(plan?.approvedAt, lang) : null;
  const notesRequired = draft.transferPurpose === TransferTemplatePurpose.OTHER;

  return (
    <div className="space-y-6">
      <NoticeBox title={legend('sourcePlan')}>
        {sourceTreatmentPlanVersion === null
          ? legend('sourcePlanMissing')
          : t('supplemental.questions.transfer.sourcePlanValue', {
              version: sourceTreatmentPlanVersion,
              date: planDate ?? '—',
            })}
      </NoticeBox>

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

      <ClinicalQuestion fields={['transferPurpose']} errors={errors} number={2} required legend={legend('purpose')}>
        <OptionGroup
          group="transferPurpose"
          options={PURPOSES}
          value={draft.transferPurpose}
          onChange={(purpose) => set('transferPurpose', purpose)}
          ariaLabel={legend('purpose')}
          describedBy={questionErrorId('transferPurpose')}
          invalid={!!errors.transferPurpose}
        />
      </ClinicalQuestion>

      <ClinicalQuestion
        fields={['quantity']}
        inline={['quantity']}
        errors={errors}
        number={3}
        required
        legend={legend('quantity')}
        hint={t('supplemental.questions.transfer.quantityHint', QUANTITY)}
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
        fields={['transferNotes']}
        inline={['transferNotes']}
        errors={errors}
        number={4}
        required={notesRequired}
        legend={legend('notes')}
      >
        <TextAreaField
          id={fieldDomId('transferNotes')}
          label={legend(notesRequired ? 'notesRequiredLabel' : 'notesLabel')}
          value={draft.transferNotes}
          onChange={(value) => set('transferNotes', value)}
          maxLength={TEXT_LIMITS.transferNotes}
          error={errors.transferNotes ? t(errors.transferNotes) : undefined}
        />
      </ClinicalQuestion>
    </div>
  );
}

/** The teeth whose attachments the tray will carry. */
export function TransferTeethStep({ draft, setTeeth, errors }: StepProps) {
  const { t } = useT();
  return (
    <ClinicalQuestion
      fields={[`teeth.${TRANSFER_TRAY}`]}
      inline={[`teeth.${TRANSFER_TRAY}`]}
      errors={errors}
      number={5}
      required
      legend={t('supplemental.questions.transfer.teeth')}
      hint={t('supplemental.questions.transfer.teethHint')}
    >
      <TeethPicker
        purpose={TRANSFER_TRAY}
        arch={draft.archTreatment}
        teeth={draft.teeth}
        onTeethChange={setTeeth}
        error={errors[`teeth.${TRANSFER_TRAY}`]}
      />
    </ClinicalQuestion>
  );
}
