'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  EMPTY_TAB_FILTERS,
  SEARCH_MAX_LENGTH,
  deskUrlSearch,
  readDeskUrlState,
  samePeriod,
  sameTabFilters,
  statusForTab,
  type DeskState,
  type HistoryTab,
  type Period,
  type TabFilters,
} from './history-filters';

export interface DeskActions {
  setTab: (tab: HistoryTab) => void;
  /** A new period sends both tabs back to their first page. */
  setPeriod: (period: Period) => void;
  /** Patch one tab's filters; that tab goes back to its first page. */
  patchFilters: (tab: HistoryTab, patch: Partial<TabFilters>) => void;
  /** Clear one tab's search and filters (its sort stays). */
  resetFilters: (tab: HistoryTab) => void;
  setPage: (tab: HistoryTab, page: number) => void;
}

/**
 * The desk's state: React owns it, the address bar mirrors it (read once
 * on mount, written with `history.replaceState`, so filtering never
 * stacks history entries). `searchKeys` remount a tab's search box when
 * its search is cleared from outside the box (the box owns its draft).
 */
export function useDeskState(isAdmin: boolean): {
  state: DeskState;
  searchKeys: Record<HistoryTab, number>;
  returnTo: string;
} & DeskActions {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<DeskState>(() =>
    readDeskUrlState(searchParams, { isAdmin }),
  );
  const [searchKeys, setSearchKeys] = useState<Record<HistoryTab, number>>({
    frais: 0,
    echeances: 0,
  });

  useEffect(() => {
    const search = deskUrlSearch(state, window.location.search);
    if (search !== window.location.search) {
      window.history.replaceState(null, '', `${pathname}${search}${window.location.hash}`);
    }
  }, [state, pathname]);

  const setTab = useCallback((tab: HistoryTab) => {
    setState((current) => (current.tab === tab ? current : { ...current, tab }));
  }, []);

  const setPeriod = useCallback((period: Period) => {
    setState((current) =>
      samePeriod(current.period, period)
        ? current
        : { ...current, period, pages: { frais: 1, echeances: 1 } },
    );
  }, []);

  const patchFilters = useCallback((tab: HistoryTab, patch: Partial<TabFilters>) => {
    setState((current) => {
      const next: TabFilters = { ...current.filters[tab], ...patch };
      next.search = next.search.slice(0, SEARCH_MAX_LENGTH);
      next.status = statusForTab(next.status, tab);
      if (tab !== 'echeances') next.rank = 'all';
      if (sameTabFilters(next, current.filters[tab])) return current;
      return {
        ...current,
        filters: { ...current.filters, [tab]: next },
        pages: { ...current.pages, [tab]: 1 },
      };
    });
    // A search cleared from a chip: the box shows it at once.
    if (patch.search === '') {
      setSearchKeys((keys) => ({ ...keys, [tab]: keys[tab] + 1 }));
    }
  }, []);

  const resetFilters = useCallback((tab: HistoryTab) => {
    setState((current) => ({
      ...current,
      filters: {
        ...current.filters,
        [tab]: { ...EMPTY_TAB_FILTERS, sort: current.filters[tab].sort },
      },
      pages: { ...current.pages, [tab]: 1 },
    }));
    setSearchKeys((keys) => ({ ...keys, [tab]: keys[tab] + 1 }));
  }, []);

  const setPage = useCallback((tab: HistoryTab, page: number) => {
    setState((current) =>
      current.pages[tab] === page
        ? current
        : { ...current, pages: { ...current.pages, [tab]: page } },
    );
  }, []);

  // Where an order or a receipt opened from here returns: this desk, as is.
  const returnTo = `${pathname}${deskUrlSearch(state, '')}`;

  return {
    state,
    searchKeys,
    returnTo,
    setTab,
    setPeriod,
    patchFilters,
    resetFilters,
    setPage,
  };
}
