'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { businessToday } from '@/lib/utils/business-day';
import {
  EMPTY_PROGRESS,
  SEARCH_MAX_LENGTH,
  journalDayKey,
  pilotageUrlSearch,
  readPilotageUrl,
  samePeriod,
  type AnomalyFilter,
  type NoticeFilter,
  type PilotageState,
  type PilotageView,
  type ProgressFilters,
  type RecapPeriod,
} from './pilotage-state';

export interface PilotageActions {
  setView: (view: PilotageView) => void;
  /** Any day; today is stored as '' (the journal then follows the clock). */
  setDay: (day: string) => void;
  /** The recap and the discrepancies share it. */
  setPeriod: (period: RecapPeriod) => void;
  setKind: (kind: AnomalyFilter) => void;
  /** Patch the progress filters; the list goes back to its first page. */
  patchProgress: (patch: Partial<Omit<ProgressFilters, 'page'>>) => void;
  resetProgress: () => void;
  setProgressPage: (page: number) => void;
  setNoticeStatus: (status: NoticeFilter) => void;
  setNoticePage: (page: number) => void;
}

/**
 * The desk's state: React owns it, the address bar mirrors it (written
 * with `history.replaceState`, so switching a tab or a filter never stacks
 * history entries). `searchKey` remounts the progress search box when its
 * search changes from outside the box.
 */
export function usePilotageState(today: string): {
  state: PilotageState;
  searchKey: number;
} & PilotageActions {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<PilotageState>(() => readPilotageUrl(searchParams, today));
  const [searchKey, setSearchKey] = useState(0);

  // A link to this same page (the sidebar entry, a shared link) changes
  // the params without remounting the desk: take the URL's state then.
  // Our own replaceState comes back here too (Next syncs it into
  // useSearchParams), but it reads as what is on screen and changes
  // nothing, so the other views' filters kept in memory survive it.
  const search = searchParams.toString();
  const [seenSearch, setSeenSearch] = useState(search);
  if (search !== seenSearch) {
    setSeenSearch(search);
    const next = readPilotageUrl(searchParams, today);
    if (pilotageUrlSearch(next, '') !== pilotageUrlSearch(state, '')) {
      setState(next);
      if (next.progress.search !== state.progress.search) setSearchKey((key) => key + 1);
    }
  }

  useEffect(() => {
    const search = pilotageUrlSearch(state, window.location.search);
    if (search !== window.location.search) {
      window.history.replaceState(null, '', `${pathname}${search}${window.location.hash}`);
    }
  }, [state, pathname]);

  const setView = useCallback((view: PilotageView) => {
    setState((current) => (current.view === view ? current : { ...current, view }));
  }, []);

  const setDay = useCallback((day: string) => {
    // Read the clock at the click: the page may have stayed open overnight.
    const key = journalDayKey(day, businessToday());
    setState((current) => (current.day === key ? current : { ...current, day: key }));
  }, []);

  const setPeriod = useCallback((period: RecapPeriod) => {
    setState((current) =>
      samePeriod(current.period, period) ? current : { ...current, period },
    );
  }, []);

  const setKind = useCallback((kind: AnomalyFilter) => {
    setState((current) => (current.kind === kind ? current : { ...current, kind }));
  }, []);

  const patchProgress = useCallback((patch: Partial<Omit<ProgressFilters, 'page'>>) => {
    setState((current) => {
      const next: ProgressFilters = { ...current.progress, ...patch, page: 1 };
      next.search = next.search.slice(0, SEARCH_MAX_LENGTH);
      // An unchanged search (Enter pressed again) keeps the page on screen.
      const same =
        next.search === current.progress.search && next.state === current.progress.state;
      return same ? current : { ...current, progress: next };
    });
  }, []);

  const resetProgress = useCallback(() => {
    setState((current) => ({ ...current, progress: EMPTY_PROGRESS }));
    setSearchKey((key) => key + 1);
  }, []);

  const setProgressPage = useCallback((page: number) => {
    setState((current) =>
      current.progress.page === page
        ? current
        : { ...current, progress: { ...current.progress, page } },
    );
  }, []);

  const setNoticeStatus = useCallback((status: NoticeFilter) => {
    setState((current) =>
      current.notices.status === status
        ? current
        : { ...current, notices: { status, page: 1 } },
    );
  }, []);

  const setNoticePage = useCallback((page: number) => {
    setState((current) =>
      current.notices.page === page
        ? current
        : { ...current, notices: { ...current.notices, page } },
    );
  }, []);

  return {
    state,
    searchKey,
    setView,
    setDay,
    setPeriod,
    setKind,
    patchProgress,
    resetProgress,
    setProgressPage,
    setNoticeStatus,
    setNoticePage,
  };
}

/**
 * Today's Tunis business day, kept current when the tab comes back into
 * view: "Ce mois" or "Aujourd’hui" left open overnight means the new day.
 * (Same as the invoices desk's hook; kept local so the desks stay apart.)
 */
export function useBusinessToday(): string {
  const [today, setToday] = useState(businessToday);
  useEffect(() => {
    const sync = () => setToday(businessToday());
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return today;
}
