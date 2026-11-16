'use client';

import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n/lang-context';
import { SupplementalCoverageStatus, SupplementalReviewStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const COVERAGE_TONE: Record<SupplementalCoverageStatus, string> = {
  [SupplementalCoverageStatus.REVIEW_REQUIRED]: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300',
  [SupplementalCoverageStatus.INCLUDED]: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300',
  [SupplementalCoverageStatus.CHARGEABLE]: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300',
  [SupplementalCoverageStatus.WARRANTY_APPROVED]: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300',
  [SupplementalCoverageStatus.WARRANTY_REJECTED]: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300',
};

const REVIEW_TONE: Record<SupplementalReviewStatus, string> = {
  [SupplementalReviewStatus.DRAFT]: 'border-border bg-muted text-foreground',
  [SupplementalReviewStatus.PENDING]: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300',
  [SupplementalReviewStatus.APPROVED]: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300',
  [SupplementalReviewStatus.REJECTED]: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300',
};

/**
 * Coverage of a request. `estimate` marks a value computed for a draft:
 * the administration confirms it only when it reviews the request.
 */
export function CoverageBadge({
  status,
  estimate = false,
}: {
  status: SupplementalCoverageStatus;
  estimate?: boolean;
}) {
  const { t } = useT();
  const label = t(`supplemental.coverage.${status}`);
  return (
    <Badge variant="outline" className={cn('border text-[11px]', COVERAGE_TONE[status])}>
      {estimate ? t('supplemental.coverage.estimate', { coverage: label }) : label}
    </Badge>
  );
}

export function ReviewStatusBadge({ status }: { status: SupplementalReviewStatus }) {
  const { t } = useT();
  return (
    <Badge variant="outline" className={cn('border text-[11px]', REVIEW_TONE[status])}>
      {t(`supplemental.status.${status}`)}
    </Badge>
  );
}
