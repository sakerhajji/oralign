'use client';

import { useEffect, useState } from 'react';
import {
  ACTIVITY_URL_KEY,
  adoptActivityFilter,
  readActivityFilter,
  withActivityFilter,
  type ActivityFilter,
} from '@/lib/account-activity/account-activity';

interface SearchParamsLike {
  get(name: string): string | null;
}

/**
 * The users desk's doctor inactivity filter (`?activity=active|warned|
 * inactive`), kept like the page's other filters: read from the URL on
 * mount (deep links, reload), then only written with history.replaceState
 * (no navigation). It touches its own key only, so the page's own URL sync
 * (usersUrlSearch keeps foreign parameters) and this one never fight.
 *
 * A link to the desk followed while it is open (the admin bell's
 * "practitioner turned inactive" notice: same page, only the query
 * changes, so Next keeps this instance) is adopted during the render
 * (adoptActivityFilter); `onAddressFilter` lets the page apply the rest of
 * that link (its role filter, page 1).
 */
export function useUsersActivityFilter(
  searchParams: SearchParamsLike,
  onAddressFilter?: (activity: ActivityFilter) => void,
): {
  activity: ActivityFilter;
  setActivity: (next: ActivityFilter) => void;
} {
  const [activity, setActivity] = useState<ActivityFilter>(() =>
    readActivityFilter(searchParams),
  );

  const address = searchParams.get(ACTIVITY_URL_KEY);
  const [seen, setSeen] = useState(address);
  if (address !== seen) {
    setSeen(address);
    const adopted = adoptActivityFilter(seen, address, activity);
    if (adopted !== null) {
      setActivity(adopted);
      onAddressFilter?.(adopted);
    }
  }

  useEffect(() => {
    const search = withActivityFilter(window.location.search, activity);
    if (search !== window.location.search) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${search}${window.location.hash}`,
      );
    }
  }, [activity]);

  return { activity, setActivity };
}
