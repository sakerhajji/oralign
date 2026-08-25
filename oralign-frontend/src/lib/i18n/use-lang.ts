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
 *   • Different default + supported-language set. The dashboard runs
 *     EN / FR only — Arabic was dropped because the working app's
 *     specialised orthodontic terminology lives natively in FR. The
 *     marketing showcase still ships AR (it has a broader audience).
 *
 * The hook mirrors the chosen language onto `<html lang>` so language-
 * aware browser features (hyphenation, voice readers, spellcheck)
 * pick the right rules without a refresh.
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

/**
 * Module-level setter for non-hook call sites (the auth provider seeds
 * the language from the user's profile after login / refresh). Writes
 * the store + pings every `useSyncExternalStore` subscriber, exactly
 * like the hook's `setLang`. Invalid / unknown values are ignored so a
 * corrupted profile field can never wedge the UI language.
 */
export function applyStoredLang(value: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  if (!isLang(value)) return;
  try {
    if (window.localStorage.getItem(STORAGE_KEY) === value) return;
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode — still ping subscribers */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useLang(): { lang: Lang; setLang: (l: Lang) => void } {
  const lang = useSyncExternalStore(subscribe, readLang, () => DEFAULT_LANG);

  // Mirror onto the document so browser-native language features
  // (spellcheck, hyphenation, screen-reader voice) pick the right
  // rules. Runs ONCE on hydration and every time the user toggles.
  // We do this in an effect (not at module scope) so SSR stays clean.
  // `dir` is always "ltr" now that AR was dropped — keep the
  // assignment explicit so a stray `<html dir="rtl">` left over from
  // a previous build doesn't strand the layout in RTL.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    // The public showcase (and the created_for_you viewer) has its own
    // trilingual provider that owns <html> lang/dir — including RTL for
    // Arabic. This dashboard provider is mounted at the root, ABOVE the
    // showcase one, so its effect runs last and would overwrite the
    // showcase values (forcing lang="en" dir="ltr" onto /ar pages).
    // Cede ownership whenever a showcase surface is on screen.
    if (document.querySelector('[data-theme="showcase"]')) return;
    document.documentElement.lang = lang;
    document.documentElement.dir = 'ltr';
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
