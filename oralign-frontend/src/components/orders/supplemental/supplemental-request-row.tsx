'use client';

import Link from 'next/link';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/lang-context';
import { buildSupplementalWizardHref } from '@/lib/orders/order-navigation';
import { SupplementalReviewStatus, type SupplementalKind, type SupplementalOrderView } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatBusinessDay } from '@/lib/utils/business-day';
import { isCoverageEstimate, KIND_ICON } from './supplemental-constants';
import { CoverageBadge, ReviewStatusBadge } from './status-badges';

const ACTION_CLASS = 'h-11 gap-2 sm:h-9';

/** One linked request in the initial case's panel. */
export function SupplementalRequestRow({
  view,
  kind,
  onDelete,
}: {
  view: SupplementalOrderView;
  kind: SupplementalKind;
  onDelete: (view: SupplementalOrderView) => void;
}) {
  const { t, lang } = useT();
  const Icon = KIND_ICON[kind];
  const isDraft = view.request.reviewStatus === SupplementalReviewStatus.DRAFT;
  const submittedAt = view.request.submittedAt;
  const dateLine = submittedAt
    ? t('supplemental.panel.submittedOn', { date: formatBusinessDay(submittedAt, lang) })
    : t('supplemental.panel.createdOn', { date: formatBusinessDay(view.order.createdAt, lang) });

  return (
    <article className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{t(`supplemental.type.${kind}`)}</h3>
            <ReviewStatusBadge status={view.request.reviewStatus} />
            <OrderStatusBadge status={view.order.status} />
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{view.order.orderCode}</span>
            <span aria-hidden>·</span>
            <span>{dateLine}</span>
            <span aria-hidden>·</span>
            <CoverageBadge
              status={view.request.coverageStatus}
              estimate={isCoverageEstimate(view.request.reviewStatus)}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {isDraft && view.permissions.canEdit ? (
          <Button asChild variant="outline" className={ACTION_CLASS}>
            <Link
              href={buildSupplementalWizardHref({
                parentOrderId: view.parentOrder.id,
                type: kind,
                requestId: view.order.id,
              })}
            >
              <Pencil className="h-4 w-4" aria-hidden />
              {t('supplemental.actions.resume')}
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline" className={ACTION_CLASS}>
            <Link href={`/dashboard/orders/${view.order.id}`}>
              <Eye className="h-4 w-4" aria-hidden />
              {t('supplemental.actions.open')}
            </Link>
          </Button>
        )}
        {view.permissions.canDelete && (
          <Button
            type="button"
            variant="outline"
            className={cn(ACTION_CLASS, 'text-destructive hover:text-destructive')}
            onClick={() => onDelete(view)}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {t('supplemental.actions.delete')}
          </Button>
        )}
      </div>
    </article>
  );
}
