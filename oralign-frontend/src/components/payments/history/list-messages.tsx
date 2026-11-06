'use client';

import type { ReactNode } from 'react';
import { ReceiptText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/lang-context';
import type { DayRange, HistoryFilters, HistoryTab } from './history-filters';

/** An empty or failed list: keeps the list's frame, one sentence, one action. */
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
      {action}
    </div>
  );
}

/**
 * Why the open tab has no row: a filter combination that cannot match,
 * a period with nothing in it, filters that match nothing, or nothing
 * recorded yet (per tab and role). Decided on what the request really
 * sent (`range`, the resolved days), not on the period's name: a custom
 * period whose dates were both cleared filters nothing.
 */
export function EmptyList({
  tab,
  isAdmin,
  filters,
  range,
  onClear,
  onAnyDate,
}: {
  tab: HistoryTab;
  isAdmin: boolean;
  filters: HistoryFilters;
  range: DayRange;
  onClear: () => void;
  onAnyDate: () => void;
}) {
  const { t } = useT();
  const dated = Boolean(range.from || range.to);
  const narrowed =
    filters.search !== '' ||
    filters.method !== 'all' ||
    filters.status !== 'all' ||
    filters.doctor !== 'all';
  const anyDate = (
    <Button variant="outline" size="sm" onClick={onAnyDate}>
      {t('paymentsDesk.filters.periodAll')}
    </Button>
  );

  // A fee to confirm has no payment date yet, so no period can hold it:
  // say why instead of a bare "no match".
  if (tab === 'frais' && filters.status === 'pending' && dated) {
    return (
      <ListMessage
        title={t('paymentsDesk.empty.undatedTitle')}
        detail={t('paymentsDesk.empty.undatedBody')}
        action={anyDate}
      />
    );
  }
  // Only the period narrows the list: an early morning's "today", say.
  if (dated && !narrowed) {
    return <ListMessage title={t('paymentsDesk.empty.periodTitle')} action={anyDate} />;
  }
  if (dated || narrowed) {
    return (
      <ListMessage
        title={t('paymentsDesk.empty.filteredTitle')}
        detail={
          filters.search
            ? t('paymentsDesk.empty.filteredBody')
            : t('paymentsDesk.empty.filteredBodyNoSearch')
        }
        action={
          <Button variant="outline" size="sm" onClick={onClear}>
            <X aria-hidden="true" />
            {t('paymentsDesk.filters.clear')}
          </Button>
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
export function UndatedFeesNote({ count, onAnyDate }: { count: number; onAnyDate: () => void }) {
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
        onClick={onAnyDate}
      >
        {t('paymentsDesk.filters.periodAll')}
      </Button>
    </p>
  );
}
