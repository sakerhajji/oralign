'use client';

import { TextAreaField } from '@/components/orders/wizard';
import { useT } from '@/lib/i18n/lang-context';
import { SupplementalRequestReason } from '@/lib/types';
import { ClinicalQuestion, fieldDomId, questionErrorId } from '../../clinical-question';
import { NoticeBox } from '../../notice-box';
import { OptionGroup } from '../../option-group';
import { ALIGNER_NUMBER_MAX, TEXT_LIMITS } from '../../supplemental-constants';
import { treatsLower, treatsUpper } from '../../supplemental-draft';
import { formatDay } from '../../supplemental-format';
import type { StepProps } from '../step-props';
import { WholeNumberField } from '../whole-number-field';

const REASONS = Object.values(SupplementalRequestReason);
const INSTRUCTION_KEYS = ['keepAligner', 'removeAttachments', 'sendRecords'] as const;
const CURRENT_ALIGNERS = [
  { field: 'currentUpperAligner', arch: 'upper', treats: treatsUpper },
  { field: 'currentLowerAligner', arch: 'lower', treats: treatsLower },
] as const;

/** Instructions box, Q1 (reason) and Q2 (aligner currently worn). */
export function SituationStep({ draft, set, errors, context }: StepProps) {
  const { t, lang } = useT();
  const plan = context.eligibility.approvedPlan;
  const planDate = formatDay(plan?.approvedAt, lang);
  const limits = context.eligibility.alignerLimits;
  const totals = { upper: limits.upper, lower: limits.lower };
  // Both arches are always asked, like the reference form; only a treated
  // arch (Q3, next step, defaults to the case's) requires its number.
  const label = (arch: 'upper' | 'lower', treated: boolean) =>
    [
      t(`supplemental.questions.currentAligner.${arch}`),
      totals[arch] ? t('supplemental.questions.currentAligner.available', { max: totals[arch] }) : '',
      treated ? '' : t('supplemental.questions.currentAligner.untreated'),
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <div className="space-y-6">
      <NoticeBox title={t('supplemental.notices.instructions.title')}>
        <ol className="list-decimal space-y-1 pl-5">
          {INSTRUCTION_KEYS.map((key) => (
            <li key={key}>{t(`supplemental.notices.instructions.${key}`)}</li>
          ))}
        </ol>
      </NoticeBox>

      <ClinicalQuestion
        fields={['reason', 'reasonDetails']}
        inline={['reasonDetails']}
        errors={errors}
        number={1}
        required
        legend={t('supplemental.questions.reason.legend')}
      >
        <OptionGroup
          group="reason"
          layout="stack"
          options={REASONS}
          value={draft.reason}
          onChange={(reason) => set('reason', reason)}
          ariaLabel={t('supplemental.questions.reason.legend')}
          describedBy={questionErrorId('reason')}
          invalid={!!errors.reason}
        />
        {draft.reason === SupplementalRequestReason.OTHER && (
          <TextAreaField
            id={fieldDomId('reasonDetails')}
            compact
            label={t('supplemental.questions.reason.details')}
            value={draft.reasonDetails}
            onChange={(value) => set('reasonDetails', value)}
            maxLength={TEXT_LIMITS.reasonDetails}
            error={errors.reasonDetails ? t(errors.reasonDetails) : undefined}
          />
        )}
      </ClinicalQuestion>

      <ClinicalQuestion
        fields={['currentUpperAligner', 'currentLowerAligner']}
        inline={['currentUpperAligner', 'currentLowerAligner']}
        errors={errors}
        number={2}
        required
        legend={t('supplemental.questions.currentAligner.legend')}
        hint={
          plan
            ? t('supplemental.questions.currentAligner.planReference', {
                version: plan.version,
                date: planDate ?? '—',
              })
            : limits.source === 'pack' && limits.upper
              ? t('supplemental.questions.currentAligner.packReference', { max: limits.upper })
              : undefined
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {CURRENT_ALIGNERS.map(({ field, arch, treats }) => (
            <WholeNumberField
              key={field}
              id={fieldDomId(field)}
              label={label(arch, treats(draft.archTreatment))}
              value={draft[field]}
              onChange={(value) => set(field, value)}
              min={1}
              max={totals[arch] ?? ALIGNER_NUMBER_MAX}
              error={errors[field]}
            />
          ))}
        </div>
        {context.eligibility.deliveredUpTo !== null && (
          <p className="text-xs text-muted-foreground">
            {t('supplemental.questions.currentAligner.delivered', {
              max: context.eligibility.deliveredUpTo,
            })}
          </p>
        )}
      </ClinicalQuestion>
    </div>
  );
}
