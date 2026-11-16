'use client';

import { ClipboardList, Layers, Magnet, MoveHorizontal, ScanLine, Scissors } from 'lucide-react';
import { ReviewInfo, ReviewSection } from '@/components/orders/wizard';
import {
  SupplementalContactPurpose,
  SupplementalToothPurpose,
} from '@/lib/types';
import { asksElasticCutouts, isSingleArch, type SupplementalDraft } from '../supplemental-draft';
import { useSummaryText } from './use-summary-text';

const GRID = 'grid gap-4 sm:grid-cols-2';

/** Every answer of an additional-aligners request, grouped like the wizard. */
export function AdditionalSummary({ answers: a }: { answers: SupplementalDraft }) {
  const s = useSummaryText(a);
  const q = (key: string) => s.t(`supplemental.summary.labels.${key}`);

  return (
    <div className="space-y-4">
      <ReviewSection icon={ClipboardList} title={s.t('supplemental.steps.situation.title')}>
        <div className={GRID}>
          <ReviewInfo label={q('reason')} value={s.withDetails(s.option('reason', a.reason), a.reasonDetails)} wide />
          <ReviewInfo label={q('currentUpper')} value={s.number(a.currentUpperAligner)} />
          <ReviewInfo label={q('currentLower')} value={s.number(a.currentLowerAligner)} />
        </div>
      </ReviewSection>

      <ReviewSection icon={Layers} title={s.t('supplemental.steps.arches.title')}>
        <div className={GRID}>
          <ReviewInfo label={q('arch')} value={s.option('archTreatment', a.archTreatment)} />
          {isSingleArch(a.archTreatment) && (
            <ReviewInfo
              label={q('oppositeArch')}
              value={s.option(
                'oppositeArch',
                a.passiveOppositeArch === null ? null : a.passiveOppositeArch ? 'passive' : 'nothing',
              )}
            />
          )}
          <ReviewInfo label={q('newUpperScan')} value={s.yesNo(a.newUpperScan)} />
          <ReviewInfo label={q('newLowerScan')} value={s.yesNo(a.newLowerScan)} />
          <ReviewInfo label={q('clinicalObjective')} value={s.option('clinicalObjective', a.clinicalObjective)} wide />
        </div>
      </ReviewSection>

      <ReviewSection icon={MoveHorizontal} title={s.t('supplemental.steps.movement.title')}>
        <div className={GRID}>
          <ReviewInfo
            label={q('movementRestriction')}
            value={s.withTeeth(s.option('movementRestriction', a.movementRestriction), SupplementalToothPurpose.DO_NOT_MOVE)}
            wide
          />
          <ReviewInfo label={q('apRight')} value={s.option('apCorrection', a.apRelationshipRight)} />
          <ReviewInfo label={q('apLeft')} value={s.option('apCorrection', a.apRelationshipLeft)} />
          <ReviewInfo
            label={q('apOptions')}
            value={a.apOptions.map((option) => s.option('apOption', option)).join(', ') || s.t('supplemental.summary.none')}
            wide
          />
          {asksElasticCutouts(a.apOptions) && (
            <ReviewInfo label={q('elasticCutouts')} value={s.yesNo(a.elasticCutouts)} />
          )}
        </div>
      </ReviewSection>

      <ReviewSection icon={Magnet} title={s.t('supplemental.steps.attachments.title')}>
        <div className={GRID}>
          <ReviewInfo
            label={q('attachmentPolicy')}
            value={s.withTeeth(s.option('attachmentPlan', a.attachmentPolicy), SupplementalToothPurpose.NO_ATTACHMENT)}
          />
          <ReviewInfo
            label={q('existingAttachmentPolicy')}
            value={s.withTeeth(
              s.option('existingAttachments', a.existingAttachmentPolicy),
              SupplementalToothPurpose.REMOVE_ATTACHMENT,
            )}
          />
          <ReviewInfo
            label={q('iprPolicy')}
            value={s.withTeeth(s.option('iprPlan', a.iprPolicy), SupplementalToothPurpose.NO_IPR)}
          />
          <ReviewInfo
            label={q('previousIpr')}
            value={s.withContacts(s.option('previousIpr', a.previousIpr), SupplementalContactPurpose.PERFORMED_IPR)}
          />
        </div>
      </ReviewSection>

      <ReviewSection icon={Scissors} title={s.t('supplemental.steps.finishing.title')}>
        <div className={GRID}>
          <ReviewInfo
            label={q('precisionCutPolicy')}
            value={s.withTeeth(s.option('cutoutPlan', a.precisionCutPolicy), SupplementalToothPurpose.CUTOUT)}
          />
          <ReviewInfo
            label={q('residualSpacePolicy')}
            value={s.withContacts(
              s.option('residualSpaces', a.residualSpacePolicy),
              SupplementalContactPurpose.RESIDUAL_SPACE,
            )}
          />
          <ReviewInfo label={q('upperInstructions')} value={a.upperInstructions} />
          <ReviewInfo label={q('lowerInstructions')} value={a.lowerInstructions} />
        </div>
      </ReviewSection>

      <ReviewSection icon={ScanLine} title={s.t('supplemental.steps.scans.title')}>
        <div className={GRID}>
          <ReviewInfo label={q('impressionMethod')} value={s.option('impressionMethod', a.impressionMethod)} wide />
        </div>
      </ReviewSection>
    </div>
  );
}
