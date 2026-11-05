'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterSelect, type FilterOption } from '@/components/shared/filter-select';
import { ListSearch } from '@/components/shared/list-search';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT } from '@/lib/i18n/lang-context';
import { Gender } from '@/lib/types';
import type {
  GenderFilter,
  PatientsFilters,
  PatientsSort,
  PatientsView,
  PeriodFilter,
} from './patients-filters';

export type ViewTotals = Partial<Record<PatientsView, number>>;

/**
 * The patient book's view tabs (with live totals) over one row of
 * search, filters and sort.
 *
 * The tabs are the case state — the one dimension a dentist sorts their
 * patients by — so it is one click away instead of buried in a select.
 * Each total follows the search and filters below it.
 */
export function PatientsToolbar({
  view,
  onViewChange,
  totals,
  filters,
  onFiltersChange,
  isAdmin,
  dentists,
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
  dentists: { id: string; fullName: string }[];
  busy: boolean;
  /** Bumped by the page to clear the search box (it owns its draft). */
  searchKey: number;
  /** Some search or filter is set: offer to clear them all. */
  canClear: boolean;
  onClear: () => void;
}) {
  const { t } = useT();

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
            value={filters.period}
            onValueChange={(period) => onFiltersChange({ period })}
            options={periodOptions}
            className="w-auto shrink-0 sm:w-44"
          />
          <FilterSelect<GenderFilter>
            label={t('patientDesk.filters.gender')}
            value={filters.gender}
            onValueChange={(gender) => onFiltersChange({ gender })}
            options={genderOptions}
            className="w-auto shrink-0 sm:w-36 xl:w-36"
          />
          {isAdmin && (
            <FilterSelect<string>
              label={t('patientDesk.filters.dentist')}
              value={filters.dentist}
              onValueChange={(dentist) => onFiltersChange({ dentist })}
              options={[
                { value: 'all', label: t('patientDesk.filters.dentistAll') },
                ...dentists.map((dentist) => ({ value: dentist.id, label: dentist.fullName })),
              ]}
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
    </div>
  );
}
