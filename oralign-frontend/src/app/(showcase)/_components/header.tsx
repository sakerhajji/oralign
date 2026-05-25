"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  getShowcaseAudience,
  getShowcaseBasePath,
  getShowcaseNavItems,
} from "../_lib/nav";
import { dict } from "../_lib/i18n/dict";
import { useShowcaseLang } from "../_lib/i18n/lang-context";
import { MobileNav } from "./mobile-nav";

export function Header() {
  const { lang } = useShowcaseLang();
  const pathname = usePathname();
  const [active, setActive] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const audience = getShowcaseAudience(pathname);
  const basePath = getShowcaseBasePath(pathname);
  const navItems = useMemo(() => getShowcaseNavItems(pathname), [pathname]);
  const showAudienceNav = audience !== "chooser";

  /**
   * Patient and practitioner pages each own their anchors. If the user is on
   * another route, prefix the active audience path before the hash.
   */
  const resolveAnchor = (hashHref: string): string =>
    hashHref.startsWith("#") && pathname !== basePath ? `${basePath}${hashHref}` : hashHref;
  const ctaHref = audience === "practitioner" ? "/signup" : resolveAnchor("#cta");
  const ctaLabel =
    audience === "practitioner" ? dict.nav.createAccount[lang] : dict.nav.bookDemo[lang];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const ids = navItems.map((i) => i.href.replace("#", ""));
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
  }, [navItems]);

  return (
    <header
      role="banner"
      className={[
        "sticky top-0 z-[300] w-full max-w-full overflow-hidden bg-[var(--sc-white)] transition-shadow duration-300",
        scrolled
          ? "shadow-[0_1px_0_var(--sc-grey),0_8px_24px_-12px_rgba(10,10,10,0.10)]"
          : "border-b border-[var(--sc-grey)]",
      ].join(" ")}
    >
      <div className="relative mx-auto flex h-16 max-w-[1400px] items-center px-4 sm:h-[72px] sm:px-6 lg:h-20 lg:px-12">
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
          <ul className="flex list-none items-center gap-4 xl:gap-6">
            {navItems.map((item) => {
              const id = item.href.replace("#", "");
              const isActive = active === id;
              return (
                <li key={item.id}>
                  <Link
                    href={resolveAnchor(item.href)}
                    aria-current={isActive ? "true" : undefined}
                    className={[
                      "relative inline-block py-2 text-[0.6rem] uppercase tracking-[0.18em] no-underline transition-colors",
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
          {showAudienceNav ? (
            <Link
              href={ctaHref}
              className={[
                "hidden items-center px-5 py-3 text-[0.6rem] font-medium uppercase tracking-[0.28em] no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 lg:inline-flex",
                audience === "practitioner"
                  ? "bg-[var(--sc-black)] text-[var(--sc-white)] hover:bg-[rgba(25,25,25,0.82)] focus-visible:outline-[var(--sc-sun)]"
                  : "bg-[var(--sc-sun)] text-[var(--sc-black)] hover:bg-[var(--sc-sun-2,#f9d96a)] focus-visible:outline-[var(--sc-black)]",
              ].join(" ")}
            >
              {ctaLabel}
            </Link>
          ) : null}
          {showAudienceNav ? <MobileNav /> : null}
        </div>
      </div>
    </header>
  );
}
