'use client';

import { ClinicalOrderFiles } from '@/components/orders/order-file-upload';
import { FieldError } from '@/components/orders/wizard';
import { useT } from '@/lib/i18n/lang-context';
import { SupplementalImpressionMethod } from '@/lib/types';
import { ClinicalQuestion, questionErrorId } from '../../clinical-question';
import { NoticeBox } from '../../notice-box';
import { OptionGroup } from '../../option-group';
import { countScanFiles, expectedScanFiles } from '../../supplemental-validation';
import type { StepProps } from '../step-props';

const METHODS = Object.values(SupplementalImpressionMethod);

/** How the new records reach the lab: scan files here, or impressions by post. */
export function ScansStep({ draft, set, errors, context }: StepProps) {
  const { t } = useT();
  const legend = t('supplemental.questions.impressionMethod.legend');
  const expected = expectedScanFiles(draft);
  const uploaded = countScanFiles(context.files);

  return (
    <div className="space-y-6">
      <ClinicalQuestion
        fields={['impressionMethod', 'scanFiles']}
        inline={['scanFiles']}
        errors={errors}
        required
        legend={legend}
      >
        <OptionGroup
          group="impressionMethod"
          layout="cards"
          withHints
          options={METHODS}
          value={draft.impressionMethod}
          onChange={(method) => set('impressionMethod', method)}
          ariaLabel={legend}
          describedBy={questionErrorId('impressionMethod')}
          invalid={!!errors.impressionMethod}
        />

        {draft.impressionMethod === SupplementalImpressionMethod.INTRAORAL_SCAN && (
          <div className="space-y-4">
            <NoticeBox tone="warning">{t('supplemental.notices.recentScan')}</NoticeBox>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t('supplemental.questions.impressionMethod.scanCount', { uploaded, expected })}
            </p>
            <ClinicalOrderFiles orderId={context.view.order.id} section="radiography-stl" />
            <FieldError message={errors.scanFiles ? t(errors.scanFiles) : undefined} />
          </div>
        )}

        {draft.impressionMethod === SupplementalImpressionMethod.PHYSICAL_IMPRESSION && (
          <NoticeBox title={t('supplemental.notices.shipping.title')}>
            {t('supplemental.notices.shipping.body', {
              code: context.view.order.orderCode,
              patient: context.view.order.patient?.fullName ?? '—',
            })}
          </NoticeBox>
        )}
      </ClinicalQuestion>
    </div>
  );
}
