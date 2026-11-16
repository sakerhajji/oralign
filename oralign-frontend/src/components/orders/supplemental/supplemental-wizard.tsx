'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CircleAlert, FileCheck2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supplementalErrorMessage } from '@/lib/hooks/use-supplemental-orders';
import { useT } from '@/lib/i18n/lang-context';
import { SupplementalReviewStatus } from '@/lib/types';
import { NoticeBox } from './notice-box';
import { isSupplementalKind } from './supplemental-constants';
import { SupplementalStartCard } from './supplemental-start-card';
import { SupplementalWizardForm } from './supplemental-wizard-form';
import { useWizardData } from './use-wizard-data';
import { WizardSkeleton, WizardStateCard } from './wizard-state-card';

function RetryButton({ onRetry, variant }: { onRetry: () => void; variant?: 'outline' }) {
  const { t } = useT();
  return (
    <Button type="button" variant={variant} className="h-11" onClick={onRetry}>
      <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
      {t('supplemental.actions.retry')}
    </Button>
  );
}

/**
 * Entry of `/dashboard/orders/[id]/supplemental/new`. Resolves which draft
 * to edit (the explicit `requestId`, else the kind's active draft) and
 * shows the start card, the form or a read-only notice. Nothing is ever
 * created by opening the page.
 */
export function SupplementalWizard({
  parentOrderId,
  requestedType,
  requestId,
}: {
  parentOrderId: string;
  requestedType: string | null;
  requestId: string | null;
}) {
  const { t } = useT();
  const kind = isSupplementalKind(requestedType) ? requestedType : null;
  const data = useWizardData(parentOrderId, kind, requestId);
  const parentHref = `/dashboard/orders/${parentOrderId}`;

  if (!kind) {
    return (
      <WizardStateCard icon={CircleAlert} title={t('supplemental.wizard.invalidType')} backHref={parentHref} />
    );
  }
  if (data.state === 'loading') return <WizardSkeleton />;
  if (data.state === 'error') {
    return (
      <WizardStateCard
        icon={CircleAlert}
        title={t('supplemental.wizard.loadError')}
        description={supplementalErrorMessage(data.error, t)}
        backHref={parentHref}
      >
        <RetryButton onRetry={data.retry} />
      </WizardStateCard>
    );
  }

  const { view, eligibility } = data;
  let screen: ReactNode;
  if (!view) {
    screen = <SupplementalStartCard parentOrderId={parentOrderId} kind={kind} eligibility={eligibility} />;
  } else if (view.parentOrder.id !== parentOrderId || view.order.orderType !== kind) {
    screen = (
      <WizardStateCard icon={CircleAlert} title={t('supplemental.wizard.invalidRequest')} backHref={parentHref} />
    );
  } else if (view.request.reviewStatus !== SupplementalReviewStatus.DRAFT || !view.permissions.canEdit) {
    screen = (
      <WizardStateCard
        icon={FileCheck2}
        title={t('supplemental.wizard.readOnlyTitle')}
        description={t('supplemental.wizard.readOnlyBody', {
          status: t(`supplemental.status.${view.request.reviewStatus}`),
        })}
        backHref={parentHref}
      >
        <Button asChild className="h-11">
          <Link href={`/dashboard/orders/${view.order.id}`}>{t('supplemental.actions.open')}</Link>
        </Button>
      </WizardStateCard>
    );
  } else {
    screen = <SupplementalWizardForm key={view.order.id} view={view} kind={kind} eligibility={eligibility} />;
  }

  // A failed background refresh never replaces the open screen (the form
  // holds answers not saved yet): it is reported above it. The screen
  // keeps its place in the tree, so the notice never remounts it.
  return (
    <>
      {data.refreshError ? (
        <div className="mx-auto mb-4 w-full max-w-[1220px]">
          <NoticeBox tone="warning" title={t('supplemental.wizard.refreshError')}>
            <div className="flex flex-col items-start gap-3">
              <p>
                {t('supplemental.wizard.refreshErrorBody', {
                  reason: supplementalErrorMessage(data.refreshError, t),
                })}
              </p>
              <RetryButton onRetry={data.retry} variant="outline" />
            </div>
          </NoticeBox>
        </div>
      ) : null}
      {screen}
    </>
  );
}
