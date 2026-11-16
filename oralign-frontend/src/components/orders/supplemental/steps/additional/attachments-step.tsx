'use client';

import { useT } from '@/lib/i18n/lang-context';
import {
  SupplementalAttachmentPlan,
  SupplementalContactPurpose,
  SupplementalExistingAttachments,
  SupplementalIprPlan,
  SupplementalPreviousIpr,
  SupplementalToothPurpose,
} from '@/lib/types';
import { ClinicalQuestion, questionErrorId } from '../../clinical-question';
import type { StepProps } from '../step-props';
import { ChoiceWithContacts, ChoiceWithTeeth } from './choice-with-details';

const ATTACHMENT_PLANS = Object.values(SupplementalAttachmentPlan);
const EXISTING_ATTACHMENTS = Object.values(SupplementalExistingAttachments);
const IPR_PLANS = Object.values(SupplementalIprPlan);
const PREVIOUS_IPR = Object.values(SupplementalPreviousIpr);
const NO_ATTACHMENT = SupplementalToothPurpose.NO_ATTACHMENT;
const REMOVE_ATTACHMENT = SupplementalToothPurpose.REMOVE_ATTACHMENT;
const NO_IPR = SupplementalToothPurpose.NO_IPR;
const PERFORMED_IPR = SupplementalContactPurpose.PERFORMED_IPR;

/** Q8 (new attachments), Q9 (existing attachments), Q10 (IPR). */
export function AttachmentsStep({ draft, set, setTeeth, setContact, errors }: StepProps) {
  const { t } = useT();
  const legends = {
    attachments: t('supplemental.questions.attachmentPolicy.legend'),
    existing: t('supplemental.questions.existingAttachmentPolicy.legend'),
    ipr: t('supplemental.questions.ipr.plan'),
    previousIpr: t('supplemental.questions.ipr.previous'),
  };

  return (
    <div className="space-y-6">
      <ClinicalQuestion
        fields={['attachmentPolicy', `teeth.${NO_ATTACHMENT}`]}
        inline={[`teeth.${NO_ATTACHMENT}`]}
        errors={errors}
        number={8}
        required
        legend={legends.attachments}
      >
        <ChoiceWithTeeth
          group="attachmentPlan"
          options={ATTACHMENT_PLANS}
          value={draft.attachmentPolicy}
          onChange={(plan) => set('attachmentPolicy', plan)}
          ariaLabel={legends.attachments}
          describedBy={questionErrorId('attachmentPolicy')}
          invalid={!!errors.attachmentPolicy}
          purpose={NO_ATTACHMENT}
          arch={draft.archTreatment}
          teeth={draft.teeth}
          onTeethChange={setTeeth}
          errors={errors}
        />
      </ClinicalQuestion>

      <ClinicalQuestion
        fields={['existingAttachmentPolicy', `teeth.${REMOVE_ATTACHMENT}`]}
        inline={[`teeth.${REMOVE_ATTACHMENT}`]}
        errors={errors}
        number={9}
        required
        legend={legends.existing}
        hint={t('supplemental.questions.existingAttachmentPolicy.hint')}
      >
        <ChoiceWithTeeth
          group="existingAttachments"
          withHints
          options={EXISTING_ATTACHMENTS}
          value={draft.existingAttachmentPolicy}
          onChange={(policy) => set('existingAttachmentPolicy', policy)}
          ariaLabel={legends.existing}
          describedBy={questionErrorId('existingAttachmentPolicy')}
          invalid={!!errors.existingAttachmentPolicy}
          purpose={REMOVE_ATTACHMENT}
          arch={draft.archTreatment}
          teeth={draft.teeth}
          onTeethChange={setTeeth}
          errors={errors}
        />
      </ClinicalQuestion>

      <ClinicalQuestion
        fields={['iprPolicy', 'previousIpr', `teeth.${NO_IPR}`, `contacts.${PERFORMED_IPR}`]}
        inline={[`teeth.${NO_IPR}`, `contacts.${PERFORMED_IPR}`]}
        errors={errors}
        number={10}
        required
        legend={t('supplemental.questions.ipr.legend')}
      >
        <div className="space-y-2">
          <p className="text-sm font-semibold">{legends.ipr}</p>
          <ChoiceWithTeeth
            group="iprPlan"
            options={IPR_PLANS}
            value={draft.iprPolicy}
            onChange={(plan) => set('iprPolicy', plan)}
            ariaLabel={legends.ipr}
            describedBy={questionErrorId('iprPolicy')}
            invalid={!!errors.iprPolicy}
            purpose={NO_IPR}
            arch={draft.archTreatment}
            teeth={draft.teeth}
            onTeethChange={setTeeth}
            errors={errors}
          />
        </div>
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-semibold">{legends.previousIpr}</p>
          <ChoiceWithContacts
            group="previousIpr"
            options={PREVIOUS_IPR}
            value={draft.previousIpr}
            onChange={(answer) => set('previousIpr', answer)}
            ariaLabel={legends.previousIpr}
            describedBy={questionErrorId('iprPolicy')}
            invalid={!!errors.previousIpr}
            purpose={PERFORMED_IPR}
            arch={draft.archTreatment}
            contacts={draft.contacts}
            onContactChange={setContact}
            errors={errors}
          />
        </div>
      </ClinicalQuestion>
    </div>
  );
}
