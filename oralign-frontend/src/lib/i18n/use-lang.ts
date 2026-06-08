'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { DEFAULT_LANG, LANGS, type Lang } from './dict';

/**
 * Dashboard-scoped language store backed by localStorage.
 *
 * Why this lives separate from the showcase's `useLang` — even though
 * the shape is identical:
 *   • Different storage key so a user signed in as admin can pick
 *     "French" on the dashboard without overriding the marketing
 *     site's per-visitor language.
 *   • Different default (EN for the working app, FR for the public
 *     showcase — that's where the marketing copy lives).
 *
 * The hook also mirrors the chosen language onto `<html lang>` and
 * flips `<html dir>` to "rtl" for Arabic so Tailwind's logical-prop
 * utilities (`ms-*`, `me-*`, `start-*`, `end-*`) and any
 * direction-aware browser features (scroll snap, text alignment,
 * caret position) Just Work.
 */
const STORAGE_KEY = 'oralign.dashboard.lang';
// Custom event so multiple useSyncExternalStore subscribers across the
// app sync immediately when the switcher fires `setLang`. The native
// `storage` event would only fire in *other* tabs — same-tab listeners
// need our own ping.
const EVENT = 'oralign-dashboard-lang';

function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

function readLang(): Lang {
  if (typeof window === 'undefined') return DEFAULT_LANG;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* localStorage can throw in private mode — fall back to default */
  }
  return DEFAULT_LANG;
}

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function useLang(): { lang: Lang; setLang: (l: Lang) => void } {
  const lang = useSyncExternalStore(subscribe, readLang, () => DEFAULT_LANG);

  // Mirror onto the document so CSS direction selectors + browser-
  // native features pick up the change. Runs ONCE on hydration and
  // every time the user toggles. We do this in an effect (not at
  // module scope) so SSR stays clean.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* private mode — accept the loss, just emit the event */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { lang, setLang };
}
