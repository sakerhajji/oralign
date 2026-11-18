'use client';

import { useT } from '@/lib/i18n/lang-context';
import { OrderType } from '@/lib/types';
import { ClinicalQuestion } from '../clinical-question';
import { NoticeBox } from '../notice-box';
import { RequestPhotos, requestPhotoSections } from '../request-photos';
import { missingIntraoralPhotos } from '../supplemental-validation';
import type { StepProps } from './step-props';

/** Required photos of the request (never the initial case's). */
export function PhotosStep({ draft, errors, context }: StepProps) {
  const { t } = useT();
  const isWarranty = context.kind === OrderType.WARRANTY;
  const missing = isWarranty ? [] : missingIntraoralPhotos(context.files);

  return (
    <ClinicalQuestion
      fields={['photos']}
      errors={errors}
      required
      legend={t('supplemental.questions.photos.legend')}
      hint={t(`supplemental.questions.photos.${isWarranty ? 'evidenceHint' : 'intraoralHint'}`)}
    >
      {missing.length > 0 && (
        <NoticeBox tone="warning" title={t('supplemental.questions.photos.missing')}>
          {missing.map((titleKey) => t(titleKey)).join(' · ')}
        </NoticeBox>
      )}
      <RequestPhotos
        orderId={context.view.order.id}
        sections={requestPhotoSections(context.kind, context.files)}
        alignerNumbers={draft.defectiveAligners}
      />
    </ClinicalQuestion>
  );
}
