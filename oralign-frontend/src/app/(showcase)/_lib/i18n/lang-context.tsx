"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { DEFAULT_LANG, type Lang } from "./dict";
import { useLang } from "./use-lang";
import { localizedPathFor } from "../seo/routes";

type Ctx = { lang: Lang; setLang: (l: Lang) => void };

const LangCtx = createContext<Ctx>({ lang: DEFAULT_LANG, setLang: () => {} });

const noopSubscribe = () => () => {};

/**
 * Two modes:
 *  - default (French tree, blog, legal, created_for_you): the stored
 *    choice applies after hydration; SSR + first client paint render
 *    DEFAULT_LANG so hydration never mismatches.
 *  - `forced` (the /en and /ar trees): the URL owns the language — the
 *    stored preference is ignored so /ar/discover can never render in
 *    French under an Arabic canonical.
 *
 * In BOTH modes, switching languages on a page that has a localized
 * sibling URL (marketing pages) NAVIGATES to that URL, so the visitor
 * lands on the version search engines index for that language. Pages
 * without a sibling (blog, legal) keep the historical in-place toggle.
 */
export function LangProvider({
  children,
  forced,
}: {
  children: ReactNode;
  forced?: Lang;
}) {
  const { lang: stored, setLang: persist } = useLang();
  const pathname = usePathname();
  const router = useRouter();

  // false on server + during hydration; true after the first client commit.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const effectiveLang: Lang = forced ?? (mounted ? stored : DEFAULT_LANG);

  // Reflect the ACTIVE language (not the stored one) on <html> for
  // assistive tech + the RTL stylesheet hooks.
  useEffect(() => {
    document.documentElement.lang = effectiveLang;
    document.documentElement.dir = effectiveLang === "ar" ? "rtl" : "ltr";
  }, [effectiveLang]);

  const setLang = useCallback(
    (next: Lang) => {
      persist(next);
      const target = localizedPathFor(pathname, next);
      if (target && target !== pathname) router.push(target);
    },
    [persist, pathname, router],
  );

  return (
    <LangCtx.Provider value={{ lang: effectiveLang, setLang }}>
      {children}
    </LangCtx.Provider>
  );
}

export function useShowcaseLang(): Ctx {
  return useContext(LangCtx);
}

/**
 * Maps a French route (optionally with a #hash) to its sibling in the
 * ACTIVE language, falling back to the original href when no localized
 * version exists (blog, legal, auth). This is what keeps the /en and
 * /ar trees navigable: without it every chrome link would silently
 * bounce the visitor back to the French pages — and the localized URLs
 * would have zero internal links pointing at them.
 *
 * During SSR/hydration the active language is the tree's own language
 * (forced) or DEFAULT_LANG, so server and client render the same hrefs.
 */
export function useLocalizedHref(): (href: string) => string {
  const { lang } = useShowcaseLang();
  return useCallback(
    (href: string) => {
      const hashIndex = href.indexOf("#");
      const path = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
      const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
      const target = localizedPathFor(path, lang);
      return target ? `${target}${hash}` : href;
    },
    [lang],
  );
}
