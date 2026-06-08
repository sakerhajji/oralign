'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { DEFAULT_LANG, translate, type Lang } from './dict';
import { useLang } from './use-lang';

/**
 * Dashboard i18n context.
 *
 * Exposes:
 *   • `lang`    — current language (en | fr | ar)
 *   • `setLang` — switcher action
 *   • `t(path, vars?)` — translation helper, memoised per render so
 *     consumers can use it as a stable dependency in effects/memos
 *     without re-triggering on unrelated renders.
 *
 * Hydration safety: during SSR + the initial client render we always
 * report `DEFAULT_LANG`. Only after the first client commit
 * (`mounted = true`) do we expose the localStorage-resolved value.
 * This keeps the server-rendered HTML and the first client paint
 * byte-identical, avoiding React's hydration mismatch warnings when
 * a returning user has FR or AR saved.
 */

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (path: string, vars?: Record<string, string | number>) => string;
};

const LangCtx = createContext<Ctx>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (path) => path,
});

const noopSubscribe = () => () => {};

export function LangProvider({ children }: { children: ReactNode }) {
  const { lang, setLang } = useLang();

  // false on server + during hydration; true after the first client
  // commit. We use this to swap the rendered language so the SSR HTML
  // stays consistent with the first client paint.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const effectiveLang: Lang = mounted ? lang : DEFAULT_LANG;

  // `t` keeps a stable identity per (lang) change so call sites can
  // depend on it in `useMemo`/`useEffect` deps lists without churn.
  const t = useCallback(
    (path: string, vars?: Record<string, string | number>) =>
      translate(path, effectiveLang, vars),
    [effectiveLang],
  );

  const value = useMemo(
    () => ({ lang: effectiveLang, setLang, t }),
    [effectiveLang, setLang, t],
  );

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

/**
 * Read the current language + translator. Always returns a working
 * `t` even outside the provider so accidental usage outside the tree
 * (e.g. tests without the provider mounted) doesn't crash — it just
 * echoes the path back.
 */
export function useT(): Ctx {
  return useContext(LangCtx);
}
