'use client';

import { ClinicalOrderFiles } from '@/components/orders/order-file-upload';
import { useT } from '@/lib/i18n/lang-context';
import { OrderType, type SupplementalKind } from '@/lib/types';
import { ClinicalQuestion } from '../clinical-question';
import { NoticeBox } from '../notice-box';
import { missingIntraoralPhotos } from '../supplemental-validation';
import type { StepProps } from './step-props';

/** What the photos prove for each kind, and whether they are required. */
const PHOTO_RULE: Record<SupplementalKind, { required: boolean; hintKey: string }> = {
  [OrderType.ADDITIONAL_ALIGNERS]: {
    required: true,
    hintKey: 'supplemental.questions.photos.intraoralHint',
  },
  [OrderType.REPLACEMENT]: {
    required: false,
    hintKey: 'supplemental.questions.photos.optionalHint',
  },
  [OrderType.TRANSFER_TEMPLATE]: {
    required: false,
    hintKey: 'supplemental.questions.photos.optionalHint',
  },
  [OrderType.WARRANTY]: {
    required: true,
    hintKey: 'supplemental.questions.photos.evidenceHint',
  },
};

/** Photo slots of the request (never the initial case's). */
export function PhotosStep({ errors, context }: StepProps) {
  const { t } = useT();
  const rule = PHOTO_RULE[context.kind];
  const missing =
    context.kind === OrderType.ADDITIONAL_ALIGNERS ? missingIntraoralPhotos(context.files) : [];

  return (
    <ClinicalQuestion
      fields={['photos']}
      errors={errors}
      required={rule.required}
      legend={t('supplemental.questions.photos.legend')}
      hint={t(rule.hintKey)}
    >
      {missing.length > 0 && (
        <NoticeBox tone="warning" title={t('supplemental.questions.photos.missing')}>
          {missing.map((titleKey) => t(titleKey)).join(' · ')}
        </NoticeBox>
      )}
      <ClinicalOrderFiles orderId={context.view.order.id} section="patient-images" />
    </ClinicalQuestion>
  );
}
