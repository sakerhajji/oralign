'use client';

import { useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { X } from 'lucide-react';
import { FilterSelect, type FilterOption } from '@/components/shared/filter-select';
import { ListSearch } from '@/components/shared/list-search';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT } from '@/lib/i18n/lang-context';
import { PaymentMethod } from '@/lib/types';
import {
  EARLIEST_DAY,
  SEARCH_MAX_LENGTH,
  TAB_STATUSES,
  plausibleDay,
  type DayRange,
  type HistoryFilters,
  type HistorySort,
  type HistoryTab,
  type MethodFilter,
  type PeriodKey,
  type StatusFilter,
} from './history-filters';

/** How long a typed day waits before it is applied (as the search does). */
const DAY_COMMIT_DELAY_MS = 400;

export type TabTotals = Partial<Record<HistoryTab, number>>;

// From sm the selects keep fixed widths and wrap; on xl they size to
// their value so the search and every filter share one row.
const SELECT = 'w-auto shrink-0 xl:w-auto xl:min-w-32';

/**
 * The desk's two tabs (with live totals, on a full-width rule) over one
 * row of search, filters and sort; a custom period adds its two dates
 * underneath. Must render inside the page's <Tabs>.
 *
 * On a phone the filters are one row of content-sized chips that scrolls
 * sideways, like the tabs, instead of stacking rows of selects above the
 * list.
 */
export function HistoryToolbar({
  tab,
  totals,
  filters,
  onFiltersChange,
  isAdmin,
  dentists,
  busy,
  searchKey,
  canClear,
  onClear,
  range,
  today,
}: {
  tab: HistoryTab;
  totals: TabTotals;
  filters: HistoryFilters;
  onFiltersChange: (patch: Partial<HistoryFilters>) => void;
  isAdmin: boolean;
  dentists: { id: string; fullName: string }[];
  busy: boolean;
  /** Bumped by the page to clear the search box (it owns its draft). */
  searchKey: number;
  /** Some search or filter is set: offer to clear them all. */
  canClear: boolean;
  onClear: () => void;
  /** The days the current period covers: custom dates start from them. */
  range: DayRange;
  /** Today's business day: no custom date after it. */
  today: string;
}) {
  const { t } = useT();
  const fees = tab === 'frais';

  const tabs: { value: HistoryTab; label: string }[] = [
    { value: 'echeances', label: t('paymentsDesk.tabs.installments') },
    { value: 'frais', label: t('paymentsDesk.tabs.fees') },
  ];
  const periodOptions: FilterOption<PeriodKey>[] = [
    { value: 'all', label: t('paymentsDesk.filters.periodAll') },
    { value: 'today', label: t('paymentsDesk.filters.periodToday') },
    { value: 'yesterday', label: t('paymentsDesk.filters.periodYesterday') },
    { value: '7d', label: t('paymentsDesk.filters.period7d') },
    { value: 'month', label: t('paymentsDesk.filters.periodMonth') },
    { value: 'lastMonth', label: t('paymentsDesk.filters.periodLastMonth') },
    { value: 'custom', label: t('paymentsDesk.filters.periodCustom') },
  ];
  const methodOptions: FilterOption<MethodFilter>[] = [
    { value: 'all', label: t('paymentsDesk.filters.methodAll') },
    { value: PaymentMethod.CASH, label: t('paymentsDesk.method.cash') },
    { value: PaymentMethod.CARD, label: t('paymentsDesk.method.card') },
    { value: PaymentMethod.BANK_TRANSFER, label: t('paymentsDesk.method.bank_transfer') },
  ];
  const statusLabel: Record<StatusFilter, string> = {
    all: t('paymentsDesk.filters.statusAll'),
    paid: t('paymentsDesk.filters.statusPaid'),
    // A fee is never "pending" in the card sense: it waits for its
    // transfer to be confirmed.
    pending: fees ? t('paymentsDesk.filters.statusToConfirm') : t('paymentsDesk.filters.statusPending'),
    failed: t('paymentsDesk.filters.statusFailed'),
  };
  const statusOptions: FilterOption<StatusFilter>[] = TAB_STATUSES[tab].map((value) => ({
    value,
    label: statusLabel[value],
  }));
  const dentistOptions: FilterOption<string>[] = [
    { value: 'all', label: t('paymentsDesk.filters.dentistAll') },
    ...dentists.map((dentist) => ({ value: dentist.id, label: dentist.fullName })),
  ];
  // A dentist from the URL who is not in the list (not loaded yet, or no
  // longer listed) still reads as a filter instead of a blank select.
  if (filters.doctor !== 'all' && !dentists.some((dentist) => dentist.id === filters.doctor)) {
    dentistOptions.push({ value: filters.doctor, label: t('paymentsDesk.filters.dentistUnlisted') });
  }
  const sortOptions: FilterOption<HistorySort>[] = [
    { value: 'recent', label: t('paymentsDesk.sort.recent') },
    { value: 'oldest', label: t('paymentsDesk.sort.oldest') },
    { value: 'amount-desc', label: t('paymentsDesk.sort.amountDesc') },
    { value: 'amount-asc', label: t('paymentsDesk.sort.amountAsc') },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* The strip sits on a full-width rule; it scrolls sideways on a
          narrow phone instead of wrapping (the padding keeps the active
          underline inside the scroller). */}
      <div className="no-scrollbar -mx-4 overflow-x-auto border-b px-4 lg:mx-0 lg:px-0">
        <TabsList
          variant="line"
          aria-label={t('paymentsDesk.tabs.aria')}
          className="h-auto gap-4 pb-[5px]"
        >
          {tabs.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className="flex-none px-0.5">
              {label}
              <span className="font-normal text-muted-foreground tabular-nums">
                {totals[value] ?? ''}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        <ListSearch
          key={searchKey}
          value={filters.search}
          onChange={(search) => onFiltersChange({ search })}
          placeholder={t('paymentsDesk.filters.searchPh')}
          ariaLabel={t('paymentsDesk.filters.searchAria')}
          busy={busy}
          maxLength={SEARCH_MAX_LENGTH}
          className="xl:max-w-md xl:min-w-64 xl:flex-1"
        />
        {/* The padding keeps focus rings inside the phone scroller. On xl
            the chips may still wrap rather than push the page sideways
            when many long values are set. */}
        <div className="no-scrollbar -mx-4 -my-1 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:my-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:py-0 xl:ml-auto xl:justify-end">
          <FilterSelect<PeriodKey>
            label={t('paymentsDesk.filters.period')}
            value={filters.period}
            onValueChange={(period) =>
              onFiltersChange(
                // Custom dates start from the period on screen (or today),
                // so the list does not widen to every date in between.
                period === 'custom'
                  ? { period, from: range.from ?? today, to: range.to ?? today }
                  : { period, from: '', to: '' },
              )
            }
            options={periodOptions}
            className={`${SELECT} sm:w-44`}
          />
          <FilterSelect<MethodFilter>
            label={t('paymentsDesk.filters.method')}
            value={filters.method}
            onValueChange={(method) => onFiltersChange({ method })}
            options={methodOptions}
            className={`${SELECT} sm:w-44`}
          />
          <FilterSelect<StatusFilter>
            label={t('paymentsDesk.filters.status')}
            value={filters.status}
            onValueChange={(status) => onFiltersChange({ status })}
            options={statusOptions}
            className={`${SELECT} sm:w-40`}
          />
          {isAdmin && (
            <FilterSelect<string>
              label={t('paymentsDesk.filters.dentist')}
              value={filters.doctor}
              onValueChange={(doctor) => onFiltersChange({ doctor })}
              options={dentistOptions}
              className={`${SELECT} max-w-56 sm:w-48 sm:max-w-none xl:max-w-56`}
            />
          )}
          <FilterSelect<HistorySort>
            label={t('paymentsDesk.sort.label')}
            value={filters.sort}
            onValueChange={(sort) => onFiltersChange({ sort })}
            options={sortOptions}
            inactiveValue="recent"
            className={`${SELECT} sm:w-44`}
          />
          {canClear && (
            <Button variant="ghost" className="h-9 shrink-0 text-muted-foreground" onClick={onClear}>
              <X aria-hidden="true" />
              {t('paymentsDesk.filters.clear')}
            </Button>
          )}
        </div>
      </div>

      {filters.period === 'custom' && (
        // On xl it sits under the right-aligned chips, by the Période
        // select that opened it.
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 xl:justify-end">
          {/* Each bound applies on its own; the pickers still guide
              from ≤ to ≤ today, and the range is put in order where the
              params are built (periodRange). */}
          <CustomDayInput
            label={t('paymentsDesk.filters.from')}
            value={filters.from}
            onCommit={(from) => onFiltersChange({ from })}
            min={EARLIEST_DAY}
            max={filters.to || today}
            today={today}
          />
          <CustomDayInput
            label={t('paymentsDesk.filters.to')}
            value={filters.to}
            onCommit={(to) => onFiltersChange({ to })}
            min={filters.from || EARLIEST_DAY}
            max={today}
            today={today}
          />
        </div>
      )}
    </div>
  );
}

