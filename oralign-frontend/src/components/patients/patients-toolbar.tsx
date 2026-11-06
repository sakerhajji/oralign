'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DayRangeForm } from '@/components/shared/day-range-form';
import { DentistFilter, type DentistOption } from '@/components/shared/dentist-filter';
import { FilterSelect, type FilterOption } from '@/components/shared/filter-select';
import { ListSearch } from '@/components/shared/list-search';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Lang } from '@/lib/i18n/dict';
import { useT } from '@/lib/i18n/lang-context';
import { Gender } from '@/lib/types';
import { businessToday, formatCalendarDay } from '@/lib/utils/business-day';
import {
  periodDays,
  type GenderFilter,
  type PatientsFilters,
  type PatientsSort,
  type PatientsView,
  type PeriodFilter,
} from './patients-filters';

export type ViewTotals = Partial<Record<PatientsView, number>>;

/** A custom period's days, short: "1er – 6 nov. 2026" / "Nov 1 – Nov 6, 2026". */
function rangeLabel(from: string, to: string, lang: Lang): string {
  if (!from || !to || from === to) return formatCalendarDay(from || to, lang, 'full');
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const sameMonth = sameYear && from.slice(5, 7) === to.slice(5, 7);
  const start =
    lang === 'fr' && sameMonth ? 'day' : sameYear ? 'dayMonth' : 'full';
  return `${formatCalendarDay(from, lang, start)} – ${formatCalendarDay(to, lang, 'full')}`;
}

/**
 * The patient book's view tabs (with live totals) over one row of
 * search, filters and sort.
 *
 * The tabs are the case state — the one dimension a dentist sorts their
 * patients by — so it is one click away instead of buried in a select.
 * Each total follows the search and filters below it.
 *
 * "Date d'ajout" offers quick periods and "Dates personnalisées…", which
 * opens Du / Au fields under the row, applied only with "Appliquer"; once
 * applied the chip shows its days. The admins' dentist filter is typed to
 * find (a long list of practitioners is searched, not scrolled).
 */
