'use client';

import { useSyncExternalStore } from 'react';

/** Same breakpoint as Tailwind's `md` (and `useIsMobile`): below it is a phone. */
const PHONE_QUERY = '(max-width: 767px)';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * Phone or wide layout, or null until known: the server can't tell, and
 * guessing would mount the side panel first and swap it for the bottom
 * sheet a frame later on a phone opened from a link. Callers render
 * nothing (or a neutral skeleton) while it is null.
 */
export function usePhoneLayout(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => null,
  );
}
