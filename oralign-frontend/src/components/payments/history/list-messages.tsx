'use client';

import type { ReactNode } from 'react';
import { CalendarDays, ReceiptText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/lang-context';
import { PaymentRecordStatus } from '@/lib/types';
import { hasActiveFilters, type HistoryTab, type TabFilters } from './history-filters';

/** An empty or failed list: keeps the list's frame, one sentence, its actions. */
export function ListMessage({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-12 text-center ring-1 ring-foreground/10">
      <ReceiptText className="size-6 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {detail && <p className="max-w-md text-xs text-muted-foreground">{detail}</p>}
      </div>
      {action && <div className="flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/**
 * Why the open tab has no row: a fee status that no period can hold,
 * criteria that match nothing (the period, the tab's filters, or both —
 * each with its way out), or nothing recorded yet (per tab and role).
 */
export function EmptyList({
  tab,
  isAdmin,
  filters,
  dated,
  onReset,
  onAllDates,
}: {
  tab: HistoryTab;
  isAdmin: boolean;
  filters: TabFilters;
  /** The global period narrows the list (any period but "All dates"). */
  dated: boolean;
  /** Clear this tab's search and filters. */
  onReset: () => void;
  /** Switch the global period to every date. */
  onAllDates: () => void;
}) {
  const { t } = useT();
  const narrowed = hasActiveFilters(filters);
  const allDates = (
    <Button variant="outline" size="sm" onClick={onAllDates}>
      <CalendarDays aria-hidden="true" />
      {t('paymentsDesk.period.all')}
    </Button>
  );
  const reset = (
    <Button variant="outline" size="sm" onClick={onReset}>
      <X aria-hidden="true" />
      {t('paymentsDesk.filters.clear')}
    </Button>
  );

  // A fee to confirm has no payment date yet, so no period can hold it:
  // say why instead of a bare "no match".
  if (tab === 'frais' && filters.status === PaymentRecordStatus.AWAITING_CONFIRMATION && dated) {
    return (
      <ListMessage
        title={t('paymentsDesk.empty.undatedTitle')}
        detail={t('paymentsDesk.empty.undatedBody')}
        action={allDates}
      />
    );
  }
  if (dated || narrowed) {
    return (
      <ListMessage
        title={t('paymentsDesk.empty.noMatch')}
        detail={
          narrowed ? t('paymentsDesk.empty.noMatchFilters') : t('paymentsDesk.empty.noMatchPeriod')
        }
        action={
          <>
            {narrowed && reset}
            {dated && allDates}
          </>
        }
      />
    );
  }
  if (tab === 'frais') {
    return (
      <ListMessage
        title={t('paymentsDesk.empty.feesTitle')}
        detail={
          isAdmin ? t('paymentsDesk.empty.feesBodyAdmin') : t('paymentsDesk.empty.feesBodyDentist')
        }
      />
    );
  }
  return (
    <ListMessage
      title={t('paymentsDesk.empty.installmentsTitle')}
      detail={
        isAdmin
          ? t('paymentsDesk.empty.installmentsBodyAdmin')
          : t('paymentsDesk.empty.installmentsBodyDentist')
      }
    />
  );
}

/**
 * Over the fees list when a period hides fees still to confirm: they have
 * no payment date until their transfer is confirmed, so no period lists
 * them (installments do not have this gap: an unpaid one is dated by the
 * day it was made). Shown only when some exist.
 */
export function UndatedFeesNote({ count, onAllDates }: { count: number; onAllDates: () => void }) {
  const { t } = useT();
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
      <span>
        {count === 1
          ? t('paymentsDesk.list.undatedFeesOne')
          : t('paymentsDesk.list.undatedFeesMany', { count })}
      </span>
      {/* Underlined at rest: a phone has no hover to reveal the link. */}
      <Button
        variant="link"
        size="xs"
        className="h-auto px-0 text-xs text-foreground underline underline-offset-4"
        onClick={onAllDates}
      >
        {t('paymentsDesk.period.all')}
      </Button>
    </p>
  );
}