/**
 * One bound of a custom period. A date field reports every digit typed
 * into its year (Chrome sends 0002-…, 0020-…, 0202-… on the way to 2026)
 * and an empty value while a part is being retyped, so the field keeps
 * what is typed as a draft and applies only a real day from EARLIEST_DAY
 * on (a later day than today applies as today), once the typing pauses,
 * on Enter, or when the field is left. Left with a day that cannot apply,
 * it shows the one in use again. It never changes the other bound.
 */
function CustomDayInput({
  label,
  value,
  onCommit,
  min,
  max,
  today,
}: {
  label: string;
  /** The applied day ('YYYY-MM-DD' or ''). */
  value: string;
  onCommit: (day: string) => void;
  min: string;
  max: string;
  today: string;
}) {
  const [draft, setDraft] = useState(value);
  // The applied day changed from outside (or was capped at today): show it.
  const [applied, setApplied] = useState(value);
  if (applied !== value) {
    setApplied(value);
    setDraft(value);
  }

  const commit = useDebouncedCallback((next: string) => {
    const day = next === '' ? '' : plausibleDay(next, today);
    if (day !== null && day !== value) onCommit(day);
  }, DAY_COMMIT_DELAY_MS);

  const settle = () => {
    commit.flush();
    // Show what applies: the day in use when the draft cannot apply,
    // today for a later day.
    const day = draft === '' ? '' : plausibleDay(draft, today);
    if (day !== draft) setDraft(day ?? value);
  };

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      {label}
      <Input
        type="date"
        value={draft}
        min={min}
        max={max}
        onChange={(event) => {
          setDraft(event.target.value);
          commit(event.target.value);
        }}
        onBlur={settle}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            settle();
          }
        }}
        className="h-9 w-40 text-foreground"
      />
    </label>
  );
}
