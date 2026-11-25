'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { businessToday } from '@/lib/utils/business-day';
import {
  deskUrlSearch,
  readDeskUrl,
  samePeriod,
  type DeskUrlState,
  type DeskView,
  type InvoicePeriod,
} from './period';

/**
 * The invoices desk's view and period: React owns them, the address bar
 * mirrors them (read once on mount, written with `history.replaceState`,
 * so switching a preset never stacks history entries). A reload keeps
 * the view and the period; a plain visit stays `/dashboard/invoices`.
 */
export function useInvoiceDesk(): {
  state: DeskUrlState;
  setView: (view: DeskView) => void;
  setPeriod: (period: InvoicePeriod) => void;
} {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<DeskUrlState>(() => readDeskUrl(searchParams));

  useEffect(() => {
    const search = deskUrlSearch(state, window.location.search);
    if (search !== window.location.search) {
      window.history.replaceState(null, '', `${pathname}${search}${window.location.hash}`);
    }
  }, [state, pathname]);

  const setView = useCallback((view: DeskView) => {
    setState((current) => (current.view === view ? current : { ...current, view }));
  }, []);

  const setPeriod = useCallback((period: InvoicePeriod) => {
    setState((current) =>
      samePeriod(current.period, period) ? current : { ...current, period },
    );
  }, []);

  return { state, setView, setPeriod };
}

/**
 * Today's Tunis business day, kept current when the tab comes back into
 * view: "Ce mois" left open overnight on the 1st means the new month.
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
