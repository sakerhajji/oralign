'use client';

import Link from 'next/link';
import { ArrowLeft, ClipboardCheck, UserRound } from 'lucide-react';
import { useT } from '@/lib/i18n/lang-context';
import type {
  SupplementalEligibility,
  SupplementalKind,
  SupplementalOrderView,
} from '@/lib/types';
import { KIND_ICON } from './supplemental-constants';
import { formatDay } from './supplemental-format';
import { CoverageBadge } from './status-badges';

/**
 * Who and what the request is about, on every step: patient, initial case
 * (link back), approved plan and the estimated coverage.
 */
export function WizardContextBar({
  kind,
  view,
  eligibility,
  onLeave,
}: {
  kind: SupplementalKind;
  view: SupplementalOrderView;
  eligibility: SupplementalEligibility;
  /** Called before following the link back to the initial case. */
  onLeave: () => void;
}) {
  const { t, lang } = useT();
  const KindIcon = KIND_ICON[kind];
  const plan = eligibility.approvedPlan;
  const coverage = eligibility.requests[kind];

  return (
    <section
      aria-label={t('supplemental.wizard.contextLabel')}
      className="flex flex-col gap-3 rounded-md border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <UserRound className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">
            {view.order.patient?.fullName ?? t('supplemental.wizard.unknownPatient')}
          </p>
          <Link
            href={`/dashboard/orders/${view.parentOrder.id}`}
            onClick={onLeave}
            className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:min-h-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {t('supplemental.parentCase')} · <span className="font-mono">{view.parentOrder.orderCode}</span>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:justify-end">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <KindIcon className="h-4 w-4 text-primary" aria-hidden />
          {t(`supplemental.type.${kind}`)}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <ClipboardCheck className="h-4 w-4" aria-hidden />
          {plan
            ? t('supplemental.wizard.approvedPlan', {
                version: plan.version,
                date: formatDay(plan.approvedAt, lang) ?? '—',
              })
            : t('supplemental.wizard.noApprovedPlan')}
        </span>
        <CoverageBadge status={coverage.coverageStatus} estimate />
      </div>
    </section>
  );
}
