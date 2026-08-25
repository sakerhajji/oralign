"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_LANG, LANGS, type Lang } from "./dict";

const STORAGE_KEY = "oralign.showcase.lang";
const EVENT = "oralign-showcase-lang";

function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as readonly string[]).includes(v);
}

function readLang(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_LANG;
}

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * The STORED language preference. The document-level lang/dir reflection
 * lives in LangProvider, keyed on the ACTIVE language — which may differ
 * from the stored one on the /en and /ar trees where the URL wins.
 */
export function useLang(): { lang: Lang; setLang: (l: Lang) => void } {
  const lang = useSyncExternalStore(subscribe, readLang, () => DEFAULT_LANG);

  const setLang = useCallback((l: Lang) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { lang, setLang };
}
