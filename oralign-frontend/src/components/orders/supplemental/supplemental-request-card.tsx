'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, CircleAlert, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  supplementalErrorMessage,
  useSupplementalOrder,
} from '@/lib/hooks/use-supplemental-orders';
import { useT } from '@/lib/i18n/lang-context';
import {
  SupplementalReviewStatus,
  type SupplementalReviewDecision,
} from '@/lib/types';
import { formatBusinessDay } from '@/lib/utils/business-day';
import { ConvertWarrantyDialog } from './convert-warranty-dialog';
import { CoverageExplanation } from './coverage-explanation';
import { ReviewDecisionDialog } from './review-decision-dialog';
import { ReviewStatusBadge } from './status-badges';
import { isCoverageEstimate, isSupplementalKind, KIND_ICON } from './supplemental-constants';
import { draftFromView, normaliseDraft } from './supplemental-draft';
import { SupplementalSummary } from './supplemental-summary';

/**
 * The request on its own order page: kind, link to the initial case,
 * statuses, coverage and the doctor's complete prescription. Review and
 * conversion actions appear only when the server grants them.
 */
export function SupplementalRequestCard({ requestId }: { requestId: string }) {
  const { t, lang } = useT();
  const query = useSupplementalOrder(requestId);
  const [decision, setDecision] = useState<SupplementalReviewDecision | null>(null);

  if (query.isPending) return <Skeleton className="h-40 w-full rounded-xl" />;
  const view = query.data;
  if (!view) {
    // The summary and the review / conversion actions live here: say so
    // when they could not load, and offer to try again.
    return (
      <Card className="rounded-xl border-red-200 dark:border-red-900/50">
        <CardContent className="flex flex-col items-start gap-3 p-4 sm:p-5">
          <p className="flex items-start gap-2 text-sm font-medium">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
            {t('supplemental.card.loadError')}
          </p>
          <p className="text-sm text-muted-foreground">{supplementalErrorMessage(query.error, t)}</p>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
            {t('supplemental.actions.retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }
  const kind = view.order.orderType;
  if (!isSupplementalKind(kind)) return null;

  const { request, permissions } = view;
  const Icon = KIND_ICON[kind];
  const decided = request.reviewedAt
    ? t('supplemental.card.reviewedOn', {
        date: formatBusinessDay(request.reviewedAt, lang),
        name: request.reviewedByName ?? '—',
      })
    : null;

  return (
    <Card className="overflow-hidden rounded-xl border-primary/20">
      <CardHeader className="border-b bg-primary/[0.035] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-background ring-1 ring-border">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-base">{t(`supplemental.type.${kind}`)}</CardTitle>
              <Link
                href={`/dashboard/orders/${view.parentOrder.id}`}
                className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:min-h-0"
              >
                {t('supplemental.parentCase')} · <span className="font-mono">{view.parentOrder.orderCode}</span>
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <ReviewStatusBadge status={request.reviewStatus} />
            {request.submittedAt && (
              <span className="text-xs text-muted-foreground">
                {t('supplemental.panel.submittedOn', { date: formatBusinessDay(request.submittedAt, lang) })}
              </span>
            )}
            {decided && <span className="text-xs text-muted-foreground">{decided}</span>}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-5">
        {request.reviewReason && (
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="min-w-0 break-words [overflow-wrap:anywhere]">
              <span className="font-semibold">{t('supplemental.card.decisionReason')}</span>{' '}
              {request.reviewReason}
            </p>
          </div>
        )}

        <CoverageExplanation
          status={request.coverageStatus}
          reason={request.coverageReason}
          estimate={isCoverageEstimate(request.reviewStatus)}
          correctionNumber={request.correctionNumber}
        />

        {request.convertedReplacementOrderId && (
          <Button asChild variant="outline" className="h-11 gap-2">
            <Link href={`/dashboard/orders/${request.convertedReplacementOrderId}`}>
              <ArrowUpRight className="h-4 w-4" aria-hidden />
              {t('supplemental.actions.openReplacement')}
            </Link>
          </Button>
        )}

        {(permissions.canReview || permissions.canConvert) && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {permissions.canReview && (
              <>
                <Button type="button" className="h-11 gap-2" onClick={() => setDecision(SupplementalReviewStatus.APPROVED)}>
                  <Check className="h-4 w-4" aria-hidden />
                  {t('supplemental.actions.approve')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 gap-2 text-destructive hover:text-destructive"
                  onClick={() => setDecision(SupplementalReviewStatus.REJECTED)}
                >
                  <X className="h-4 w-4" aria-hidden />
                  {t('supplemental.actions.reject')}
                </Button>
              </>
            )}
            {permissions.canConvert && <ConvertWarrantyDialog view={view} />}
          </div>
        )}

        <SupplementalSummary
          kind={kind}
          answers={normaliseDraft(draftFromView(view), kind)}
          sourcePlanVersion={request.sourceTreatmentPlanVersion}
        />
      </CardContent>

      {permissions.canReview && (
        <ReviewDecisionDialog view={view} kind={kind} decision={decision} onClose={() => setDecision(null)} />
      )}
    </Card>
  );
}
