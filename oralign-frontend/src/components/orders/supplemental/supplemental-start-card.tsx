'use client';

import { ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useCanOrder } from '@/lib/hooks/use-can-order';
import { useT } from '@/lib/i18n/lang-context';
import type { SupplementalEligibility, SupplementalKind } from '@/lib/types';
import { KIND_ICON } from './supplemental-constants';
import { useCreateSupplementalDraft } from './use-create-supplemental-draft';
import { WizardStateCard } from './wizard-state-card';

/**
 * Opening the wizard without a request never creates one: the doctor
 * starts the draft explicitly here. A dormant doctor (doctor inactivity,
 * spec §5) gets the reason instead of the button: the server would
 * answer 403 ACCOUNT_DORMANT. Admins act on the server's answer.
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
  const { canOrder } = useCanOrder();
  const state = eligibility.requests[kind];
  const canStart = canOrder && eligibility.canCreate && state.allowed;
  const blockedMessage = !canOrder
    ? t('accountActivity.supplemental.blocked')
    : !eligibility.canCreate
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
      {!canOrder && (
        <Button asChild variant="outline" className="h-11">
          <Link href="/dashboard/support">{t('accountActivity.banner.contact')}</Link>
        </Button>
      )}
    </WizardStateCard>
  );
}
