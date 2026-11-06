'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePaymentPractitioners } from '@/lib/hooks';
import { useT } from '@/lib/i18n/lang-context';
import { TAB_PURPOSE, type HistoryTab, type TabFilters } from './history-filters';

interface Chip {
  key: string;
  label: string;
  clear: Partial<TabFilters>;
}

/**
 * What narrows the open tab, one removable chip per filter, and the way
 * to reset them all. Nothing when the tab shows every payment of the
 * period (the sort is an order, not a filter: it has no chip).
 */
export function ActiveFilters({
  tab,
  filters,
  isAdmin,
  onChange,
  onReset,
}: {
  tab: HistoryTab;
  filters: TabFilters;
  isAdmin: boolean;
  onChange: (patch: Partial<TabFilters>) => void;
  onReset: () => void;
}) {
  const { t } = useT();
  const picked = isAdmin && filters.doctor !== 'all';
  // The practitioner filter's own list (cached): the chip names the dentist.
  const practitioners = usePaymentPractitioners(TAB_PURPOSE[tab], { enabled: picked });
  const chip = (label: string, value: string) =>
    t('paymentsDesk.filters.chip', { label, value });

  const chips: Chip[] = [];
  if (filters.search) {
    chips.push({
      key: 'search',
      label: t('paymentsDesk.filters.chipSearch', { value: filters.search }),
      clear: { search: '' },
    });
  }
  if (picked) {
    const name =
      practitioners.data?.find((doctor) => doctor.id === filters.doctor)?.fullName ??
      t('paymentsDesk.filters.practitionerUnlisted');
    chips.push({
      key: 'doctor',
      label: chip(t('paymentsDesk.filters.practitioner'), name),
      clear: { doctor: 'all' },
    });
  }
  if (filters.method !== 'all') {
    chips.push({
      key: 'method',
      label: chip(t('paymentsDesk.filters.method'), t(`paymentsDesk.method.${filters.method}`)),
      clear: { method: 'all' },
    });
  }
  if (filters.status !== 'all') {
    chips.push({
      key: 'status',
      label: chip(t('paymentsDesk.filters.status'), t(`paymentsDesk.status.${filters.status}`)),
      clear: { status: 'all' },
    });
  }
  if (tab === 'echeances' && filters.rank !== 'all') {
    chips.push({
      key: 'rank',
      label: t(`paymentsDesk.filters.rankChip.${filters.rank}`),
      clear: { rank: 'all' },
    });
  }
  if (chips.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={t('paymentsDesk.filters.activeAria')}
      className="flex flex-wrap items-center gap-1.5"
    >
      {chips.map(({ key, label, clear }) => (
        <span
          key={key}
          className="inline-flex h-7 max-w-full items-center gap-0.5 rounded-full border bg-muted/40 pr-0.5 pl-2.5 text-xs"
        >
          <span className="truncate">{label}</span>
          <button
            type="button"
            onClick={() => onChange(clear)}
            aria-label={t('paymentsDesk.filters.chipRemove', { label })}
            title={t('paymentsDesk.filters.chipRemove', { label })}
            className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={onReset}
      >
        {t('paymentsDesk.filters.clear')}
      </Button>
    </div>
  );
}
