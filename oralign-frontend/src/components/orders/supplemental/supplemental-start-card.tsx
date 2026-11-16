'use client';

import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/lang-context';
import type { SupplementalEligibility, SupplementalKind } from '@/lib/types';
import { KIND_ICON } from './supplemental-constants';
import { useCreateSupplementalDraft } from './use-create-supplemental-draft';
import { WizardStateCard } from './wizard-state-card';

/**
 * Opening the wizard without a request never creates one: the doctor
 * starts the draft explicitly here.
 */
export function SupplementalStartCard({
  parentOrderId,
  kind,
  eligibility,
}: {
  parentOrderId: string;
  kind: SupplementalKind;
  eligibility: SupplementalEligibility;
}) {
  const { t } = useT();
  const { start, pendingKind } = useCreateSupplementalDraft();
  const state = eligibility.requests[kind];
  const canStart = eligibility.canCreate && state.allowed;
  const blockedMessage = !eligibility.canCreate
    ? t('supplemental.blockedReason.not_allowed')
    : state.blockedReason
      ? t(`supplemental.blockedReason.${state.blockedReason}`)
      : null;

  return (
    <WizardStateCard
      icon={KIND_ICON[kind]}
      title={t(`supplemental.type.${kind}`)}
      backHref={`/dashboard/orders/${parentOrderId}`}
      description={
        <>
          <p>{t(`supplemental.typeDescription.${kind}`)}</p>
          <p className="mt-2">{canStart ? t('supplemental.wizard.startHint') : blockedMessage}</p>
        </>
      }
    >
      {canStart && (
        <Button
          type="button"
          className="h-11"
          disabled={pendingKind !== null}
          onClick={() => start(parentOrderId, kind, 'replace')}
        >
          {pendingKind === kind ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ArrowRight className="mr-2 h-4 w-4" aria-hidden />
          )}
          {t('supplemental.actions.start')}
        </Button>
      )}
    </WizardStateCard>
  );
}
