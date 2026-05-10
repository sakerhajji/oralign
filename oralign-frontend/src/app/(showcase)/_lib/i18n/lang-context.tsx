"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_LANG, type Lang } from "./dict";
import { useLang } from "./use-lang";

type Ctx = { lang: Lang; setLang: (l: Lang) => void };

const LangCtx = createContext<Ctx>({ lang: DEFAULT_LANG, setLang: () => {} });

const noopSubscribe = () => () => {};

export function LangProvider({ children }: { children: ReactNode }) {
  const { lang, setLang } = useLang();

  // false on server + during hydration; true after the first client commit.
  // This keeps the initial client render identical to the server-rendered
  // HTML, avoiding hydration mismatches when localStorage holds a non-default
  // language.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const effectiveLang: Lang = mounted ? lang : DEFAULT_LANG;

  return (
    <LangCtx.Provider value={{ lang: effectiveLang, setLang }}>
      {children}
    </LangCtx.Provider>
  );
}

export function useShowcaseLang(): Ctx {
  return useContext(LangCtx);
}
