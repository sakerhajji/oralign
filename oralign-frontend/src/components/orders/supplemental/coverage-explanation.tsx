'use client';

import { useT } from '@/lib/i18n/lang-context';
import type { SupplementalCoverageStatus, SupplementalKindEligibility } from '@/lib/types';
import { CoverageBadge } from './status-badges';

/** Translation of a coverage reason, or null for a reason the UI does not know. */
function useCoverageReason(reason: string | null): string | null {
  const { t } = useT();
  if (!reason) return null;
  const key = `supplemental.coverageReason.${reason}`;
  const text = t(key);
  return text === key ? null : text;
}

/**
 * Coverage badge plus the sentence that explains it, with the pack
 * allowance (remaining included corrections, correction number).
 */
export function CoverageExplanation({
  status,
  reason,
  estimate = false,
  correctionNumber = null,
  includedRemaining = null,
}: {
  status: SupplementalCoverageStatus;
  reason: string | null;
  estimate?: boolean;
  correctionNumber?: number | null;
  includedRemaining?: SupplementalKindEligibility['includedRemaining'];
}) {
  const { t } = useT();
  const explanation = useCoverageReason(reason);
  const allowance =
    includedRemaining === 'unlimited'
      ? t('supplemental.coverage.unlimited')
      : includedRemaining !== null
        ? t('supplemental.coverage.remaining', { count: includedRemaining })
        : null;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <CoverageBadge status={status} estimate={estimate} />
        {correctionNumber !== null && (
          <span className="text-xs font-medium text-muted-foreground">
            {t('supplemental.coverage.correctionNumber', { number: correctionNumber })}
          </span>
        )}
      </div>
      {explanation && <p className="text-sm text-muted-foreground">{explanation}</p>}
      {allowance && <p className="text-xs text-muted-foreground">{allowance}</p>}
      {estimate && <p className="text-xs text-muted-foreground">{t('supplemental.coverage.estimateHint')}</p>}
    </div>
  );
}
