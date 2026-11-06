'use client';

import { useId, useState, type ReactNode } from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useT } from '@/lib/i18n/lang-context';
import { cn } from '@/lib/utils';
import {
  METHOD_VALUES,
  RANK_VALUES,
  SORT_VALUES,
  TAB_STATUSES,
  type HistorySort,
  type HistoryTab,
  type InstallmentRank,
  type MethodFilter,
  type StatusFilter,
  type TabFilters,
} from './history-filters';

const SORT_KEYS: Record<HistorySort, string> = {
  recent: 'paymentsDesk.sort.recent',
  oldest: 'paymentsDesk.sort.oldest',
  'amount-desc': 'paymentsDesk.sort.amountDesc',
  'amount-asc': 'paymentsDesk.sort.amountAsc',
};

const RANK_KEYS: Record<InstallmentRank, string> = {
  all: 'paymentsDesk.filters.rankAll',
  '1': 'paymentsDesk.filters.rank1',
  '2': 'paymentsDesk.filters.rank2',
  '3': 'paymentsDesk.filters.rank3',
  '4+': 'paymentsDesk.filters.rank4',
};

/** The selected option reads in ink: the choice is obvious at a glance. */
const OPTION =
  'h-8 justify-start px-3 text-[13px] data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background';

/** How many of the popover's filters are not at their default (the sort counts). */
export function advancedFilterCount(filters: TabFilters): number {
  return [
    filters.method !== 'all',
    filters.status !== 'all',
    filters.rank !== 'all',
    filters.sort !== 'recent',
  ].filter(Boolean).length;
}

/**
 * The tab's less frequent filters in one compact popover: payment method,
 * status (every status the tab can hold, as the badges name them), the
 * installment's rank (installments only) and the order. Every change
 * applies at once; the badge on the button counts what is set.
 */
export function AdvancedFilters({
  tab,
  filters,
  onChange,
}: {
  tab: HistoryTab;
  filters: TabFilters;
  onChange: (patch: Partial<TabFilters>) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const count = advancedFilterCount(filters);
  const defaults: Partial<TabFilters> = { method: 'all', status: 'all', rank: 'all', sort: 'recent' };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('h-9 shrink-0 gap-2', count > 0 && 'border-foreground/40')}
          aria-label={count > 0 ? t('paymentsDesk.filters.moreAria', { count }) : undefined}
        >
          <SlidersHorizontal aria-hidden="true" />
          {t('paymentsDesk.filters.more')}
          {count > 0 && (
            <span
              aria-hidden="true"
              className="grid size-5 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background tabular-nums"
            >
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      {/* Never taller than the room Radix measured beside the button: the
          options scroll, the title and the buttons stay in view. */}
      <PopoverContent
        align="end"
        collisionPadding={8}
        className="flex max-h-(--radix-popover-content-available-height) w-[min(23rem,calc(100vw-2rem))] flex-col p-0"
      >
        <p className="shrink-0 border-b px-4 py-3 text-sm font-medium">
          {t('paymentsDesk.filters.moreTitle')}
        </p>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <FilterGroup label={t('paymentsDesk.filters.method')}>
            {(labelId) => (
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={1}
                value={filters.method}
                onValueChange={(method) => method && onChange({ method: method as MethodFilter })}
                aria-labelledby={labelId}
                className="flex w-full flex-wrap"
              >
                <ToggleGroupItem value="all" className={OPTION}>
                  {t('paymentsDesk.filters.methodAll')}
                </ToggleGroupItem>
                {METHOD_VALUES.map((method) => (
                  <ToggleGroupItem key={method} value={method} className={OPTION}>
                    {t(`paymentsDesk.method.${method}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          </FilterGroup>

          <FilterGroup label={t('paymentsDesk.filters.status')}>
            {(labelId) => (
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={1}
                value={filters.status}
                onValueChange={(status) => status && onChange({ status: status as StatusFilter })}
                aria-labelledby={labelId}
                className="grid w-full grid-cols-2"
              >
                {TAB_STATUSES[tab].map((status) => (
                  <ToggleGroupItem
                    key={status}
                    value={status}
                    className={cn(OPTION, status === 'all' && 'col-span-2')}
                  >
                    {status === 'all'
                      ? t('paymentsDesk.filters.statusAll')
                      : t(`paymentsDesk.status.${status}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          </FilterGroup>

          {tab === 'echeances' && (
            <FilterGroup label={t('paymentsDesk.filters.rank')}>
              {(labelId) => (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  spacing={1}
                  value={filters.rank}
                  onValueChange={(rank) => rank && onChange({ rank: rank as InstallmentRank })}
                  aria-labelledby={labelId}
                  className="flex w-full flex-wrap"
                >
                  {RANK_VALUES.map((rank) => (
                    <ToggleGroupItem key={rank} value={rank} className={OPTION}>
                      {t(RANK_KEYS[rank])}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            </FilterGroup>
          )}

          <FilterGroup label={t('paymentsDesk.sort.label')}>
            {(labelId) => (
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={1}
                value={filters.sort}
                onValueChange={(sort) => sort && onChange({ sort: sort as HistorySort })}
                aria-labelledby={labelId}
                className="grid w-full grid-cols-2"
              >
                {SORT_VALUES.map((sort) => (
                  <ToggleGroupItem key={sort} value={sort} className={OPTION}>
                    {t(SORT_KEYS[sort])}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          </FilterGroup>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={count === 0}
            onClick={() => onChange(defaults)}
          >
            <RotateCcw aria-hidden="true" />
            {t('paymentsDesk.period.reset')}
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>
            {t('paymentsDesk.filters.done')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: (labelId: string) => ReactNode;
}) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2">
      <p id={labelId} className="text-xs font-medium text-muted-foreground">
        {label}
      </p>
      {children(labelId)}
    </div>
  );
}