export function PatientsToolbar({
  view,
  onViewChange,
  totals,
  filters,
  onFiltersChange,
  isAdmin,
  dentists,
  dentistsLoading = false,
  busy,
  searchKey,
  canClear,
  onClear,
}: {
  view: PatientsView;
  onViewChange: (view: PatientsView) => void;
  totals: ViewTotals;
  filters: PatientsFilters;
  onFiltersChange: (patch: Partial<PatientsFilters>) => void;
  isAdmin: boolean;
  dentists: readonly DentistOption[];
  /** The dentist list is still loading: the dentist filter says so. */
  dentistsLoading?: boolean;
  busy: boolean;
  /** Bumped by the page to clear the search box (it owns its draft). */
  searchKey: number;
  /** Some search or filter is set: offer to clear them all. */
  canClear: boolean;
  onClear: () => void;
}) {
  const { t, lang } = useT();
  const today = businessToday();

  // "Dates personnalisées…" picked but not applied yet: the fields are open
  // while the list still shows the previous period. A period set from
  // elsewhere, or "Effacer les filtres", closes them.
  const [editing, setEditing] = useState(false);
  const [seen, setSeen] = useState({ period: filters.period, searchKey });
  if (seen.period !== filters.period || seen.searchKey !== searchKey) {
    setSeen({ period: filters.period, searchKey });
    setEditing(false);
  }
  const customApplied = filters.period === 'custom';
  const showRange = editing || customApplied;

  const views: { value: PatientsView; label: string }[] = [
    { value: 'all', label: t('patientDesk.views.all') },
    { value: 'active', label: t('patientDesk.views.active') },
    { value: 'none', label: t('patientDesk.views.none') },
    ...(isAdmin ? [{ value: 'trash' as const, label: t('patientDesk.views.trash') }] : []),
  ];

  const periodOptions: FilterOption<PeriodFilter>[] = [
    { value: 'all', label: t('patientDesk.filters.periodAll') },
    { value: '7d', label: t('patientDesk.filters.period7d') },
    { value: '30d', label: t('patientDesk.filters.period30d') },
    { value: '12m', label: t('patientDesk.filters.period12m') },
    { value: 'custom', label: t('patientDesk.filters.periodCustom') },
  ];
  const genderOptions: FilterOption<GenderFilter>[] = [
    { value: 'all', label: t('patientDesk.filters.genderAll') },
    { value: Gender.FEMALE, label: t('patientDesk.gender.female') },
    { value: Gender.MALE, label: t('patientDesk.gender.male') },
    { value: Gender.OTHER, label: t('patientDesk.gender.other') },
  ];
  const sortOptions: FilterOption<PatientsSort>[] = [
    { value: 'recent', label: t('patientDesk.sort.recent') },
    { value: 'oldest', label: t('patientDesk.sort.oldest') },
    { value: 'name', label: t('patientDesk.sort.name') },
    { value: 'name-desc', label: t('patientDesk.sort.nameDesc') },
    { value: 'updated', label: t('patientDesk.sort.updated') },
  ];

  // Custom dates start from the period on screen (a preset's days, or
  // today alone), so the list does not jump to every date in between.
  const shownDays = periodDays(filters);
  const rangeStart = customApplied
    ? { from: filters.from, to: filters.to }
    : { from: shownDays.from || today, to: shownDays.to || today };

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={view} onValueChange={(next) => onViewChange(next as PatientsView)}>
        {/* The strip sits on a full-width rule; it scrolls sideways on a
            narrow phone instead of wrapping (the padding keeps the active
            underline inside the scroller). */}
        <div className="no-scrollbar -mx-4 overflow-x-auto border-b px-4 lg:mx-0 lg:px-0">
          <TabsList variant="line" className="h-auto gap-4 pb-[5px]">
            {views.map(({ value, label }) => (
              <TabsTrigger key={value} value={value} className="flex-none px-0.5">
                {label}
                <span className="font-normal text-muted-foreground tabular-nums">
                  {totals[value] ?? ''}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        <ListSearch
          key={searchKey}
          value={filters.search}
          onChange={(search) => onFiltersChange({ search })}
          placeholder={t('patientDesk.filters.searchPh')}
          ariaLabel={t('patientDesk.filters.searchAria')}
          busy={busy}
          className="xl:max-w-md xl:flex-1"
        />
        {/* On a phone the filters are one row of content-sized chips that
            scrolls sideways, like the tabs, instead of stacking rows of
            selects above the list (the padding keeps focus rings inside
            the scroller). From sm up they are fixed-width selects. */}
        <div className="no-scrollbar -mx-4 -my-1 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:my-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:py-0 xl:ml-auto xl:flex-nowrap">
          <FilterSelect<PeriodFilter>
            label={t('patientDesk.filters.period')}
            value={editing ? 'custom' : filters.period}
            onValueChange={(period) => {
              if (period === 'custom') {
                setEditing(true);
                return;
              }
              setEditing(false);
              onFiltersChange({ period, from: '', to: '' });
            }}
            options={periodOptions}
            valueLabel={
              customApplied && !editing
                ? t('patientDesk.filters.periodRange', {
                    range: rangeLabel(filters.from, filters.to, lang),
                  })
                : undefined
            }
            className="w-auto shrink-0 sm:w-auto sm:min-w-44 xl:w-auto xl:min-w-44"
          />
          <FilterSelect<GenderFilter>
            label={t('patientDesk.filters.gender')}
            value={filters.gender}
            onValueChange={(gender) => onFiltersChange({ gender })}
            options={genderOptions}
            className="w-auto shrink-0 sm:w-36 xl:w-36"
          />
          {isAdmin && (
            <DentistFilter
              label={t('patientDesk.filters.dentist')}
              value={filters.dentist}
              onChange={(dentist) => onFiltersChange({ dentist })}
              dentists={dentists}
              loading={dentistsLoading}
              className="w-auto max-w-56 shrink-0 sm:w-52 sm:max-w-none xl:w-52"
            />
          )}
          <FilterSelect<PatientsSort>
            label={t('patientDesk.sort.label')}
            value={filters.sort}
            onValueChange={(sort) => onFiltersChange({ sort })}
            options={sortOptions}
            inactiveValue="recent"
            className="w-auto shrink-0 sm:w-44"
          />
          {canClear && (
            <Button
              variant="ghost"
              className="h-9 shrink-0 text-muted-foreground"
              onClick={onClear}
            >
              <X aria-hidden="true" />
              {t('patientDesk.filters.clear')}
            </Button>
          )}
        </div>
      </div>

      {showRange && (
        <DayRangeForm
          // A range applied or reset from elsewhere starts the fields again.
          key={`${filters.period}:${filters.from}:${filters.to}`}
          initial={rangeStart}
          applied={customApplied}
          max={today}
          onApply={(from, to) => {
            setEditing(false);
            onFiltersChange({ period: 'custom', from, to });
          }}
          onReset={() => {
            setEditing(false);
            onFiltersChange({ period: 'all', from: '', to: '' });
          }}
          className="xl:ml-auto xl:w-fit"
        />
      )}
    </div>
  );
}
