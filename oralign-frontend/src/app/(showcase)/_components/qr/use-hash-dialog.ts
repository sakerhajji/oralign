"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Fired after this module changes the hash itself (pushState sends no event). */
const HASH_EVENT = "oralign:qr-hash";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  window.addEventListener(HASH_EVENT, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(HASH_EVENT, onChange);
  };
}

/**
 * A panel of the QR welcome whose open state is the URL hash (#guide,
 * #contact): a printed code or a shared link can open it directly, a tap
 * on its link before the page is interactive still opens it once it is,
 * and a phone's Back button closes it instead of leaving the page.
 *
 * Opening adds a history entry marked as this panel's (in history.state,
 * which Next keeps beside its own and which survives a reload); closing
 * goes back over such an entry, and otherwise (a link that arrived with
 * the hash) only drops the hash, so closing never leaves the site.
 */
export function useHashDialog(name: string) {
  const hash = `#${name}`;
  const open = useSyncExternalStore(
    subscribe,
    () => window.location.hash === hash,
    () => false,
  );

  const show = useCallback(() => {
    if (window.location.hash === hash) return;
    window.history.pushState({ qrPanel: name }, "", hash);
    window.dispatchEvent(new Event(HASH_EVENT));
  }, [hash, name]);

  const hide = useCallback(() => {
    if (window.location.hash !== hash) return;
    const state = window.history.state as { qrPanel?: string } | null;
    if (state?.qrPanel === name) {
      window.history.back();
      return;
    }
    const { pathname, search } = window.location;
    window.history.replaceState(null, "", `${pathname}${search}`);
    window.dispatchEvent(new Event(HASH_EVENT));
  }, [hash, name]);

  return { open, show, hide };
}
