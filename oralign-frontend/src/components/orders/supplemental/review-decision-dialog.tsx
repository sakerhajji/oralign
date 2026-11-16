'use client';

import { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { TextAreaField } from '@/components/orders/wizard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useReviewSupplementalOrder,
  useSupplementalEligibility,
} from '@/lib/hooks/use-supplemental-orders';
import { useT } from '@/lib/i18n/lang-context';
import {
  SupplementalReviewStatus,
  type SupplementalCoverageStatus,
  type SupplementalKind,
  type SupplementalOrderView,
  type SupplementalReviewDecision,
} from '@/lib/types';
import { CoverageExplanation } from './coverage-explanation';
import { OptionGroup } from './option-group';
import { APPROVAL_COVERAGE, TEXT_LIMITS } from './supplemental-constants';

const REASON_ID = 'supplemental-review-reason';

/** Admin decision on a pending request: coverage (approve) or reason (reject). */
export function ReviewDecisionDialog({
  view,
  kind,
  decision,
  onClose,
}: {
  view: SupplementalOrderView;
  kind: SupplementalKind;
  /** The decision being taken; `null` keeps the dialog closed. */
  decision: SupplementalReviewDecision | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={decision !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {/* Mounted per opening, so its choices start fresh each time. */}
        {decision && <DecisionForm view={view} kind={kind} decision={decision} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function DecisionForm({
  view,
  kind,
  decision,
  onClose,
}: {
  view: SupplementalOrderView;
  kind: SupplementalKind;
  decision: SupplementalReviewDecision;
  onClose: () => void;
}) {
  const { t } = useT();
  const review = useReviewSupplementalOrder();
  const allowance = useSupplementalEligibility(view.parentOrder.id).data?.requests[kind];
  const approving = decision === SupplementalReviewStatus.APPROVED;
  const choices = APPROVAL_COVERAGE[kind];
  const current = view.request.coverageStatus;
  const [coverage, setCoverage] = useState<SupplementalCoverageStatus | null>(
    choices.includes(current) ? current : choices.length === 1 ? choices[0] : null,
  );
  const [reason, setReason] = useState('');
  const reasonMissing = !approving && reason.trim().length === 0;

  const confirm = () =>
    review.mutate(
      {
        requestId: view.order.id,
        parentOrderId: view.parentOrder.id,
        patientId: view.order.patientId,
        data: {
          decision,
          coverageStatus: approving ? (coverage ?? undefined) : undefined,
          reason: reason.trim() || undefined,
        },
      },
      { onSuccess: onClose },
    );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t(`supplemental.review.${approving ? 'approveTitle' : 'rejectTitle'}`)}</DialogTitle>
        <DialogDescription>
          {t(`supplemental.review.${approving ? 'approveDescription' : 'rejectDescription'}`, {
            code: view.order.orderCode,
          })}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <CoverageExplanation
          status={current}
          reason={view.request.coverageReason}
          correctionNumber={allowance?.correctionNumber ?? null}
          includedRemaining={allowance?.includedRemaining ?? null}
        />
        {approving && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">{t('supplemental.review.coverageLegend')}</p>
            <OptionGroup
              group="coverage"
              layout="pair"
              options={choices}
              value={coverage}
              onChange={setCoverage}
              ariaLabel={t('supplemental.review.coverageLegend')}
            />
          </div>
        )}
        <TextAreaField
          id={REASON_ID}
          compact
          label={t(`supplemental.review.${approving ? 'reasonOptional' : 'reasonRequired'}`)}
          value={reason}
          onChange={setReason}
          maxLength={TEXT_LIMITS.reviewReason}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" className="h-11" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          className="h-11"
          variant={approving ? 'default' : 'destructive'}
          disabled={review.isPending || reasonMissing || (approving && coverage === null)}
          onClick={confirm}
        >
          {review.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : approving ? (
            <Check className="mr-2 h-4 w-4" aria-hidden />
          ) : (
            <X className="mr-2 h-4 w-4" aria-hidden />
          )}
          {t(`supplemental.actions.${approving ? 'approve' : 'reject'}`)}
        </Button>
      </DialogFooter>
    </>
  );
}
