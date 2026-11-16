'use client';

import { Camera, Receipt, ScanLine } from 'lucide-react';
import { ClinicalOrderFiles } from '@/components/orders/order-file-upload';
import { ReviewSection } from '@/components/orders/wizard';
import { useT } from '@/lib/i18n/lang-context';
import { OrderType, SupplementalImpressionMethod } from '@/lib/types';
import { CoverageExplanation } from '../coverage-explanation';
import { SupplementalSummary } from '../supplemental-summary';
import { normaliseDraft } from '../supplemental-draft';
import type { StepProps } from './step-props';

/**
 * Everything the lab will receive, read-only, with the estimated coverage
 * (a request may be billed), before the doctor sends it.
 */
export function ReviewStep({ draft, context }: StepProps) {
  const { t } = useT();
  const answers = normaliseDraft(draft, context.kind);
  const orderId = context.view.order.id;
  const coverage = context.eligibility.requests[context.kind];
  const showScans =
    context.kind === OrderType.ADDITIONAL_ALIGNERS &&
    answers.impressionMethod === SupplementalImpressionMethod.INTRAORAL_SCAN;

  return (
    <div className="space-y-4">
      <ReviewSection icon={Receipt} title={t('supplemental.review.coverageLegend')}>
        <CoverageExplanation
          status={coverage.coverageStatus}
          reason={coverage.coverageReason}
          estimate
          includedRemaining={coverage.includedRemaining}
        />
      </ReviewSection>
      <SupplementalSummary
        kind={context.kind}
        answers={answers}
        sourcePlanVersion={context.view.request.sourceTreatmentPlanVersion}
      />
      {context.kind !== OrderType.TRANSFER_TEMPLATE && (
        <ReviewSection icon={Camera} title={t('supplemental.steps.photos.title')}>
          <ClinicalOrderFiles orderId={orderId} readOnly section="patient-images" />
        </ReviewSection>
      )}
      {showScans && (
        <ReviewSection icon={ScanLine} title={t('supplemental.summary.scanFiles')}>
          <ClinicalOrderFiles orderId={orderId} readOnly section="radiography-stl" />
        </ReviewSection>
      )}
    </div>
  );
}
