'use client';

import { CirclePlus, ShieldCheck, Stamp } from 'lucide-react';
import { ReviewInfo, ReviewSection } from '@/components/orders/wizard';
import { OrderType, SupplementalToothPurpose, type SupplementalKind } from '@/lib/types';
import { AdditionalSummary } from './summary/additional-summary';
import { useSummaryText } from './summary/use-summary-text';
import type { SupplementalDraft } from './supplemental-draft';

const GRID = 'grid gap-4 sm:grid-cols-2';

type SummaryProps = {
  /** Normalised answers (see `normaliseDraft`). */
  answers: SupplementalDraft;
  /** Version of the approved plan a transfer tray is built from. */
  sourcePlanVersion: number | null;
};

function ReplacementSummary({ answers: a }: SummaryProps) {
  const s = useSummaryText(a);
  const q = (key: string) => s.t(`supplemental.summary.labels.${key}`);
  const range =
    a.replacementFromAligner === null || a.replacementToAligner === null
      ? null
      : s.t('supplemental.summary.alignerRange', {
          from: a.replacementFromAligner,
          to: a.replacementToAligner,
        });
  return (
    <ReviewSection icon={CirclePlus} title={s.t('supplemental.type.replacement')}>
      <div className={GRID}>
        <ReviewInfo label={q('arch')} value={s.option('archTreatment', a.archTreatment)} />
        <ReviewInfo label={q('alignerRange')} value={range} />
        <ReviewInfo label={q('quantity')} value={a.quantity === null ? null : String(a.quantity)} />
        <ReviewInfo label={q('urgency')} value={s.option('urgency', a.urgency)} />
        <ReviewInfo
          label={q('replacementReason')}
          value={s.withDetails(s.option('replacementReason', a.replacementReason), a.reasonDetails)}
          wide
        />
      </div>
    </ReviewSection>
  );
}

function TransferSummary({ answers: a, sourcePlanVersion }: SummaryProps) {
  const s = useSummaryText(a);
  const q = (key: string) => s.t(`supplemental.summary.labels.${key}`);
  return (
    <ReviewSection icon={Stamp} title={s.t('supplemental.type.transfer_template')}>
      <div className={GRID}>
        <ReviewInfo label={q('arch')} value={s.option('archTreatment', a.archTreatment)} />
        <ReviewInfo
          label={q('sourcePlan')}
          value={
            sourcePlanVersion === null
              ? null
              : s.t('supplemental.summary.planVersion', { version: sourcePlanVersion })
          }
        />
        <ReviewInfo label={q('transferPurpose')} value={s.option('transferPurpose', a.transferPurpose)} />
        <ReviewInfo label={q('quantity')} value={a.quantity === null ? null : String(a.quantity)} />
        <ReviewInfo
          label={q('transferTeeth')}
          value={s.withTeeth(s.t('supplemental.summary.teeth'), SupplementalToothPurpose.TRANSFER_TRAY)}
          wide
        />
        <ReviewInfo label={q('transferNotes')} value={a.transferNotes} wide />
      </div>
    </ReviewSection>
  );
}

function WarrantySummary({ answers: a }: SummaryProps) {
  const s = useSummaryText(a);
  const q = (key: string) => s.t(`supplemental.summary.labels.${key}`);
  return (
    <ReviewSection icon={ShieldCheck} title={s.t('supplemental.type.warranty')}>
      <div className={GRID}>
        <ReviewInfo label={q('arch')} value={s.option('archTreatment', a.archTreatment)} />
        <ReviewInfo label={q('defectiveAligner')} value={s.numbers(a.defectiveAligners)} />
        <ReviewInfo label={q('defect')} value={s.option('defect', a.warrantyDefectCategory)} />
        <ReviewInfo label={q('discoveredAt')} value={s.day(a.warrantyDiscoveredAt)} />
        <ReviewInfo label={q('lotReference')} value={a.warrantyLotReference} />
        <ReviewInfo label={q('comments')} value={a.warrantyComments} wide />
      </div>
    </ReviewSection>
  );
}

/**
 * The complete read-only prescription of a request — every answer, with
 * teeth ("13, 23") and contacts ("11–21 : 0,2 mm"). Shared by the
 * wizard's last step and the request card on the order page.
 */
export function SupplementalSummary({
  kind,
  ...props
}: SummaryProps & { kind: SupplementalKind }) {
  switch (kind) {
    case OrderType.ADDITIONAL_ALIGNERS:
      return <AdditionalSummary answers={props.answers} />;
    case OrderType.REPLACEMENT:
      return <ReplacementSummary {...props} />;
    case OrderType.TRANSFER_TEMPLATE:
      return <TransferSummary {...props} />;
    case OrderType.WARRANTY:
      return <WarrantySummary {...props} />;
  }
}
