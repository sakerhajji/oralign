"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_ITEMS } from "../_lib/nav";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { MobileNav } from "./mobile-nav";

export function Header() {
  const { lang } = useShowcaseLang();
  const pathname = usePathname();
  const [active, setActive] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);

  /**
   * Nav items target homepage anchors (#indications, #how-it-works, …).
   * On the homepage itself we use the bare hash so Next.js / the browser
   * just smooth-scrolls. On every OTHER page (e.g. /created_for_you/<token>,
   * /login, /signup) we prepend "/" so clicking actually navigates back to
   * the homepage and then scrolls to the section. Without this prefix the
   * browser would just dump the hash onto the current URL and nothing
   * would happen.
   */
  const onHome = pathname === "/";
  const resolveAnchor = (hashHref: string): string =>
    hashHref.startsWith("#") && !onHome ? `/${hashHref}` : hashHref;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const ids = NAV_ITEMS.map((i) => i.href.replace("#", ""));
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => !!e);
    if (els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: [0, 0.2, 0.5] },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <header
      role="banner"
      className={[
        "sticky top-0 z-[300] bg-[var(--sc-white)] transition-shadow duration-300",
        scrolled
          ? "shadow-[0_1px_0_var(--sc-grey),0_8px_24px_-12px_rgba(10,10,10,0.10)]"
          : "border-b border-[var(--sc-grey)]",
      ].join(" ")}
    >
      <div className="relative mx-auto flex h-16 sm:h-[72px] lg:h-20 max-w-[1400px] items-center px-4 sm:px-6 lg:px-12">
        {/* Logo — absolute-centered on <lg, inline on lg+ */}
        <Link
          href="/"
          aria-label="Oralign — home"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:static lg:translate-x-0 lg:translate-y-0 flex shrink-0 items-center outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sc-sun)]"
        >
          <Image
            src="/ORALIGN BLACK.png"
            alt="Oralign"
            width={1240}
            height={880}
            priority
            sizes="(min-width: 1024px) 56px, (min-width: 640px) 48px, 40px"
            className="h-12 w-auto sm:h-12 lg:h-14"
          />
        </Link>

        {/* Desktop nav — only on lg+ */}
        <nav
          aria-label="Primary"
          className="mx-6 hidden flex-1 items-center justify-center lg:flex"
        >
          <ul className="flex list-none items-center gap-8 xl:gap-10">
            {NAV_ITEMS.map((item) => {
              const id = item.href.replace("#", "");
              const isActive = active === id;
              return (
                <li key={item.id}>
                  <Link
                    href={resolveAnchor(item.href)}
                    aria-current={isActive ? "true" : undefined}
                    className={[
                      "relative inline-block py-2 text-[0.62rem] uppercase tracking-[0.25em] no-underline transition-colors",
                      isActive
                        ? "text-[var(--sc-black)]"
                        : "text-[var(--sc-text-mid)] hover:text-[var(--sc-black)]",
                      "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sc-sun)]",
                    ].join(" ")}
                  >
                    <span>{dict.nav[item.labelKey][lang]}</span>
                    <span
                      aria-hidden="true"
                      className={[
                        "absolute -bottom-0.5 inset-x-0 h-px origin-left bg-[var(--sc-sun)] transition-transform duration-300",
                        isActive ? "scale-x-100" : "scale-x-0",
                      ].join(" ")}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Right cluster — Login + Book Demo on lg+ only; hamburger on <lg */}
        <div className="ms-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="hidden lg:inline-flex items-center px-3 py-2 text-[0.6rem] uppercase tracking-[0.28em] text-[var(--sc-text-mid)] no-underline transition-colors hover:text-[var(--sc-black)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-sun)]"
          >
            {dict.nav.login[lang]}
          </Link>
          <Link
            href={resolveAnchor("#cta")}
            className="hidden lg:inline-flex items-center bg-[var(--sc-sun)] px-5 py-3 text-[0.6rem] font-medium uppercase tracking-[0.28em] text-[var(--sc-black)] no-underline transition-colors hover:bg-[var(--sc-sun-2,#f9d96a)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sc-black)]"
          >
            {dict.nav.bookDemo[lang]}
          </Link>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
